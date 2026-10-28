const {chromium} = require('playwright-core');
const os = require('node:os');
const path = require('node:path');

const launchOptions = {
  headless: true,
  ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'})
};

const screenshotPath = name => path.join(os.tmpdir(), name);

module.exports = {chromium, launchOptions, screenshotPath};
