// Keyboard and mouse state. Call endFrame() once per update tick to clear one-shot presses.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, rightDown: false, clicked: false, rightClicked: false };

  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (k === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; mouse.rightDown = false; });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
    if (e.button === 2) { mouse.rightDown = true; mouse.rightClicked = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    isDown: (code) => keys.has(code),
    wasPressed: (code) => pressed.has(code),
    endFrame() { pressed.clear(); mouse.clicked = false; mouse.rightClicked = false; },
  };
}
