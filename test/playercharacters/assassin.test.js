import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../../src/player.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const noHit = () => assert.fail('onHit should not be called');

function makeInput({ pressed = [] } = {}) {
  return {
    isDown: () => false,
    wasPressed: (c) => pressed.includes(c),
  };
}
const enemyAt = (x, y, over = {}) => ({ x, y, radius: 14, dead: false, ...over });
const assassin = () => createPlayer(500, 500, 'assassin');

// Presses the attack key, then plays the 0.12 s stab out in small steps like the real game loop does.
function stab(p, enemies, onHit) {
  updatePlayer(p, makeInput({ pressed: ['KeyJ'] }), 0.01, BOUNDS, enemies, onHit);
  for (let i = 0; i < 11; i++) updatePlayer(p, makeInput(), 0.01, BOUNDS, enemies, onHit);
}

test('assassin: initial state has no swing, no queued stab and no active dagger', () => {
  const p = assassin();
  assert.equal(p.swing, null);
  assert.equal(p.queued, null);
  assert.equal(p.side, null);
  assert.equal(p.swingCooldown, 0);
});

test('assassin: a stab lasts 0.12 s and is followed by 0.15 s endlag', () => {
  const p = assassin();
  updatePlayer(p, makeInput({ pressed: ['KeyJ'] }), 0.01, BOUNDS, [], noHit);
  assert.ok(p.swing);
  updatePlayer(p, makeInput(), 0.1, BOUNDS, [], noHit);
  assert.ok(p.swing, 'still stabbing at 0.11 s');
  updatePlayer(p, makeInput(), 0.02, BOUNDS, [], noHit);
  assert.equal(p.swing, null);
  assert.ok(p.swingCooldown > 0.1, 'endlag still running');
  updatePlayer(p, makeInput({ pressed: ['KeyJ'] }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.swing, null, 'same dagger is not ready yet');
  assert.ok(p.queued, 'but the press is remembered');
});

test('assassin: a queued stab fires as soon as the dagger is ready', () => {
  const p = assassin();
  updatePlayer(p, makeInput({ pressed: ['KeyJ'] }), 0.01, BOUNDS, [], noHit);
  updatePlayer(p, makeInput({ pressed: ['KeyJ'] }), 0.01, BOUNDS, [], noHit);
  updatePlayer(p, makeInput(), 0.3, BOUNDS, [], noHit); // stab and endlag run out
  updatePlayer(p, makeInput(), 0.01, BOUNDS, [], noHit);
  assert.ok(p.swing, 'queued stab should have started');
});

test('assassin: the dagger reaches an enemy 55 px ahead', () => {
  const p = assassin();
  let hits = 0;
  stab(p, [enemyAt(555, 500)], () => hits++);
  assert.equal(hits, 1);
});

test('assassin: each enemy is hit only once per stab', () => {
  const e = enemyAt(535, 500);
  const p = assassin();
  let hits = 0;
  stab(p, [e], () => hits++);
  assert.equal(hits, 1);
});

test('assassin: dead enemies are skipped', () => {
  const p = assassin();
  stab(p, [enemyAt(535, 500, { dead: true })], noHit);
});

test('assassin: a stab hits several enemies lined up in the thrust', () => {
  const p = assassin();
  const line = [enemyAt(530, 500), enemyAt(550, 500)];
  const hits = [];
  stab(p, line, (e) => hits.push(e));
  assert.equal(hits.length, 2);
});

test('assassin: knockback points away from the assassin and does 1 damage', () => {
  const p = assassin();
  let got = null;
  stab(p, [enemyAt(540, 500)], (_e, kx, ky, dmg) => { got = { kx, ky, dmg }; });
  assert.ok(got, 'enemy should be hit');
  assert.ok(got.kx > 0);
  assert.ok(Math.abs(got.ky) < 1e-9);
  assert.equal(got.dmg, 1);
});

test('assassin: the stab goes where the nearest enemy is', () => {
  const p = assassin();
  const below = enemyAt(500, 535); // 35 below the player, inside the aim range
  const hits = [];
  stab(p, [below], (e) => hits.push(e));
  assert.deepEqual(hits, [below]);
});

test('assassin: alternating presses alternate the daggers without waiting for endlag', () => {
  const p = assassin();
  const sides = [];
  for (let i = 0; i < 4; i++) {
    updatePlayer(p, makeInput(i % 2 === 0 ? { pressed: ['KeyJ'] } : { pressed: ['KeyK'] }), 0.01, BOUNDS, [], noHit);
    sides.push(Math.sign(p.swing.weapon.side));
    updatePlayer(p, makeInput(), 0.13, BOUNDS, [], noHit); // stab over, endlag running
  }
  assert.deepEqual(sides, [-1, 1, -1, 1]);
});

test('assassin: the dash cooldown is 0.4 s', () => {
  assert.equal(assassin().dashCooldownMax, 0.4);
});
