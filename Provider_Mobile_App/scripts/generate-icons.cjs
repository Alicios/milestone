// Render the existing Milestone vector mark, without an external image service.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const assets = path.join(__dirname, '..', 'assets');
  const svg = await fs.readFile(path.join(assets, 'provider-icon.svg'), 'utf8');
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;width:1024px;height:1024px;background:#F4EACF">${svg}</body></html>`);
    await page.screenshot({ path: path.join(assets, 'icon.png') });
    await page.evaluate(() => { document.body.style.background = 'transparent'; });
    await page.screenshot({ path: path.join(assets, 'adaptive-icon.png'), omitBackground: true });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
