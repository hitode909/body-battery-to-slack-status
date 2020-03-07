import puppeteer from 'puppeteer';

function first<T>(arg: T[]): T {
  return arg[0];
}
function last<T>(arg: T[]): T {
  return arg[arg.length-1];
}
type Metrics = Array<[number, number]>;
const formatStatus = (args: {stress: {stressValuesArray: Metrics, bodyBatteryValuesArray: Metrics}, heartRate: {heartRateValues: Metrics}}): string => {
  const stress = last(last(args.stress.stressValuesArray));
  const bodyBattery = last(last(args.stress.bodyBatteryValuesArray));
  const heartRate = last(last(args.heartRate.heartRateValues));
  const date = new Date(first(last(args.heartRate.heartRateValues)));
  return `${date} bodyBattery: ${bodyBattery} stress: ${stress} heartRate: ${heartRate}`;
};

const main = async () => {
  const MAIL_ADDRESS = process.env['GARMIN_MAIL_ADDRESS'];
  if (!MAIL_ADDRESS) { console.warn('Please set GARMIN_MAIL_ADDRESS'); process.exit(1); }
  const PASSWORD = process.env['GARMIN_PASSWORD'];
  if (!PASSWORD) { console.warn('Please set GARMIN_PASSWORD'); process.exit(1); }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const url = 'https://connect.garmin.com/signin/';
  await page.goto(url, {waitUntil: 'networkidle0'});
  await page.screenshot({path: 'a-1.png'});
  await page.waitForSelector('iframe.gauth-iframe');
  await page.screenshot({path: 'a-2.png'});

  const frame = page.frames().find(f => f.url().match(/sso/));
  if (!frame) { console.warn('Login form not found'); process.exit(1); }
  await frame.waitForSelector('input#username');
  await frame.type('input#username', MAIL_ADDRESS);
  await frame.type('input#password', PASSWORD);
  await frame.click('#login-btn-signin');
  await page.waitForNavigation({waitUntil: 'networkidle0'});
  const today = new Date().toISOString().substr(0,10);
  await page.goto(`https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyStress/${today}`);
  const stress = JSON.parse(await page.evaluate(() => document.body.textContent) || 'null');
  await page.goto(`https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyHeartRate/?date=${today}`);
  const heartRate = JSON.parse(await page.evaluate(() => document.body.textContent) || 'null');
  console.log(formatStatus({stress, heartRate}));

  await browser.close();
};

main();
