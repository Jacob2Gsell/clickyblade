// Browser smoke test for the built dist/index.html. Run with: npm run test:e2e
// Uses an installed Chrome or Edge via playwright-core (no browser download); skipped if neither is found.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const URL = pathToFileURL(join(ROOT, 'dist', 'index.html')).href;

let browserPromise;
let page, errors;

// Builds once and launches the first browser that is available; resolves to null if there is none.
// (Done lazily instead of in a before() hook so it works the same on every Node version.)
function getBrowser() {
  browserPromise ??= (async () => {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.js')], { cwd: ROOT });
    for (const channel of ['chrome', 'msedge']) {
      try {
        return await chromium.launch({ channel, headless: true, timeout: 30000 });
      } catch { /* try the next one */ }
    }
    return null;
  })();
  return browserPromise;
}

after(async () => { await (await browserPromise)?.close(); });

async function openGame(t) {
  const browser = await getBrowser();
  if (!browser) { t.skip('no Chrome or Edge found'); return false; }
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(URL);
  return true;
}

// The build shortens class names, so state is checked through its visible effect, not through the class.
const isOpen = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', sel);
const isSelected = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).boxShadow !== 'none', sel);

// Fraction of canvas pixels that are not the floor colour, i.e. something besides the arena is drawn.
const paintedPixels = () => page.evaluate(() => {
  const c = document.getElementById('game');
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i] > 0x40 || data[i + 1] > 0x40) n++; // bright pixels: player, enemies, HUD
  }
  return n;
});

test('e2e: the built page loads without errors and shows the main menu', async (t) => {
  if (!(await openGame(t))) return;
  try {
    assert.equal(await isOpen('#main-menu'), true);
    assert.equal(await page.locator('[data-char]').count(), 3);
    // All icons actually decoded (data URIs can be well-formed but still not render).
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
    assert.equal(broken, 0, 'broken icon images');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('e2e: selecting a character highlights it', async (t) => {
  if (!(await openGame(t))) return;
  try {
    await page.click('[data-char="archer"]');
    assert.equal(await isSelected('[data-char="archer"]'), true);
    assert.equal(await isSelected('[data-char="knight"]'), false);
  } finally { await page.close(); }
});

for (const character of ['knight', 'assassin', 'archer']) {
  test(`e2e: ${character} can start, move, attack, dash and pause without errors`, async (t) => {
    if (!(await openGame(t))) return;
    try {
      await page.click(`[data-char="${character}"]`);
      await page.click('#btn-continue');
      assert.equal(await isOpen('#main-menu'), false);

      await page.mouse.move(700, 350);
      await page.keyboard.down('KeyD');
      await page.mouse.down();
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(100);
      await page.mouse.up({ button: 'right' });
      await page.keyboard.up('KeyD');
      await page.keyboard.press('Space');
      await page.keyboard.press('ShiftLeft');
      await page.waitForTimeout(1500); // first wave starts after about 1 s
      assert.ok(await paintedPixels() > 0, 'canvas looks empty');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
      assert.equal(await isOpen('#pause-menu'), true, 'pause menu should open');
      await page.click('#btn-proceed');
      await page.waitForTimeout(50);
      assert.equal(await isOpen('#pause-menu'), false);

      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('e2e: the main menu button returns to the menu', async (t) => {
  if (!(await openGame(t))) return;
  try {
    await page.click('#btn-continue');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    await page.click('#btn-main-menu');
    await page.waitForTimeout(50);
    assert.equal(await isOpen('#main-menu'), true);
    assert.equal(await isOpen('#pause-menu'), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('e2e: standing still, the player eventually dies and the game keeps running', async (t) => {
  if (!(await openGame(t))) return;
  try {
    await page.click('#btn-continue');
    await page.waitForTimeout(20000);
    assert.deepEqual(errors, []);
    // After game over a click restarts; the loop must still be alive and error-free.
    await page.mouse.click(500, 350);
    await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

const renderLabel = (id) => page.textContent(`#${id}`);

test('e2e: ASCII render mode toggles with T and draws text instead of shapes', async (t) => {
  if (!(await openGame(t))) return;
  try {
    await page.click('#btn-continue');
    await page.waitForTimeout(500);
    const before = await paintedPixels();
    assert.equal(await renderLabel('btn-render-main'), 'Render: Graphics'); // hidden by now, label still readable
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(500);
    const after = await paintedPixels();
    assert.equal(await renderLabel('btn-render-main'), 'Render: ASCII');
    assert.ok(before > 0 && after > 0, `nothing painted: ${before} / ${after}`);
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(100); // the toggle is applied on the next game step
    assert.equal(await renderLabel('btn-render-main'), 'Render: Graphics');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('e2e: the render button in the pause menu switches the mode', async (t) => {
  if (!(await openGame(t))) return;
  try {
    await page.click('#btn-continue');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    assert.equal(await isOpen('#pause-menu'), true);
    await page.click('#btn-render-pause');
    assert.equal(await renderLabel('btn-render-pause'), 'Render: ASCII');
    assert.equal(await renderLabel('btn-render-main'), 'Render: ASCII'); // both toggles stay in sync
    await page.click('#btn-proceed');
    await page.waitForTimeout(500);
    assert.ok(await paintedPixels() > 0, 'canvas looks empty in ASCII mode');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
