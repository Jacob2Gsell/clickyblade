// Keys that keep working while a text field has focus.
const SHARED_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'Escape']);

// Keyboard state. Call endFrame() once per update tick to clear one-shot presses.
// The mouse is not used during play; it only drives the menus (plain DOM clicks).
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();

  window.addEventListener('keydown', (e) => {
    // Keys typed into a text field (the spell input) are not game input: no movement.
    // Shift (focus mode toggle) and Escape (pause) still count while the field has focus.
    const typing = e.target?.tagName === 'INPUT' && !SHARED_KEYS.has(e.code);
    if (typing) return;
    const k = e.code;
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (k === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    isDown: (code) => keys.has(code),
    wasPressed: (code) => pressed.has(code),
    endFrame() { pressed.clear(); },
  };
}
