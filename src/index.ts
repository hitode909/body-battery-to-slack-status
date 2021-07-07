import request from 'request-promise';
import puppeteer1 from 'puppeteer';
import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

function sleep<T>(msec: number): Promise<T> {
  return new Promise(resolve => setTimeout(resolve, msec));
}
function last<T>(arg: T[] | null): T | null {
  return arg != null && arg.length > 0 ? arg[arg.length - 1] : null;
}

type Metrics = Array<[number, number]>;
type BodyBatteryMetrics = Array<[number, string, number, number]>;
interface Values {
  stress: { stressValuesArray: Metrics; bodyBatteryValuesArray: BodyBatteryMetrics };
  heartRate: { heartRateValues: Metrics };
}

class StatusUpdator {
  token: string;
  emojis: string | undefined;
  constructor(args: { slackLegacyToken: string; emojis: string | undefined }) {
    this.token = args.slackLegacyToken;
    this.emojis = args.emojis;
  }

  async update(values: Values) {
    const emoji = this.formatEmoji(values);
    const message = this.formatStatus(values);

    console.log(`Set Slack Status. emoji: ${emoji}, message: ${message}`);

    const res = await request('https://slack.com/api/users.profile.set', {
      method: 'POST',
      form: {
        token: this.token,
        profile: JSON.stringify({
          status_emoji: emoji,
          status_text: message,
        }),
      },
      json: true,
    });

    if (!res.ok) {
      throw new Error(JSON.stringify(res));
    }
  }

  formatEmoji(args: Values): string {
    const emojis = this.emojis || this.defaultEmojis;
    const emojiItems = emojis
      .split(/:|\s+/)
      .filter(s => s)
      .map(s => `:${s}:`);
    const bodyBatteryMetric = last(args.stress.bodyBatteryValuesArray);
    const bodyBattery = bodyBatteryMetric != null ? bodyBatteryMetric[2] : -1;
    const bodyBatteryMax = 100;
    const emoji = bodyBattery < 0 ? "?" :
      emojiItems[
        Math.floor((bodyBattery / bodyBatteryMax) * emojiItems.length)
      ];
    return emoji;
  }

  formatStatus(args: Values): string {
    const stress = last(last(args.stress.stressValuesArray));
    const bodyBatteryMetric = last(args.stress.bodyBatteryValuesArray);
    const bodyBattery = bodyBatteryMetric != null ? bodyBatteryMetric[2] : -1;
    const heartRate = last(last(args.heartRate.heartRateValues));

    return `🔋${bodyBattery} 🧠${stress} 💗${heartRate}`;
  }

  private get defaultEmojis(): string {
    return 'weary confounded persevere disappointed slightly_smiling_face wink sweat_smile smiley laughing star-struck';
  }
}

class AuthInfo {
  mailAddress: string;
  password: string;
  slackLegacyToken: string;
  emojis: string | undefined;
  constructor(
    mailAddress: string,
    password: string,
    slackLegacyToken: string,
    emojis: string | undefined
  ) {
    this.mailAddress = mailAddress;
    this.password = password;
    this.slackLegacyToken = slackLegacyToken;
    this.emojis = emojis;
  }
  static newFromEnv(): AuthInfo {
    const MAIL_ADDRESS = process.env['GARMIN_MAIL_ADDRESS'];
    if (!MAIL_ADDRESS) {
      throw new Error('Please set GARMIN_MAIL_ADDRESS');
    }
    const PASSWORD = process.env['GARMIN_PASSWORD'];
    if (!PASSWORD) {
      throw new Error('Please set GARMIN_PASSWORD');
    }
    const SLACK_LEGACY_TOKEN = process.env['SLACK_LEGACY_TOKEN'];
    if (!SLACK_LEGACY_TOKEN) {
      throw new Error('Please set SLACK_LEGACY_TOKEN');
    }
    return new AuthInfo(
      MAIL_ADDRESS,
      PASSWORD,
      SLACK_LEGACY_TOKEN,
      process.env['EMOJIS']
    );
  }
}

class Crawler {
  private authInfo: AuthInfo;
  private browser?: puppeteer1.Browser;
  private page?: puppeteer1.Page;
  loggedIn: boolean;
  constructor(authInfo: AuthInfo) {
    this.authInfo = authInfo;
    this.loggedIn = false;
  }
  private async getPage(): Promise<puppeteer1.Page> {
    if (!this.page) {
      this.browser = await puppeteer.launch({
        headless: !process.env['DEBUG'],
      });
      this.page = await this.browser.newPage();
    }
    return this.page;
  }
  async login() {
    console.log('Login to Garmin Connect');
    const page = await this.getPage();
    const url = 'https://connect.garmin.com/signin/';
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('iframe.gauth-iframe');

    const frame = page.frames().find(f => f.url().match(/sso/));
    if (!frame) {
      throw new Error('Login form not found');
    }
    await frame.waitForSelector('input#username');
    await frame.type('input#username', this.authInfo.mailAddress);
    await frame.type('input#password', this.authInfo.password);
    await frame.click('#login-btn-signin');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    this.loggedIn = true;
  }
  async getLatestValues(): Promise<Values> {
    const today = new Date().toISOString().substr(0, 10);
    return this.getLatestValuesReal(today, true);
  }
  async getLatestValuesReal(today: string, tryYesterday: boolean): Promise<Values> {
    const page = await this.getPage();
    const referer = `https://connect.garmin.com/modern/daily-summary/${today}`;
    page.setExtraHTTPHeaders({ "x-app-ver": "4.44.3.0", "referer": referer, "accept": "application/json, text/plain, */*", "nk": "NT",
      "sec-ch-ua": "\";Not\\A\"Brand\";v=\"99\", \"Chromium\";v=\"88\"",
      "sec-ch-ua-mobile": "?0",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetc-site": "same-origin"});
    await page.goto(
      `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyStress/${today}`
    );
    const stress = JSON.parse(
      (await page.evaluate(() => document.body.textContent)) || 'null'
    );
    if (stress.startTimestampGMT == null && tryYesterday) {
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return this.getLatestValuesReal(yesterday.toISOString().substr(0, 10), false);
    }
    await page.goto(
      `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyHeartRate/?date=${today}`
    );
    const heartRate = JSON.parse(
      (await page.evaluate(() => document.body.textContent)) || 'null'
    );
    return { stress, heartRate };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

const main = async () => {
  const auth = AuthInfo.newFromEnv();
  let crawler = new Crawler(auth);
  const su = new StatusUpdator(auth);

  if (process.env['CI']) {
    // run once
    try {
      await crawler.login();
      const status = await crawler.getLatestValues();
      await su.update(status);
      process.exit(0);
    } catch(error) {
      console.warn(error);
      process.exit(1);
    }
  } else {
    // daemon mode
    while (true) {
      try {
        console.log('Crawling');
        if (!crawler.loggedIn) await crawler.login();
        const status = await crawler.getLatestValues();
        await su.update(status);
      } catch (error) {
        console.warn(error);
        crawler.close();
        crawler = new Crawler(auth);
      }
      console.log('Sleep');
      await sleep(60 * 10 * 1000); // sleep 10 min
    }
  }
};

main();
