import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, CELL_W, CELL_H, charForLuma, buildGrid, createAsciiRenderer } from '../src/ascii.js';

test('charForLuma maps black to blank and white to the densest glyph', () => {
  assert.equal(charForLuma(0), ' ');
  assert.equal(charForLuma(255), RAMP[RAMP.length - 1]);
});

test('charForLuma clamps out-of-range values', () => {
  assert.equal(charForLuma(-50), ' ');
  assert.equal(charForLuma(1000), RAMP[RAMP.length - 1]);
});

test('charForLuma never gets darker as brightness rises', () => {
  let last = 0;
  for (let l = 0; l <= 255; l++) {
    const i = RAMP.indexOf(charForLuma(l));
    assert.ok(i >= last);
    last = i;
  }
});

test('buildGrid skips blank cells and keeps row-major positions', () => {
  // 2x2 cells: black, white / white, black
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 0, 0, 0, 255,
  ]);
  const cells = buildGrid(data, 2, 2);
  assert.deepEqual(cells.map((c) => [c.col, c.row]), [[1, 0], [0, 1]]);
  assert.equal(cells[0].ch, RAMP[RAMP.length - 1]);
});

test('buildGrid keeps the hue of a cell', () => {
  const cells = buildGrid(new Uint8ClampedArray([200, 0, 0, 255]), 1, 1);
  assert.equal(cells.length, 1);
  const [r, g, b] = cells[0].color.match(/\d+/g).map(Number);
  assert.ok(r > 0 && g === 0 && b === 0);
});

test('buildGrid returns no cells for an all-black or empty grid', () => {
  assert.deepEqual(buildGrid(new Uint8ClampedArray(4 * 4), 2, 2), []);
  assert.deepEqual(buildGrid(new Uint8ClampedArray(0), 0, 0), []);
});

test('buildGrid never produces a colour channel above 255', () => {
  const samples = [[200, 0, 0], [250, 240, 3], [255, 255, 255], [60, 5, 200], [40, 40, 40]];
  for (const [r, g, b] of samples) {
    const cells = buildGrid(new Uint8ClampedArray([r, g, b, 255]), 1, 1);
    for (const n of cells[0]?.color.match(/\d+/g).map(Number) ?? []) {
      assert.ok(n >= 0 && n <= 255, `channel ${n} out of range for ${r},${g},${b}`);
    }
  }
});

// drawAscii needs a scratch canvas and a target context. These fakes record what is drawn,
// so the renderer can be checked in Node without a browser.
function fakeContext() {
  return {
    calls: [], texts: [], pixels: new Uint8ClampedArray(0),
    fillStyle: null, font: '', textAlign: 'start', textBaseline: 'alphabetic', imageSmoothingQuality: 'low',
    clearRect(...a) { this.calls.push(['clearRect', ...a]); },
    drawImage(...a) { this.calls.push(['drawImage', ...a]); },
    fillRect(...a) { this.calls.push(['fillRect', ...a]); },
    fillText(ch, x, y) { this.texts.push({ ch, x, y, fill: this.fillStyle }); },
    getImageData() { return { data: this.pixels }; },
  };
}

// Runs `fn` with a stubbed document; `scratch` is the context of the renderer's internal canvas.
function withFakeDocument(fn) {
  const scratch = fakeContext();
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => scratch }) };
  try { return fn(scratch); } finally { delete globalThis.document; }
}

test('drawAscii sizes its scratch canvas to one pixel per cell, rounding up', () => {
  withFakeDocument((scratch) => {
    const draw = createAsciiRenderer();
    draw({ width: 20, height: 33 }, fakeContext());
    assert.deepEqual(scratch.calls.find((c) => c[0] === 'drawImage').slice(8),
      [20 / CELL_W, 33 / CELL_H]);
    assert.equal(scratch.calls.find((c) => c[0] === 'clearRect')[3], Math.ceil(20 / CELL_W));
  });
});

test('drawAscii paints the background, then one glyph at each non-blank cell centre', () => {
  withFakeDocument((scratch) => {
    const draw = createAsciiRenderer();
    const out = fakeContext();
    scratch.pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]); // 2x1 cells: black, white
    const src = { width: 2 * CELL_W, height: CELL_H };
    draw(src, out);
    assert.deepEqual(out.calls, [['fillRect', 0, 0, src.width, src.height]]);
    assert.equal(out.texts.length, 1);
    const { ch, x, y, fill } = out.texts[0];
    assert.equal(ch, RAMP[RAMP.length - 1]);
    assert.equal(x, (1 + 0.5) * CELL_W);
    assert.equal(y, 0.5 * CELL_H);
    assert.equal(fill, 'rgb(255,255,255)');
  });
});

test('drawAscii draws nothing but the background for an all-black frame', () => {
  withFakeDocument((scratch) => {
    const draw = createAsciiRenderer();
    const out = fakeContext();
    scratch.pixels = new Uint8ClampedArray(4 * 3);
    draw({ width: 3 * CELL_W, height: CELL_H }, out);
    assert.equal(out.texts.length, 0);
    assert.equal(out.calls.length, 1);
  });
});

test('drawAscii restores the text settings it changed', () => {
  withFakeDocument(() => {
    const draw = createAsciiRenderer();
    const out = fakeContext();
    draw({ width: CELL_W, height: CELL_H }, out);
    assert.equal(out.textAlign, 'left');
    assert.equal(out.textBaseline, 'alphabetic');
  });
});
