import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, charForLuma, buildGrid } from '../src/ascii.js';

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
