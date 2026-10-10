import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, isShielded, useShield } from '../../src/player.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const noHit = () => assert.fail('onHit should not be called');

function makeInput({ clicked = false, rightDown = false, rightClicked = false, pressed = [], mouse = {} } = {}) {
  return {
    mouse: { x: 600, y: 500, down: false, rightDown, clicked, rightClicked, ...mouse },
    isDown: () => false,
    wasPressed: (c) => pressed.includes(c),
  };
}

test('knight: holding right mouse raises the shield in front', () => {
  const p = createPlayer(500, 500, 'knight');
  updatePlayer(p, makeInput({ rightDown: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, true);
  assert.equal(isShielded(p, 1, 0), true);   // enemy in front (aim is to the right)
  assert.equal(isShielded(p, -1, 0), false); // enemy behind
});

test('knight: shield has 3 charges and breaks at 0', () => {
  const p = createPlayer(500, 500, 'knight');
  useShield(p);
  useShield(p);
  assert.equal(p.shield, 1);
  assert.equal(p.blocking, false);
  updatePlayer(p, makeInput({ rightDown: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, true);
  useShield(p);
  assert.equal(p.shield, 0);
  updatePlayer(p, makeInput({ rightDown: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, false);
});

test('knight: shield recovers one charge every 2 seconds, up to 3', () => {
  const p = createPlayer(500, 500, 'knight');
  useShield(p);
  useShield(p);
  updatePlayer(p, makeInput(), 1.9, BOUNDS, [], noHit);
  assert.equal(p.shield, 1);
  updatePlayer(p, makeInput(), 0.1, BOUNDS, [], noHit);
  assert.equal(p.shield, 2);
  updatePlayer(p, makeInput(), 10, BOUNDS, [], noHit);
  assert.equal(p.shield, 3);
});

test('assassin: never blocks', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, makeInput({ rightClicked: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, false);
});

test('assassin: left click swings the left dagger, right click the right one', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.swing.weapon.side < 0, true);
  const q = createPlayer(500, 500, 'assassin');
  updatePlayer(q, makeInput({ rightClicked: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(q.swing.weapon.side > 0, true);
});

test('assassin: if both are held, only the left dagger activates', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, makeInput({ clicked: true, rightClicked: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.swing.weapon.side < 0, true);
  assert.equal(p.side, 'left');
});

test('assassin: only one dagger swings at a time', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  const first = p.swing;
  updatePlayer(p, makeInput({ rightClicked: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.swing, first);
});

test('assassin: switching to the other dagger resets the endlag', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  updatePlayer(p, makeInput(), 0.12, BOUNDS, [], noHit); // left swing is over, its endlag is still running
  assert.equal(p.swing, null);
  assert.ok(p.swingCooldown > 0.1);
  updatePlayer(p, makeInput({ rightClicked: true }), 0.01, BOUNDS, [], noHit);
  assert.ok(p.swing, 'right dagger should swing right away');
  assert.ok(p.swing.weapon.side > 0);
});


test('assassin: a dagger thrust hits enemies in front, not ones beside the body', () => {
  const enemyAt = (x, y) => ({ x, y, radius: 14, dead: false });
  const beside = enemyAt(520, 470);
  const p = createPlayer(500, 500, 'assassin');
  let hits = [];
  // Left dagger thrusts forward; at the peak of the thrust its tip is 35 px ahead (x 535).
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [beside], (e) => hits.push(e));
  updatePlayer(p, makeInput(), 0.05, BOUNDS, [beside], (e) => hits.push(e));
  assert.equal(hits.length, 0, 'enemy beside the body should be missed');
  const front = enemyAt(525, 490);
  const q = createPlayer(500, 500, 'assassin');
  hits = [];
  updatePlayer(q, makeInput({ clicked: true }), 0.01, BOUNDS, [front], (e) => hits.push(e));
  updatePlayer(q, makeInput(), 0.05, BOUNDS, [front], (e) => hits.push(e));
  assert.equal(hits.length, 1, 'enemy in front should be hit');
});

test('assassin thrust hits 55 px out but not 140 px out', () => {
  const enemyAt = (x) => ({ x, y: 500, radius: 14, dead: false });
  const near = enemyAt(555); // 55 px in front, reached by the stab
  const far = enemyAt(640);  // 140 px in front, out of reach
  const p = createPlayer(500, 500, 'assassin');
  let hits = 0;
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [near, far], () => hits++);
  updatePlayer(p, makeInput(), 0.05, BOUNDS, [near, far], () => hits++);
  assert.equal(hits, 1);
});

test('dash cooldown: assassin recharges twice as fast as knight', () => {
  const knight = createPlayer(500, 500, 'knight');
  const assassin = createPlayer(500, 500, 'assassin');
  assert.equal(assassin.dashCooldownMax * 2, knight.dashCooldownMax);
  updatePlayer(knight, makeInput({ pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  updatePlayer(assassin, makeInput({ pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  assert.ok(Math.abs(assassin.dashCooldown * 2 - knight.dashCooldown) < 1e-9);
});
