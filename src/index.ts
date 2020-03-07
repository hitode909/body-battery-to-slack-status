import puppeteer from 'puppeteer';

const main = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const url = 'https://connect.garmin.com/signin/';
  await page.goto(url);
  console.log(await page.title());

  await browser.close();
};

main();
