import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

// Minimal EventTarget-style fake for window.
function fakeTarget(extra = {}) {
  const handlers = {};
  return {
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    fire: (type, ev = {}) => (handlers[type] ?? []).forEach((fn) => fn(ev)),
    ...extra,
  };
}

let win, savedWindow;
beforeEach(() => {
  savedWindow = globalThis.window;
  win = fakeTarget();
  globalThis.window = win;
});
afterEach(() => { globalThis.window = savedWindow; });

const key = (code, extra = {}) => ({ code, preventDefault() {}, ...extra });

test('isDown reflects keydown/keyup', () => {
  const input = createInput();
  win.fire('keydown', key('KeyW'));
  assert.equal(input.isDown('KeyW'), true);
  win.fire('keyup', { code: 'KeyW' });
  assert.equal(input.isDown('KeyW'), false);
});

test('wasPressed is true once until endFrame, ignoring key repeat', () => {
  const input = createInput();
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
  createInput();
  let prevented = 0;
  win.fire('keydown', key('Space', { preventDefault: () => prevented++ }));
  win.fire('keydown', key('KeyA', { preventDefault: () => prevented++ }));
  assert.equal(prevented, 1);
});

test('window blur releases all keys', () => {
  const input = createInput();
  win.fire('keydown', key('KeyD'));
  win.fire('blur');
  assert.equal(input.isDown('KeyD'), false);
});

test('letters typed into a text field are not game input, but keyup still releases them', () => {
  const input = createInput();
  const field = { tagName: 'INPUT' };
  win.fire('keydown', key('KeyW', { target: field }));
  assert.equal(input.isDown('KeyW'), false);
  assert.equal(input.wasPressed('KeyW'), false);
  win.fire('keydown', key('KeyD'));
  win.fire('keyup', { code: 'KeyD', target: field });
  assert.equal(input.isDown('KeyD'), false);
});

test('Shift and Escape still count while a text field has focus', () => {
  const input = createInput();
  const field = { tagName: 'INPUT' };
  win.fire('keydown', key('ShiftLeft', { target: field }));
  assert.equal(input.wasPressed('ShiftLeft'), true);
  win.fire('keydown', key('Escape', { target: field }));
  assert.equal(input.wasPressed('Escape'), true);
});

