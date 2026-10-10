import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, isShielded, useShield } from '../../src/player.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const noHit = () => assert.fail('onHit should not be called');
const deg = (d) => (d * Math.PI) / 180;

function makeInput({ clicked = false, rightDown = false, mouse = {} } = {}) {
  return {
    mouse: { x: 600, y: 500, down: false, rightDown, clicked, rightClicked: false, ...mouse },
    isDown: () => false,
    wasPressed: () => false,
  };
}
const enemyAt = (x, y, over = {}) => ({ x, y, radius: 14, dead: false, ...over });
const knight = () => createPlayer(500, 500, 'knight');

test('knight: starts with a full shield, not blocking and no swing', () => {
  const p = knight();
  assert.equal(p.shield, 3);
  assert.equal(p.maxShield, 3);
  assert.equal(p.blocking, false);
  assert.equal(p.swing, null);
});

test('knight: isShielded needs the shield raised', () => {
  const p = knight();
  p.aim = 0;
  assert.equal(isShielded(p, 1, 0), false);
  p.blocking = true;
  assert.equal(isShielded(p, 1, 0), true);
});

test('knight: the shield covers 120 degrees, i.e. 60 degrees to each side', () => {
  const p = knight();
  p.aim = 0;
  p.blocking = true;
  const at = (d) => isShielded(p, Math.cos(deg(d)), Math.sin(deg(d)));
  assert.equal(at(0), true);
  assert.equal(at(59), true);
  assert.equal(at(-59), true);
  assert.equal(at(61), false);
  assert.equal(at(-61), false);
  assert.equal(at(180), false);
});

test('knight: the shield follows the aim', () => {
  const p = knight();
  p.aim = Math.PI / 2; // looking down
  p.blocking = true;
  assert.equal(isShielded(p, 0, 1), true);
  assert.equal(isShielded(p, 1, 0), false);
});

test('knight: releasing the right mouse button lowers the shield', () => {
  const p = knight();
  updatePlayer(p, makeInput({ rightDown: true }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, true);
  updatePlayer(p, makeInput({ rightDown: false }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.blocking, false);
});

test('knight: a broken shield stays down while right mouse is held, until a charge is back', () => {
  const p = knight();
  p.shield = 0;
  updatePlayer(p, makeInput({ rightDown: true }), 1.9, BOUNDS, [], noHit);
  assert.equal(p.blocking, false);
  updatePlayer(p, makeInput({ rightDown: true }), 0.1, BOUNDS, [], noHit);
  assert.equal(p.shield, 1);
  assert.equal(p.blocking, true);
});

test('knight: useShield never goes below zero', () => {
  const p = knight();
  for (let i = 0; i < 5; i++) useShield(p);
  assert.equal(p.shield, 0);
});

test('knight: regeneration progress is dropped while the shield is full', () => {
  const p = knight();
  updatePlayer(p, makeInput(), 5, BOUNDS, [], noHit);
  assert.equal(p.shieldRegen, 0);
  useShield(p);
  updatePlayer(p, makeInput(), 1.9, BOUNDS, [], noHit);
  assert.equal(p.shield, 2, 'a fresh 2 s countdown, not a stale one');
});

test('knight: the sword hits within its 120 degree arc, not outside it', () => {
  const inside = enemyAt(500 + Math.cos(deg(55)) * 50, 500 + Math.sin(deg(55)) * 50);
  const outside = enemyAt(500 + Math.cos(deg(80)) * 50, 500 + Math.sin(deg(80)) * 50);
  const p = knight(); // aims right
  const hits = [];
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [inside, outside], (e) => hits.push(e));
  assert.deepEqual(hits, [inside]);
});

test('knight: reach is 70 px plus the enemy radius', () => {
  const near = enemyAt(500 + 70 + 14 - 1, 500);
  const far = enemyAt(500 + 70 + 14 + 5, 500);
  const p = knight();
  const hits = [];
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [near, far], (e) => hits.push(e));
  assert.deepEqual(hits, [near]);
});

test('knight: a click during the swing is queued and starts the next swing right after', () => {
  const p = knight();
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  const first = p.swing;
  assert.ok(first);
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit); // queued, sword busy
  assert.equal(p.swing, first);
  assert.ok(p.queued);
  updatePlayer(p, makeInput(), 0.4, BOUNDS, [], noHit); // swing (0.15 s) and endlag (0.175 s) run out
  updatePlayer(p, makeInput(), 0.01, BOUNDS, [], noHit);
  assert.ok(p.swing && p.swing !== first, 'queued swing should have started');
  assert.equal(p.queued, null);
});

test('knight: holding the button does not swing again, only clicks do', () => {
  const p = knight();
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  updatePlayer(p, makeInput({ mouse: { down: true } }), 0.5, BOUNDS, [], noHit);
  assert.equal(p.swing, null);
  assert.equal(p.queued, null);
});

test('knight: every enemy is hit at most once per swing, even over several ticks', () => {
  const e = enemyAt(540, 500);
  const p = knight();
  let hits = 0;
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [e], () => hits++);
  updatePlayer(p, makeInput(), 0.01, BOUNDS, [e], () => hits++);
  updatePlayer(p, makeInput(), 0.01, BOUNDS, [e], () => hits++);
  assert.equal(hits, 1);
});

test('knight: the sword follows the aim during the swing', () => {
  const p = knight();
  updatePlayer(p, makeInput({ clicked: true }), 0.01, BOUNDS, [], noHit);
  updatePlayer(p, makeInput({ mouse: { x: 500, y: 700 } }), 0.01, BOUNDS, [], noHit);
  assert.ok(Math.abs(p.swing.aim - Math.PI / 2) < 1e-9);
});

test('knight: the dash cooldown is 0.8 s', () => {
  assert.equal(knight().dashCooldownMax, 0.8);
});
