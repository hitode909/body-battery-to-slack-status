import puppeteer from 'puppeteer';
import request from 'request-promise';


function sleep<T>(msec: number): Promise<T> {
  return new Promise(resolve => setTimeout(resolve, msec));
}
function first<T>(arg: T[]): T {
  return arg[0];
}
function last<T>(arg: T[]): T {
  return arg[arg.length - 1];
}

type Metrics = Array<[number, number]>;
interface Values {
  stress: { stressValuesArray: Metrics; bodyBatteryValuesArray: Metrics };
  heartRate: { heartRateValues: Metrics };
}

class StatusUpdator {
  token: string;
  constructor(token: { slackLegacyToken: string }) {
    this.token = token.slackLegacyToken;
  }

  async update(values: Values) {
    const emoji = this.formatEmoji(values);
    const message = this.formatStatus(values);
    const uri = 'https://slack.com/api/users.profile.set';
    const options = {
      method: 'POST',
      form: {
        token: this.token,
        profile: JSON.stringify({
          status_emoji: emoji,
          status_text: message,
        })
      },
    };

    console.log({emoji, message});

    const res = await request(uri, options);
    console.log(res);
  }

  formatEmoji(args: Values): string {
    const bodyBattery = last(last(args.stress.bodyBatteryValuesArray));
    return `:condition_${Math.floor(bodyBattery / 16)}:`;
  }

  formatStatus(args: Values): string {
    const stress = last(last(args.stress.stressValuesArray));
    const bodyBattery = last(last(args.stress.bodyBatteryValuesArray));
    const heartRate = last(last(args.heartRate.heartRateValues));
    // const date = new Date(first(last(args.heartRate.heartRateValues)));
    return `🔋${bodyBattery} 🧠${stress} 💗${heartRate}`;
  };
}


class AuthInfo {
  mailAddress: string;
  password: string;
  slackLegacyToken: string;
  constructor(mailAddress: string, password: string, slackLegacyToken: string) {
    this.mailAddress = mailAddress;
    this.password = password;
    this.slackLegacyToken = slackLegacyToken;
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
    return new AuthInfo(MAIL_ADDRESS, PASSWORD, SLACK_LEGACY_TOKEN);
  }
}

class Crawler {
  private authInfo: AuthInfo;
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  constructor(authInfo: AuthInfo) {
    this.authInfo = authInfo;
  }
  private async getPage(): Promise<puppeteer.Page> {
    if (!this.page) {
      this.browser = await puppeteer.launch({ headless: !process.env['DEBUG'] });
      this.page = await this.browser.newPage();
    }
    return this.page;
  }
  async login() {
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
  }
  async getLatestValues(): Promise<Values> {
    const page = await this.getPage();
    const today = new Date().toISOString().substr(0, 10);
    await page.goto(
      `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyStress/${today}`
    );
    const stress = JSON.parse(
      (await page.evaluate(() => document.body.textContent)) || 'null'
    );
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
  const crawler = new Crawler(auth);
  const su = new StatusUpdator(auth);
  await crawler.login();
  while (true) {
    try {
      const status = await crawler.getLatestValues();
      su.update(status);
    } catch (error) {
      console.warn(error);
      crawler.login();
    }
    await sleep(60 * 10 * 1000); // sleep 10 min
  }
};

main();
