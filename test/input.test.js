import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

// Minimal EventTarget-style fakes for window and canvas.
function fakeTarget(extra = {}) {
  const handlers = {};
  return {
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    fire: (type, ev = {}) => (handlers[type] ?? []).forEach((fn) => fn(ev)),
    ...extra,
  };
}

let win, canvas, savedWindow;
beforeEach(() => {
  savedWindow = globalThis.window;
  win = fakeTarget();
  canvas = fakeTarget({ getBoundingClientRect: () => ({ left: 10, top: 20 }) });
  globalThis.window = win;
});
afterEach(() => { globalThis.window = savedWindow; });

const key = (code, extra = {}) => ({ code, preventDefault() {}, ...extra });

test('isDown reflects keydown/keyup', () => {
  const input = createInput(canvas);
  win.fire('keydown', key('KeyW'));
  assert.equal(input.isDown('KeyW'), true);
  win.fire('keyup', { code: 'KeyW' });
  assert.equal(input.isDown('KeyW'), false);
});

test('wasPressed is true once until endFrame, ignoring key repeat', () => {
  const input = createInput(canvas);
  win.fire('keydown', key('KeyQ'));
  win.fire('keydown', key('KeyQ')); // auto-repeat
  assert.equal(input.wasPressed('KeyQ'), true);
  input.endFrame();
  assert.equal(input.wasPressed('KeyQ'), false);
  assert.equal(input.isDown('KeyQ'), true);
  win.fire('keydown', key('KeyQ'));
  assert.equal(input.wasPressed('KeyQ'), false); // still held, no new press
});

test('Space keydown calls preventDefault, other keys do not', () => {
  createInput(canvas);
  let prevented = 0;
  win.fire('keydown', key('Space', { preventDefault: () => prevented++ }));
  win.fire('keydown', key('KeyA', { preventDefault: () => prevented++ }));
  assert.equal(prevented, 1);
});

test('mousemove is converted to canvas-local coordinates', () => {
  const input = createInput(canvas);
  canvas.fire('mousemove', { clientX: 110, clientY: 70 });
  assert.equal(input.mouse.x, 100);
  assert.equal(input.mouse.y, 50);
});

test('left mouse button sets down and clicked; clicked clears on endFrame', () => {
  const input = createInput(canvas);
  canvas.fire('mousedown', { button: 0 });
  assert.equal(input.mouse.down, true);
  assert.equal(input.mouse.clicked, true);
  input.endFrame();
  assert.equal(input.mouse.clicked, false);
  assert.equal(input.mouse.down, true);
  win.fire('mouseup', { button: 0 });
  assert.equal(input.mouse.down, false);
});

test('other mouse buttons are ignored', () => {
  const input = createInput(canvas);
  canvas.fire('mousedown', { button: 2 });
  assert.equal(input.mouse.down, false);
  assert.equal(input.mouse.clicked, false);
});

test('window blur releases all keys and the mouse', () => {
  const input = createInput(canvas);
  win.fire('keydown', key('KeyD'));
  canvas.fire('mousedown', { button: 0 });
  win.fire('blur');
  assert.equal(input.isDown('KeyD'), false);
  assert.equal(input.mouse.down, false);
});

test('context menu is suppressed on the canvas', () => {
  createInput(canvas);
  let prevented = false;
  canvas.fire('contextmenu', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});
