#!/usr/bin/env node
/**
 * Capture README screenshots using Playwright.
 *
 * Usage:
 *   1. Load the demo dataset:     ./docs/demo-data/load.sh
 *   2. Start dev servers:         npm run dev:server  +  npm run dev:web
 *   3. Run this script:           node scripts/capture-screenshots.mjs
 *
 * Output: docs/screenshots/*.png
 *
 * Requires Playwright (`npm i -D playwright` at the root, `npx playwright install chromium`).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'screenshots');

const BASE_URL = process.env.WEB_URL || 'http://localhost:5173';

const SHOTS = [
  { name: 'dashboard.png',      url: '/',                       wait: 'h1, [data-testid="dashboard-title"]' },
  { name: 'chat-streaming.png', url: '/',                       wait: 'textarea', action: 'chat' },
  { name: 'metrics-list.png',   url: '/?view=metrics',          wait: 'h1, h2' },
  { name: 'query-skill-form.png', url: '/?view=querySkills',    wait: 'h1, h2' },
  { name: 'insights.png',       url: '/?view=insights',         wait: 'h1' },
  { name: 'agent-traces.png',   url: '/?view=agentTraces',      wait: 'h1' },
];

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const shot of SHOTS) {
  const target = `${BASE_URL}${shot.url}`;
  console.log(`→ ${shot.name}  (${target})`);
  await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });

  if (shot.wait) {
    try {
      await page.waitForSelector(shot.wait, { timeout: 5_000 });
    } catch {
      console.warn(`  warn: selector "${shot.wait}" not found`);
    }
  }

  if (shot.action === 'chat') {
    await page.fill('textarea', '上个月销售额是多少？');
    await page.click('button[type="submit"], button:has-text("发送")');
    // Wait for the first tool call or first text delta
    try {
      await page.waitForSelector('text=discover_schema, text=execute_sql', { timeout: 30_000 });
    } catch {
      console.warn('  warn: no tool call observed in 30s — capturing anyway');
    }
    // Let the UI settle for a few seconds of streaming
    await page.waitForTimeout(3_000);
  }

  const out = join(OUT_DIR, shot.name);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  ✅ ${out}`);
}

await browser.close();
console.log('\n🎉 all screenshots captured');