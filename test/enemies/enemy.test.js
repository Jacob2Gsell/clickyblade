import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, createDasher, hitEnemy, updateEnemies } from '../../src/enemies/enemy.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const realRandom = Math.random;
let rnd;
beforeEach(() => { rnd = 0.5; Math.random = () => rnd; });
afterEach(() => { Math.random = realRandom; });

const mk = (over = {}) => ({
  x: 500, y: 500, radius: 14, speed: 100, hp: 2, maxHp: 2,
  kx: 0, ky: 0, stun: 0, flash: 0, dead: false, blockCd: 0, ...over,
});
const player = { x: 900, y: 500 };

test('createEnemy: small enemy stats scale with wave', () => {
  rnd = 0.99;
  const e = createEnemy(10, 20, 5);
  assert.equal(e.x, 10);
  assert.equal(e.y, 20);
  assert.equal(e.radius, 14);
  assert.equal(e.hp, 2);
  assert.equal(e.maxHp, 2);
  assert.equal(e.speed, 100 + 0.99 * 30 + 5 * 4);
  assert.equal(e.dead, false);
});

test('createEnemy: big enemy is slower, tougher and larger', () => {
  rnd = 0;
  const e = createEnemy(0, 0, 1);
  assert.equal(e.radius, 22);
  assert.equal(e.hp, 4);
  assert.equal(e.maxHp, 4);
  assert.equal(e.speed, 70);
});

test('createEnemy: big-enemy chance is capped at 35%', () => {
  rnd = 0.34;
  assert.equal(createEnemy(0, 0, 1000).radius, 22);
  rnd = 0.36;
  assert.equal(createEnemy(0, 0, 1000).radius, 14);
});

test('createEnemy: big-enemy chance grows with wave', () => {
  rnd = 0.12;
  assert.equal(createEnemy(0, 0, 0).radius, 14); // 10%
  assert.equal(createEnemy(0, 0, 1).radius, 22); // 13%
});

test('hitEnemy applies damage, knockback, stun and flash', () => {
  const e = mk();
  hitEnemy(e, 140, -70, 1);
  assert.equal(e.hp, 1);
  assert.equal(e.kx, 140);
  assert.equal(e.ky, -70);
  assert.equal(e.stun, 0.2);
  assert.equal(e.flash, 0.1);
  assert.equal(e.dead, false);
});

test('hitEnemy: heavier enemies are knocked back less', () => {
  const e = mk({ radius: 28 });
  hitEnemy(e, 100, 0, 1);
  assert.equal(e.kx, 50);
});

test('hitEnemy marks the enemy dead at 0 hp (and below)', () => {
  const a = mk({ hp: 1 });
  hitEnemy(a, 0, 0, 1);
  assert.equal(a.dead, true);
  const b = mk({ hp: 1 });
  hitEnemy(b, 0, 0, 5);
  assert.equal(b.dead, true);
});

test('updateEnemies: enemy chases the player', () => {
  const e = mk();
  updateEnemies([e], player, 0.1, BOUNDS);
  assert.ok(Math.abs(e.x - 510) < 1e-9);
  assert.equal(e.y, 500);
});

test('updateEnemies: stunned enemy does not chase but timers tick down', () => {
  const e = mk({ stun: 0.2, flash: 0.1 });
  updateEnemies([e], player, 0.05, BOUNDS);
  assert.equal(e.x, 500);
  assert.ok(Math.abs(e.stun - 0.15) < 1e-9);
  assert.ok(Math.abs(e.flash - 0.05) < 1e-9);
});

test('updateEnemies: stun and flash never go negative', () => {
  const e = mk({ stun: 0.01, flash: 0.01 });
  updateEnemies([e], player, 1, BOUNDS);
  assert.equal(e.stun, 0);
  assert.equal(e.flash, 0);
});

test('updateEnemies: knockback moves the enemy and decays', () => {
  const e = mk({ stun: 1, kx: 100 });
  updateEnemies([e], player, 0.1, BOUNDS);
  assert.ok(e.x > 500);
  assert.ok(e.kx < 100 && e.kx > 0);
});

test('updateEnemies: no NaN when enemy is exactly on top of the player', () => {
  const e = mk({ x: 900, y: 500 });
  updateEnemies([e], player, 0.1, BOUNDS);
  assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
});

test('updateEnemies: bounces off the left wall', () => {
  const e = mk({ x: 20, stun: 1, kx: -500 });
  updateEnemies([e], { x: 20, y: 500 }, 0.05, BOUNDS);
  assert.equal(e.x, 14);
  assert.ok(e.kx > 0);
});

test('updateEnemies: bounces off the right wall', () => {
  const e = mk({ x: 980, stun: 1, kx: 500 });
  updateEnemies([e], { x: 980, y: 500 }, 0.05, BOUNDS);
  assert.equal(e.x, 986);
  assert.ok(e.kx < 0);
});

test('updateEnemies: bounces off top and bottom walls', () => {
  const top = mk({ y: 20, stun: 1, ky: -500 });
  const bottom = mk({ x: 700, y: 980, stun: 1, ky: 500 });
  updateEnemies([top, bottom], { x: 500, y: 500 }, 0.05, BOUNDS);
  assert.equal(top.y, 14);
  assert.ok(top.ky > 0);
  assert.equal(bottom.y, 986);
  assert.ok(bottom.ky < 0);
});

test('updateEnemies: overlapping enemies are pushed apart', () => {
  const a = mk({ x: 400, y: 300, stun: 1 });
  const b = mk({ x: 410, y: 300, stun: 1 });
  updateEnemies([a, b], player, 0, BOUNDS);
  assert.ok(Math.abs(b.x - a.x - 28) < 1e-9);
  assert.ok(Math.abs((a.x + b.x) / 2 - 405) < 1e-9); // symmetric push
});

test('updateEnemies: non-overlapping enemies are left alone', () => {
  const a = mk({ x: 400, y: 300, stun: 1 });
  const b = mk({ x: 450, y: 300, stun: 1 });
  updateEnemies([a, b], player, 0, BOUNDS);
  assert.equal(a.x, 400);
  assert.equal(b.x, 450);
});

test('updateEnemies: identical positions do not blow up separation', () => {
  const a = mk({ x: 400, y: 300, stun: 1 });
  const b = mk({ x: 400, y: 300, stun: 1 });
  updateEnemies([a, b], player, 0, BOUNDS);
  assert.ok([a.x, a.y, b.x, b.y].every(Number.isFinite));
});

test('updateEnemies handles an empty list', () => {
  assert.doesNotThrow(() => updateEnemies([], player, 0.1, BOUNDS));
});

// Runs the simulation in fixed 10 ms steps for the given number of seconds.
const runFor = (e, target, seconds) => {
  for (let i = 0; i < Math.round(seconds / 0.01); i++) updateEnemies([e], target, 0.01, BOUNDS);
};

test('createDasher: yellow-style stats, starts in the stop phase', () => {
  const d = createDasher(10, 20);
  assert.equal(d.kind, 'dasher');
  assert.equal(d.x, 10);
  assert.equal(d.y, 20);
  assert.equal(d.radius, 14);
  assert.equal(d.hp, 2);
  assert.equal(d.dashing, false);
  assert.equal(d.stopTimer, 0.6);
});

test('dasher stands still for 0.6 s before it starts moving', () => {
  const d = createDasher(500, 500);
  runFor(d, player, 0.59);
  assert.equal(d.x, 500);
  assert.equal(d.y, 500);
  runFor(d, player, 0.1);
  assert.ok(d.x > 500);
});

test('dasher dashes for 0.2 s at fixed speed, then stops again', () => {
  const d = createDasher(100, 500);
  const far = { x: 990, y: 500 }; // far enough that the dash never reaches it
  runFor(d, far, 0.6); // stop phase ends
  const start = d.x;
  runFor(d, far, 0.2);
  const travelled = d.x - start;
  assert.ok(Math.abs(travelled - 120) < 2, `expected ~120px, got ${travelled}`);
  assert.equal(d.dashing, false);
  const resting = d.x;
  runFor(d, far, 0.3);
  assert.equal(d.x, resting);
});

test('dasher moves in a straight line to the point the player was at when the dash began', () => {
  const d = createDasher(500, 500);
  const target = { x: 900, y: 500 };
  runFor(d, target, 0.6); // the dash locks onto (900, 500)
  // Player moves away sideways during the dash; the dasher must ignore it.
  runFor(d, { x: 300, y: 900 }, 0.1);
  assert.equal(d.y, 500);
  assert.ok(d.x > 500);
});

test('dasher stops on the locked point instead of overshooting it', () => {
  const d = createDasher(500, 500);
  const target = { x: 530, y: 500 };
  runFor(d, target, 0.8); // stop phase plus full dash
  assert.equal(d.x, 530);
  assert.equal(d.y, 500);
});

test('stunned dasher does not move during a dash', () => {
  const d = createDasher(100, 500);
  runFor(d, { x: 990, y: 500 }, 0.6); // dash is about to start
  d.stun = 10;
  const before = d.x;
  runFor(d, { x: 990, y: 500 }, 0.2);
  assert.equal(d.x, before);
});
