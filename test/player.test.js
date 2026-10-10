import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, isPlayerVulnerable, hurtPlayer } from '../src/player.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };

function makeInput({ down = [], pressed = [], mouse = {} } = {}) {
  return {
    mouse: { x: 0, y: 0, down: false, clicked: false, ...mouse },
    isDown: (c) => down.includes(c),
    wasPressed: (c) => pressed.includes(c),
  };
}
const enemyAt = (x, y, over = {}) => ({ x, y, radius: 14, dead: false, ...over });
const noHit = () => assert.fail('onHit should not be called');

test('createPlayer: initial state', () => {
  const p = createPlayer(100, 200);
  assert.equal(p.x, 100);
  assert.equal(p.y, 200);
  assert.equal(p.hp, 5);
  assert.equal(p.maxHp, 5);
  assert.equal(p.swing, null);
  assert.equal(p.dash, null);
  assert.equal(p.invuln, 0);
  assert.deepEqual(p.trail, []);
});

test('aim points towards the mouse', () => {
  const p = createPlayer(100, 100);
  updatePlayer(p, makeInput({ mouse: { x: 100, y: 200 } }), 0.01, BOUNDS, [], noHit);
  assert.ok(Math.abs(p.aim - Math.PI / 2) < 1e-9);
});

test('WASD moves the player at base speed', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ down: ['KeyD'], mouse: { x: 500, y: 500 } }), 0.1, BOUNDS, [], noHit);
  assert.ok(Math.abs(p.x - 522) < 1e-9);
  assert.equal(p.y, 500);
  updatePlayer(p, makeInput({ down: ['KeyW'] }), 0.1, BOUNDS, [], noHit);
  assert.ok(Math.abs(p.y - 478) < 1e-9);
});

test('diagonal movement is not faster than straight movement', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ down: ['KeyD', 'KeyS'] }), 0.1, BOUNDS, [], noHit);
  assert.ok(Math.abs(Math.hypot(p.x - 500, p.y - 500) - 22) < 1e-9);
});

test('opposite keys cancel out', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ down: ['KeyA', 'KeyD'] }), 0.1, BOUNDS, [], noHit);
  assert.equal(p.x, 500);
});

test('player is clamped inside the arena', () => {
  const p = createPlayer(5, 5);
  updatePlayer(p, makeInput({ down: ['KeyA', 'KeyW'] }), 0.5, BOUNDS, [], noHit);
  assert.equal(p.x, 16);
  assert.equal(p.y, 16);
  const q = createPlayer(995, 995);
  updatePlayer(q, makeInput({ down: ['KeyD', 'KeyS'] }), 0.5, BOUNDS, [], noHit);
  assert.equal(q.x, 984);
  assert.equal(q.y, 984);
});

test('Space starts a dash in the movement direction and sets cooldown', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ down: ['KeyD'], pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  assert.ok(p.dash);
  assert.equal(p.dash.dx, 1);
  assert.equal(p.dash.dy, 0);
  assert.ok(p.x > 500 + 0.01 * 220); // faster than walking
  assert.ok(p.dashCooldown > 0.7);
  assert.equal(isPlayerVulnerable(p), false);
});

test('dash without movement keys goes towards the aim', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ pressed: ['Space'], mouse: { x: 500, y: 600 } }), 0.01, BOUNDS, [], noHit);
  assert.ok(Math.abs(p.dash.dx) < 1e-9);
  assert.ok(Math.abs(p.dash.dy - 1) < 1e-9);
});

test('dash ends after its duration and its trail fades out', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ down: ['KeyD'], pressed: ['Space'] }), 0.05, BOUNDS, [], noHit);
  assert.equal(p.trail.length, 1);
  for (let i = 0; i < 3; i++) updatePlayer(p, makeInput({ down: ['KeyD'] }), 0.05, BOUNDS, [], noHit);
  assert.equal(p.dash, null);
  for (let i = 0; i < 5; i++) updatePlayer(p, makeInput(), 0.05, BOUNDS, [], noHit);
  assert.equal(p.trail.length, 0);
});

test('dash cannot be used while on cooldown', () => {
  const p = createPlayer(500, 500);
  p.dashCooldown = 0.5;
  updatePlayer(p, makeInput({ pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.dash, null);
});

test('dash cooldown ticks down to zero and allows dashing again', () => {
  const p = createPlayer(500, 500);
  p.dashCooldown = 0.05;
  updatePlayer(p, makeInput(), 0.1, BOUNDS, [], noHit);
  assert.equal(p.dashCooldown, 0);
  updatePlayer(p, makeInput({ pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  assert.ok(p.dash);
});

test('mouse down starts a swing and sets the swing cooldown', () => {
  const p = createPlayer(500, 500);
  updatePlayer(p, makeInput({ mouse: { x: 600, y: 500, clicked: true } }), 0.01, BOUNDS, [], noHit);
  assert.ok(p.swing);
  assert.ok(p.swingCooldown > 0.3);
});

test('swing ends after its duration', () => {
  const p = createPlayer(500, 500);
  const inp = makeInput({ mouse: { x: 600, y: 500, clicked: true } });
  updatePlayer(p, inp, 0.1, BOUNDS, [], noHit);
  assert.ok(p.swing);
  updatePlayer(p, inp, 0.1, BOUNDS, [], noHit);
  assert.equal(p.swing, null);
});

test('swing hits an enemy in front once, with knockback away from the player', () => {
  const p = createPlayer(500, 500);
  const e = enemyAt(560, 500);
  const hits = [];
  const inp = makeInput({ mouse: { x: 700, y: 500, clicked: true } });
  updatePlayer(p, inp, 0.01, BOUNDS, [e], (...a) => hits.push(a));
  updatePlayer(p, inp, 0.01, BOUNDS, [e], (...a) => hits.push(a));
  assert.equal(hits.length, 1);
  const [target, kx, ky, dmg] = hits[0];
  assert.equal(target, e);
  assert.equal(kx, 600);
  assert.equal(ky, 0);
  assert.equal(dmg, 1);
});

test('swing misses enemies behind the player', () => {
  const p = createPlayer(500, 500);
  const e = enemyAt(440, 500);
  updatePlayer(p, makeInput({ mouse: { x: 700, y: 500, clicked: true } }), 0.01, BOUNDS, [e], noHit);
});

test('swing misses enemies out of reach', () => {
  const p = createPlayer(500, 500);
  const e = enemyAt(700, 500);
  updatePlayer(p, makeInput({ mouse: { x: 900, y: 500, clicked: true } }), 0.01, BOUNDS, [e], noHit);
});

test('swing hits enemies touching the player even outside the arc', () => {
  const p = createPlayer(500, 500);
  const e = enemyAt(480, 500); // behind, but overlapping the body
  let hit = 0;
  updatePlayer(p, makeInput({ mouse: { x: 700, y: 500, clicked: true } }), 0.01, BOUNDS, [e], () => hit++);
  assert.equal(hit, 1);
});

test('swing ignores dead enemies', () => {
  const p = createPlayer(500, 500);
  const e = enemyAt(560, 500, { dead: true });
  updatePlayer(p, makeInput({ mouse: { x: 700, y: 500, clicked: true } }), 0.01, BOUNDS, [e], noHit);
});

test('swing can hit several enemies in one swing', () => {
  const p = createPlayer(500, 500);
  const es = [enemyAt(560, 500), enemyAt(550, 520), enemyAt(550, 480)];
  let hit = 0;
  updatePlayer(p, makeInput({ mouse: { x: 700, y: 500, clicked: true } }), 0.01, BOUNDS, es, () => hit++);
  assert.equal(hit, 3);
});

test('no new swing while swing cooldown is active', () => {
  const p = createPlayer(500, 500);
  p.swingCooldown = 0.3;
  updatePlayer(p, makeInput({ mouse: { x: 700, y: 500, clicked: true } }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.swing, null);
});

test('isPlayerVulnerable / hurtPlayer', () => {
  const p = createPlayer(0, 0);
  assert.equal(isPlayerVulnerable(p), true);
  hurtPlayer(p, 2);
  assert.equal(p.hp, 3);
  assert.equal(p.invuln, 1);
  assert.equal(isPlayerVulnerable(p), false);
});

test('invulnerability wears off over time', () => {
  const p = createPlayer(500, 500);
  hurtPlayer(p, 1);
  updatePlayer(p, makeInput(), 0.6, BOUNDS, [], noHit);
  assert.equal(isPlayerVulnerable(p), false);
  updatePlayer(p, makeInput(), 0.6, BOUNDS, [], noHit);
  assert.equal(p.invuln, 0);
  assert.equal(isPlayerVulnerable(p), true);
});
