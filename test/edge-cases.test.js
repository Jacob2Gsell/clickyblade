import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, normalize, angleDiff } from '../src/math.js';
import { createPlayer, updatePlayer, hurtPlayer, isPlayerVulnerable } from '../src/player.js';
import { createEnemy, createDasher, hitEnemy, shoveEnemy, updateEnemies } from '../src/enemies/enemy.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const noHit = () => {};
const input = ({ down = [], pressed = [], mouse = {} } = {}) => ({
  mouse: { x: 500, y: 500, down: false, rightDown: false, clicked: false, rightClicked: false, ...mouse },
  isDown: (c) => down.includes(c),
  wasPressed: (c) => pressed.includes(c),
});
const enemy = (over = {}) => ({
  x: 500, y: 500, radius: 14, speed: 100, hp: 2, maxHp: 2,
  kx: 0, ky: 0, stun: 0, flash: 0, dead: false, blockCd: 0, ...over,
});
const inside = (e) =>
  e.x >= BOUNDS.x + e.radius - 1e-9 && e.x <= BOUNDS.x + BOUNDS.w - e.radius + 1e-9 &&
  e.y >= BOUNDS.y + e.radius - 1e-9 && e.y <= BOUNDS.y + BOUNDS.h - e.radius + 1e-9;

const realRandom = Math.random;
beforeEach(() => { Math.random = () => 0.5; });
afterEach(() => { Math.random = realRandom; });

// ---- math ----

test('normalize: negative zero and tiny vectors give clean results', () => {
  const z = normalize(-0, -0);
  assert.equal(z.x, 0);
  assert.equal(z.y, 0);
  const tiny = normalize(1e-200, 0);
  assert.equal(tiny.x, 1);
  assert.equal(tiny.y, 0);
});

test('normalize: huge vectors do not overflow', () => {
  const n = normalize(1e200, 1e200);
  assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-12);
});

test('clamp: a value exactly on a bound stays there, and a degenerate range collapses', () => {
  assert.equal(clamp(5, 5, 5), 5);
  assert.equal(clamp(100, 5, 5), 5);
  assert.equal(clamp(-0, 0, 1), 0);
});

test('angleDiff: opposite directions are exactly half a turn', () => {
  assert.ok(Math.abs(Math.abs(angleDiff(Math.PI, 0)) - Math.PI) < 1e-12);
  assert.ok(Math.abs(Math.abs(angleDiff(0, Math.PI)) - Math.PI) < 1e-12);
});

// ---- player ----

test('createPlayer: an unknown character type fails right away', () => {
  assert.throws(() => createPlayer(0, 0, 'wizard'), TypeError);
});

test('createPlayer: every character starts with their own independent state', () => {
  const a = createPlayer(0, 0, 'archer');
  const b = createPlayer(0, 0, 'archer');
  a.arrows.push({});
  a.trail.push({});
  assert.equal(b.arrows.length, 0);
  assert.equal(b.trail.length, 0);
});

test('player: dashing into a corner never leaves the arena', () => {
  for (const type of ['knight', 'assassin', 'archer']) {
    const p = createPlayer(30, 30, type);
    updatePlayer(p, input({ down: ['KeyA', 'KeyW'], pressed: ['Space'] }), 0.01, BOUNDS, [], noHit, { w: 1000, h: 1000 });
    for (let i = 0; i < 60; i++) updatePlayer(p, input({ down: ['KeyA', 'KeyW'] }), 0.01, BOUNDS, [], noHit, { w: 1000, h: 1000 });
    assert.equal(p.x, p.radius, type);
    assert.equal(p.y, p.radius, type);
  }
});

test('player: a huge time step still keeps the player inside the arena', () => {
  const p = createPlayer(500, 500, 'knight');
  updatePlayer(p, input({ down: ['KeyD', 'KeyS'] }), 100, BOUNDS, [], noHit);
  assert.equal(p.x, BOUNDS.x + BOUNDS.w - p.radius);
  assert.equal(p.y, BOUNDS.y + BOUNDS.h - p.radius);
});

test('player: the mouse exactly on the player keeps the aim finite', () => {
  const p = createPlayer(500, 500, 'knight');
  updatePlayer(p, input({ mouse: { x: 500, y: 500 } }), 0.01, BOUNDS, [], noHit);
  assert.ok(Number.isFinite(p.aim));
});

test('player: hurting takes exactly the damage and starts invulnerability', () => {
  const p = createPlayer(0, 0, 'knight');
  assert.equal(isPlayerVulnerable(p), true);
  hurtPlayer(p, 2);
  assert.equal(p.hp, p.maxHp - 2);
  assert.equal(isPlayerVulnerable(p), false);
});

test('player: a dash pressed during a dash does not restart it', () => {
  const p = createPlayer(500, 500, 'assassin');
  updatePlayer(p, input({ down: ['KeyD'], pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  const dash = p.dash;
  updatePlayer(p, input({ down: ['KeyD'], pressed: ['Space'] }), 0.01, BOUNDS, [], noHit);
  assert.equal(p.dash, dash);
});

// ---- enemies ----

test('hitEnemy: several hits in the same frame add up, and a dead enemy stays dead', () => {
  const e = enemy({ hp: 2 });
  hitEnemy(e, 100, 0, 1);
  assert.equal(e.dead, false);
  hitEnemy(e, 100, 0, 1);
  assert.equal(e.dead, true);
  hitEnemy(e, 100, 0, 1);
  assert.equal(e.dead, true);
  assert.equal(e.hp, -1);
});

test('shoveEnemy: stuns without damage', () => {
  const e = enemy();
  shoveEnemy(e, 300, 0);
  assert.equal(e.hp, 2);
  assert.equal(e.dead, false);
  assert.ok(e.stun > 0);
  assert.equal(e.kx, 300);
});

test('enemies: huge knockback into a corner keeps them inside the arena', () => {
  const e = enemy({ x: 30, y: 30, kx: -50000, ky: -50000 });
  for (let i = 0; i < 20; i++) updateEnemies([e], { x: 500, y: 500 }, 0.05, BOUNDS);
  assert.ok(inside(e), `${e.x}, ${e.y}`);
});

test('enemies: a large time step does not throw an enemy out of the arena', () => {
  const e = enemy({ x: 990, y: 500, speed: 1000 });
  updateEnemies([e], { x: 5000, y: 500 }, 0.25, BOUNDS);
  assert.ok(inside(e));
});

test('enemies: a pile of enemies on one spot spreads out without NaN', () => {
  const pile = Array.from({ length: 8 }, () => enemy({ x: 500, y: 500 }));
  pile[0].x = 501; // one is slightly off so separation has a direction
  for (let i = 0; i < 50; i++) updateEnemies(pile, { x: 100, y: 100 }, 0.016, BOUNDS);
  for (const e of pile) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
});

test('dasher: no NaN when the player stands exactly on the dasher', () => {
  const d = createDasher(500, 500);
  for (let i = 0; i < 200; i++) updateEnemies([d], { x: 500, y: 500 }, 0.016, BOUNDS);
  assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y));
});

test('dasher: a dash towards a point outside the arena ends inside it', () => {
  const d = createDasher(900, 500);
  d.stopTimer = 0;
  for (let i = 0; i < 100; i++) updateEnemies([d], { x: 5000, y: 500 }, 0.016, BOUNDS);
  assert.ok(inside(d), `${d.x}, ${d.y}`);
});

test('dasher: a hit during its stop phase does not break the dash cycle', () => {
  const d = createDasher(500, 500);
  hitEnemy(d, 200, 0, 1);
  for (let i = 0; i < 300; i++) updateEnemies([d], { x: 800, y: 500 }, 0.016, BOUNDS);
  assert.equal(d.hp, 1);
  assert.ok(Number.isFinite(d.x));
});

test('createEnemy: wave 0 and very high waves give sane stats', () => {
  for (const wave of [0, 1, 100, 10000]) {
    const e = createEnemy(10, 10, wave);
    assert.ok(e.hp > 0 && e.speed > 0 && e.radius > 0, `wave ${wave}`);
    assert.ok(Number.isFinite(e.speed));
  }
});
