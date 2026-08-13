import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const profileRoot = '/tmp/chrome-user-root';
const videoDir = path.resolve('mockups/.video-tmp');
await fs.rm(videoDir, { recursive: true, force: true });
await fs.mkdir(videoDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileRoot, {
  headless: true,
  channel: 'chrome',
  args: ['--profile-directory=Profile 16'],
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } },
});

const page = await context.newPage();
await page.goto('http://localhost:8080/clinic/crm', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

await page.locator('text=Agenda teste').first().click();
await page.waitForTimeout(2500);

await page.getByRole('tab', { name: 'Propostas' }).click();
await page.waitForTimeout(2200);

await page.getByText('PROP-202604-138').last().click();
await page.waitForTimeout(5000);

// one more beat on the proposal modal
await page.waitForTimeout(3500);

await page.screenshot({ path: path.resolve('mockups/crm-propostas-poster.png') });
const videoPathPromise = page.video().path();
await context.close();
const recorded = await videoPathPromise;
const finalPath = path.resolve('mockups/crm-propostas-mockup.webm');
await fs.copyFile(recorded, finalPath);
console.log(finalPath);
