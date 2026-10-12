import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFocus, startFocus, endFocus, tickFocus, addBonus, applyPenalty, focusRatio, FOCUS_DURATION } from '../src/focus.js';

test('focus: every focus mode starts with 3 seconds', () => {
  const f = createFocus();
  startFocus(f);
  assert.equal(f.time, FOCUS_DURATION);
  assert.equal(FOCUS_DURATION, 3);
});

test('focus: the time runs out and tickFocus reports it', () => {
  const f = createFocus();
  startFocus(f);
  assert.equal(tickFocus(f, 1), false);
  assert.equal(f.time, 2);
  assert.equal(tickFocus(f, 2), true);
});

test('focus: bonus sequence is 1, 0.6, 0.2 and then 0.2 for every further spell', () => {
  const f = createFocus();
  startFocus(f);
  f.time = 0; // empty bar, so nothing gets cut off
  assert.equal(addBonus(f), 1);
  assert.equal(addBonus(f), 0.6);
  assert.equal(addBonus(f), 0.2);
  assert.equal(addBonus(f), 0.2);
  assert.equal(addBonus(f), 0.2);
});

test('focus: the time never goes above 3 seconds, the rest is cut off', () => {
  const f = createFocus();
  startFocus(f);
  f.time = 2.8;
  assert.equal(addBonus(f), 0.2, 'only the part that fits is added');
  assert.equal(f.time, 3);
  assert.equal(addBonus(f), 0, 'a full bar gains nothing');
  assert.equal(f.time, 3);
});

test('focus: a penalty takes 0.5 seconds away', () => {
  const f = createFocus();
  startFocus(f);
  assert.equal(applyPenalty(f), 0.5);
  assert.equal(f.time, 2.5);
});

test('focus: a penalty reports only the time that was really left, and can end the focus', () => {
  const f = createFocus();
  f.time = 0.2;
  assert.equal(applyPenalty(f), 0.2, 'not more than what is left');
  assert.equal(tickFocus(f, 0), true, 'the focus ends once the time is gone');
  f.time = 0;
  assert.equal(applyPenalty(f), 0, 'nothing is taken from an empty bar');
});

test('focus: several penalties in a row keep subtracting', () => {
  const f = createFocus();
  startFocus(f);
  applyPenalty(f);
  applyPenalty(f);
  assert.equal(f.time, 2);
});

test('focus: a bonus after a penalty brings the time back up, but never above the cap', () => {
  const f = createFocus();
  startFocus(f);
  applyPenalty(f);            // 2.5 s left
  assert.equal(addBonus(f), 0.5, 'first spell gives +1 s, but only 0.5 s fit below the cap');
  assert.equal(f.time, 3);
  assert.equal(addBonus(f), 0, 'the next spell adds nothing to a full bar');
  assert.equal(f.castCount, 2, 'the spell still counts for the sequence');
});

test('focus: endFocus empties the bar and restarts the bonus sequence', () => {
  const f = createFocus();
  startFocus(f);
  addBonus(f);
  endFocus(f);
  assert.equal(f.time, 0);
  assert.equal(f.castCount, 0);
});

test('focus: leaving focus mode resets the bonus sequence', () => {
  const f = createFocus();
  startFocus(f);
  f.time = 0;
  addBonus(f);
  addBonus(f);
  endFocus(f);
  startFocus(f);
  f.time = 0;
  assert.equal(addBonus(f), 1, 'the next focus mode starts again at +1 s');
});

test('focus: the bar ratio is the time left out of 3 seconds, clamped to 0..1', () => {
  const f = createFocus();
  f.time = 1.5;
  assert.equal(focusRatio(f), 0.5);
  f.time = -0.5;
  assert.equal(focusRatio(f), 0);
  f.time = 9;
  assert.equal(focusRatio(f), 1);
});
