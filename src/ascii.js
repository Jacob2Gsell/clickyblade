// ASCII render mode: the normal scene is drawn to an offscreen canvas, shrunk to one pixel per
// character cell and redrawn as text. Every existing draw call keeps working unchanged.
export const RAMP = ' .:-=+*#%@';
export const CELL_W = 8;
export const CELL_H = 16; // glyphs are about twice as tall as wide
const BACKGROUND = '#111';
const MAX_BOOST = 3;
const FLOOR_LUMA = 30; // the arena floor and its grid lines stay blank
const GAMMA = 0.55;    // lifts dim shapes that the downscaling would otherwise wash out

export function charForLuma(luma) {
  const t = Math.min(1, Math.max(0, (luma - FLOOR_LUMA) / (255 - FLOOR_LUMA)));
  return RAMP[Math.min(RAMP.length - 1, Math.floor(t ** GAMMA * RAMP.length))];
}

// RGBA pixels (one per cell, row-major) -> the non-blank cells as { col, row, ch, color }.
export function buildGrid(data, cols, rows) {
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const ch = charForLuma(0.299 * r + 0.587 * g + 0.114 * b);
      if (ch === ' ') continue;
      const boost = Math.min(MAX_BOOST, 255 / Math.max(r, g, b, 1));
      const color = `rgb(${Math.round(r * boost)},${Math.round(g * boost)},${Math.round(b * boost)})`;
      cells.push({ col, row, ch, color });
    }
  }
  return cells;
}

export function createAsciiRenderer() {
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });

  // Converts the `src` canvas to characters and paints them over the whole `out` context.
  return function drawAscii(src, out) {
    const cols = Math.ceil(src.width / CELL_W);
    const rows = Math.ceil(src.height / CELL_H);
    if (small.width !== cols || small.height !== rows) {
      small.width = cols;
      small.height = rows;
    }
    sctx.clearRect(0, 0, cols, rows);
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width / CELL_W, src.height / CELL_H);
    const cells = buildGrid(sctx.getImageData(0, 0, cols, rows).data, cols, rows);

    out.fillStyle = BACKGROUND;
    out.fillRect(0, 0, src.width, src.height);
    out.font = `bold ${CELL_H - 2}px monospace`;
    out.textAlign = 'center';
    out.textBaseline = 'middle';
    for (const c of cells) {
      out.fillStyle = c.color;
      out.fillText(c.ch, (c.col + 0.5) * CELL_W, (c.row + 0.5) * CELL_H);
    }
    out.textAlign = 'left';
    out.textBaseline = 'alphabetic';
  };
}
