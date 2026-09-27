#!/usr/bin/env node
// Screenshot helper for visual QA (uses the locally installed Google Chrome via playwright-core).
//
//   node scripts/shot.mjs --url "http://localhost:5173/?only=projects" --out shots/projects.png
//   options: --width 1440 --height 900 --full --mobile --scroll 1200 --scrollTo "#resume"
//            --wait 1200 --click "button[aria-label=Open]" --hover ".card" --eval "js code"
//            --dark (default) --steps "scroll:600,wait:400,shot:shots/a.png,scroll:1200,shot:shots/b.png"
// Prints console errors / page errors so you can catch runtime crashes.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const url = opt('url', 'http://localhost:5173/');
const out = opt('out', 'shots/shot.png');
const mobile = !!opt('mobile', false);
const width = Number(opt('width', mobile ? 390 : 1440));
const height = Number(opt('height', mobile ? 844 : 900));
const wait = Number(opt('wait', 1500));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: opt('reduced', false) ? 'reduce' : 'no-preference',
});
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => problems.push(`[goto] ${e.message}`));
await page.waitForTimeout(wait);

const shoot = async (file, full) => {
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: !!full });
  console.log(`saved ${file}`);
};

const steps = opt('steps', '');
if (typeof steps === 'string' && steps) {
  for (const step of steps.split(',')) {
    const [kind, ...rest] = step.split(':');
    const val = rest.join(':');
    if (kind === 'scroll') await page.mouse.wheel(0, Number(val));
    else if (kind === 'scrollTo') await page.evaluate((y) => window.scrollTo(0, Number(y)), val);
    else if (kind === 'wait') await page.waitForTimeout(Number(val));
    else if (kind === 'click') await page.click(val).catch((e) => problems.push(`[click] ${e.message}`));
    else if (kind === 'hover') await page.hover(val).catch((e) => problems.push(`[hover] ${e.message}`));
    else if (kind === 'shot') await shoot(val, false);
    else if (kind === 'fullshot') await shoot(val, true);
    await page.waitForTimeout(150);
  }
} else {
  const scrollTo = opt('scrollTo', '');
  if (scrollTo) {
    await page
      .evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scrollTo)
      .catch((e) => problems.push(`[scrollTo] ${e.message}`));
    await page.waitForTimeout(900);
  }
  const scroll = Number(opt('scroll', 0));
  if (scroll) {
    await page.mouse.wheel(0, scroll);
    await page.waitForTimeout(900);
  }
  const hover = opt('hover', '');
  if (hover) await page.hover(hover).catch((e) => problems.push(`[hover] ${e.message}`));
  const click = opt('click', '');
  if (click) await page.click(click).catch((e) => problems.push(`[click] ${e.message}`));
  const ev = opt('eval', '');
  if (ev) console.log('eval →', await page.evaluate(ev).catch((e) => `ERR ${e.message}`));
  if (hover || click) await page.waitForTimeout(700);
  await shoot(out, opt('full', false));
}

if (problems.length) {
  console.log('\n--- page problems ---');
  for (const p of problems.slice(0, 40)) console.log(p);
} else console.log('no console errors');
await browser.close();
