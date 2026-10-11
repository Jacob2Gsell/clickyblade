import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/player.js';
import {
  createWaves, advanceWaves, waveSize, spawnInterval, isDasherSpawn, spawnPoint,
  resolveContacts, removeDead, advanceTime,
  SLOWMO_SCALE, HITSTOP_SCALE, HITSTOP_HIT, HITSTOP_HURT,
  SHIELD_KNOCKBACK, BLOCK_COOLDOWN, FIRST_WAVE_PAUSE, WAVE_PAUSE,
} from '../src/rules.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const enemyAt = (x, y, over = {}) => ({
  x, y, radius: 14, dead: false, kx: 0, ky: 0, stun: 0, blockCd: 0, hp: 2, maxHp: 2, ...over,
});
const freshFx = () => ({ shake: 0, hitstop: 0 });

// ---- waves ----

test('waveSize grows by two enemies per wave', () => {
  assert.equal(waveSize(1), 5);
  assert.equal(waveSize(2), 7);
  assert.equal(waveSize(10), 23);
});

test('spawnInterval shrinks with the wave but never below 0.15 s', () => {
  close(spawnInterval(1), 0.56);
  assert.ok(spawnInterval(5) < spawnInterval(1));
  assert.equal(spawnInterval(50), 0.15);
});

test('isDasherSpawn: never before wave 2, then only for rolls below 25%', () => {
  assert.equal(isDasherSpawn(1, 0), false);
  assert.equal(isDasherSpawn(2, 0.24), true);
  assert.equal(isDasherSpawn(2, 0.25), false);
  assert.equal(isDasherSpawn(9, 0.99), false);
});

test('spawnPoint: every point lies on the arena edge', () => {
  const b = { x: 20, y: 20, w: 960, h: 560 };
  assert.deepEqual(spawnPoint(b, 0, 0.5), { x: 500, y: 20 });   // top
  assert.deepEqual(spawnPoint(b, 1, 0.5), { x: 500, y: 580 });  // bottom
  assert.deepEqual(spawnPoint(b, 2, 0.5), { x: 20, y: 300 });   // left
  assert.deepEqual(spawnPoint(b, 3, 0.5), { x: 980, y: 300 });  // right
  for (let side = 0; side < 4; side++) {
    for (const r of [0, 0.3, 0.999]) {
      const { x, y } = spawnPoint(b, side, r);
      assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      assert.ok(x === b.x || x === b.x + b.w || y === b.y || y === b.y + b.h, 'not on the edge');
    }
  }
});

test('waves: the first wave starts after the initial pause', () => {
  const s = createWaves();
  assert.equal(s.wave, 0);
  advanceWaves(s, 0, FIRST_WAVE_PAUSE - 0.1);
  assert.equal(s.wave, 0);
  advanceWaves(s, 0, 0.1);
  assert.equal(s.wave, 1);
  assert.equal(s.spawnQueue, waveSize(1) - 1, 'first enemy spawns right away');
});

test('waves: exactly waveSize enemies are spawned per wave', () => {
  const s = createWaves();
  let spawned = 0;
  // Spawned enemies stay alive, so no second wave begins.
  for (let t = 0; t < 10; t += 0.01) {
    if (advanceWaves(s, spawned, 0.01)) spawned++;
  }
  assert.equal(spawned, waveSize(1));
  assert.equal(s.wave, 1);
});

test('waves: no new wave while enemies are alive or still queued', () => {
  const s = createWaves();
  s.wave = 3;
  s.wavePause = 0;
  advanceWaves(s, 4, 1);
  assert.equal(s.wave, 3, 'enemies alive');
  s.spawnQueue = 2;
  advanceWaves(s, 0, 1);
  assert.equal(s.wave, 3, 'enemies queued');
});

test('waves: after a cleared wave there is a pause before the next one', () => {
  const s = createWaves();
  s.wave = 1;
  s.wavePause = WAVE_PAUSE;
  advanceWaves(s, 0, WAVE_PAUSE - 0.25);
  assert.equal(s.wave, 1);
  advanceWaves(s, 0, 0.5);
  assert.equal(s.wave, 2);
  assert.equal(s.wavePause, WAVE_PAUSE);
});

test('waves: a huge dt starts at most one wave and spawns at most one enemy', () => {
  const s = createWaves();
  assert.equal(advanceWaves(s, 0, 100), true);
  assert.equal(s.wave, 1);
  assert.equal(s.spawnQueue, waveSize(1) - 1);
});

// ---- contact ----

test('resolveContacts: no contact, nothing happens', () => {
  const p = createPlayer(500, 500, 'knight');
  const fx = freshFx();
  assert.equal(resolveContacts(p, [enemyAt(600, 500)], fx), false);
  assert.equal(p.hp, p.maxHp);
  assert.deepEqual(fx, freshFx());
});

test('resolveContacts: touching enemy hurts the player, shakes and shoves the enemy away', () => {
  const p = createPlayer(500, 500, 'knight');
  const e = enemyAt(510, 500);
  const fx = freshFx();
  assert.equal(resolveContacts(p, [e], fx), false);
  assert.equal(p.hp, p.maxHp - 1);
  assert.ok(p.invuln > 0);
  assert.equal(fx.shake, 4);
  assert.equal(fx.hitstop, HITSTOP_HURT);
  assert.equal(e.kx, 300);
  assert.equal(e.ky, 0);
});

test('resolveContacts: only one hit per invulnerability window', () => {
  const p = createPlayer(500, 500, 'knight');
  const enemies = [enemyAt(510, 500), enemyAt(490, 500)];
  resolveContacts(p, enemies, freshFx());
  resolveContacts(p, enemies, freshFx());
  assert.equal(p.hp, p.maxHp - 1);
});

test('resolveContacts: a dashing player is not hurt', () => {
  const p = createPlayer(500, 500, 'knight');
  p.dash = { t: 0.1, dx: 1, dy: 0 };
  resolveContacts(p, [enemyAt(510, 500)], freshFx());
  assert.equal(p.hp, p.maxHp);
});

test('resolveContacts: dead enemies are ignored', () => {
  const p = createPlayer(500, 500, 'knight');
  resolveContacts(p, [enemyAt(510, 500, { dead: true })], freshFx());
  assert.equal(p.hp, p.maxHp);
});

test('resolveContacts: the last hit point means game over', () => {
  const p = createPlayer(500, 500, 'knight');
  p.hp = 1;
  assert.equal(resolveContacts(p, [enemyAt(510, 500)], freshFx()), true);
  assert.equal(p.hp, 0);
});

test('resolveContacts: enemy exactly on the player does not produce NaN', () => {
  const p = createPlayer(500, 500, 'knight');
  const e = enemyAt(500, 500);
  resolveContacts(p, [e], freshFx());
  assert.ok(Number.isFinite(e.kx) && Number.isFinite(e.ky));
  assert.equal(p.hp, p.maxHp - 1);
});

test('resolveContacts: an enemy in front of the raised shield is blocked, not hurting', () => {
  const p = createPlayer(500, 500, 'knight');
  p.aim = 0;
  p.blocking = true;
  const e = enemyAt(520, 500);
  const fx = freshFx();
  resolveContacts(p, [e], fx);
  assert.equal(p.hp, p.maxHp);
  assert.equal(p.shield, p.maxShield - 1);
  assert.equal(e.blockCd, BLOCK_COOLDOWN);
  assert.ok(e.kx > 0, 'thrown back, away from the player');
  assert.ok(e.stun > 0);
  assert.equal(fx.shake, 5);
  assert.equal(fx.hitstop, HITSTOP_HIT);
  assert.ok(Math.hypot(e.kx, e.ky) <= SHIELD_KNOCKBACK, 'heavier enemies are pushed less, never more');
});

test('resolveContacts: the same enemy uses up only one charge during its block cooldown', () => {
  const p = createPlayer(500, 500, 'knight');
  p.aim = 0;
  p.blocking = true;
  const e = enemyAt(520, 500);
  resolveContacts(p, [e], freshFx());
  resolveContacts(p, [e], freshFx());
  resolveContacts(p, [e], freshFx());
  assert.equal(p.shield, p.maxShield - 1);
  assert.equal(p.hp, p.maxHp, 'still no damage while blocked');
});

test('resolveContacts: an enemy behind the shield still hurts', () => {
  const p = createPlayer(500, 500, 'knight');
  p.aim = 0;
  p.blocking = true;
  resolveContacts(p, [enemyAt(480, 500)], freshFx());
  assert.equal(p.hp, p.maxHp - 1);
  assert.equal(p.shield, p.maxShield);
});

test('resolveContacts: the shield breaks after its last charge and then no longer blocks', () => {
  const p = createPlayer(500, 500, 'knight');
  p.aim = 0;
  p.blocking = true;
  p.shield = 1;
  resolveContacts(p, [enemyAt(520, 500)], freshFx());
  assert.equal(p.shield, 0);
  assert.equal(p.blocking, false);
  resolveContacts(p, [enemyAt(520, 500)], freshFx());
  assert.equal(p.hp, p.maxHp - 1);
});

test('resolveContacts: a block never lowers an existing shake or hitstop', () => {
  const p = createPlayer(500, 500, 'knight');
  p.aim = 0;
  p.blocking = true;
  const fx = { shake: 9, hitstop: 1 };
  resolveContacts(p, [enemyAt(520, 500)], fx);
  assert.equal(fx.shake, 9);
  assert.equal(fx.hitstop, 1);
});

// ---- cleanup ----

test('removeDead: separates dead enemies and counts them', () => {
  const a = enemyAt(0, 0), b = enemyAt(0, 0, { dead: true }), c = enemyAt(0, 0, { dead: true });
  const { alive, killed } = removeDead([a, b, c]);
  assert.deepEqual(alive, [a]);
  assert.equal(killed, 2);
  assert.deepEqual(removeDead([]), { alive: [], killed: 0 });
});

// ---- time scale ----

test('advanceTime: at normal speed one step is one step', () => {
  const fx = { timeScale: 1, hitstop: 0 };
  close(advanceTime(fx, false, 1 / 120), 1 / 120);
  assert.equal(fx.timeScale, 1);
});

test('advanceTime: slow motion eases down to SLOWMO_SCALE and back up', () => {
  const fx = { timeScale: 1, hitstop: 0 };
  const step = 1 / 120;
  let prev = 1;
  for (let i = 0; i < 600; i++) {
    advanceTime(fx, true, step);
    assert.ok(fx.timeScale <= prev + 1e-12 && fx.timeScale >= SLOWMO_SCALE - 1e-9);
    prev = fx.timeScale;
  }
  close(fx.timeScale, SLOWMO_SCALE, 1e-3);
  for (let i = 0; i < 600; i++) advanceTime(fx, false, step);
  close(fx.timeScale, 1, 1e-3);
});

test('advanceTime: hitstop slows the game to a crawl and counts down in real time', () => {
  const fx = { timeScale: 1, hitstop: 0.02 };
  const step = 1 / 120;
  close(advanceTime(fx, false, step), step * HITSTOP_SCALE);
  close(fx.hitstop, 0.02 - step);
  for (let i = 0; i < 10; i++) advanceTime(fx, false, step);
  assert.equal(fx.hitstop, 0);
  close(advanceTime(fx, false, step), step);
});

test('waves: cleared is raised exactly once per finished wave, never before wave 1', () => {
  const s = createWaves();
  advanceWaves(s, 0, 0.5);
  assert.equal(s.cleared, false, 'nothing cleared before the first wave');
  advanceWaves(s, 0, FIRST_WAVE_PAUSE); // wave 1 starts
  assert.equal(s.wave, 1);
  assert.equal(s.cleared, false);
  for (let i = 0; i < 100; i++) advanceWaves(s, 1, 0.1); // whole wave spawns while enemies live
  assert.equal(s.cleared, false);
  advanceWaves(s, 0, 0.01); // field is clear
  assert.equal(s.cleared, true);
  s.cleared = false;
  advanceWaves(s, 0, 0.01);
  assert.equal(s.cleared, false, 'not raised again for the same wave');
});
