import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnDamageNumber, updateDamageNumbers, drawDamageNumbers,
  DAMAGE_NUMBER_LIFE, DAMAGE_NUMBER_RISE, DAMAGE_NUMBER_LIFT,
} from '../src/damage-numbers.js';

const enemy = { x: 300, y: 400, radius: 14 };

test('spawnDamageNumber: starts above the enemy with the taken amount', () => {
  const list = [];
  spawnDamageNumber(list, enemy, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].x, 300);
  assert.equal(list[0].y0, 400 - 14 - DAMAGE_NUMBER_LIFT);
  assert.equal(list[0].text, '1');
});

test('spawnDamageNumber: keeps one decimal for fractional damage', () => {
  const list = [];
  spawnDamageNumber(list, enemy, 1.5);
  assert.equal(list[0].text, '1.5');
});

test('spawnDamageNumber: hits on the same spot get their own horizontal lane', () => {
  const list = [];
  spawnDamageNumber(list, enemy, 1);
  spawnDamageNumber(list, enemy, 1);
  spawnDamageNumber(list, enemy, 1);
  const xs = list.map((p) => p.x);
  assert.equal(new Set(xs).size, 3, `lanes should differ, got ${xs}`);
});

test('updateDamageNumbers: keeps the number until its life is over, then removes it', () => {
  const list = [];
  spawnDamageNumber(list, enemy, 1);
  updateDamageNumbers(list, DAMAGE_NUMBER_LIFE / 2);
  assert.equal(list.length, 1);
  updateDamageNumbers(list, DAMAGE_NUMBER_LIFE);
  assert.equal(list.length, 0);
});

test('drawDamageNumbers: fades from opaque to transparent and rises', () => {
  const list = [];
  spawnDamageNumber(list, enemy, 1);
  const calls = [];
  const ctx = {
    save() {}, restore() {},
    globalAlpha: 1,
    fillText(text, x, y) { calls.push({ text, x, y, alpha: this.globalAlpha }); },
  };

  drawDamageNumbers(ctx, list);
  updateDamageNumbers(list, DAMAGE_NUMBER_LIFE / 2);
  drawDamageNumbers(ctx, list);

  assert.equal(calls[0].alpha, 1);
  assert.ok(Math.abs(calls[1].alpha - 0.5) < 1e-9);
  assert.ok(calls[1].y < calls[0].y, 'number moved up');
  assert.ok(calls[0].y - calls[1].y <= DAMAGE_NUMBER_RISE);
});
