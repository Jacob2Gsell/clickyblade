import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../../src/player.js';
import { perfectWindowOpen } from '../../src/playercharacters/archer.js';

const BOUNDS = { x: 0, y: 0, w: 1000, h: 1000 };
const VIEW = { w: 1000, h: 1000 };
const noHit = () => assert.fail('onHit should not be called');

function input({ down = [], pressed = [] } = {}) {
  return {
    isDown: (c) => down.includes(c),
    wasPressed: (c) => pressed.includes(c),
  };
}

// Holds the bow for `held` seconds and releases it. Aim is to the right (+x).
function shoot(p, held, onHit = noHit) {
  updatePlayer(p, input({ down: ['KeyJ'], pressed: ['KeyJ'] }), held, BOUNDS, [], onHit, VIEW);
  updatePlayer(p, input({ down: [] }), 0, BOUNDS, [], onHit, VIEW);
}

const enemyAt = (x, y, over = {}) => ({ x, y, radius: 14, dead: false, ...over });

test('archer: releasing before the first charge level shoots nothing', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.2);
  assert.equal(p.arrows.length, 0);
  assert.equal(p.charge, null);
});

test('archer: charge level 1 shoots one arrow', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.6);
  assert.equal(p.arrows.length, 1);
  assert.equal(p.arrows[0].dmg, 1);
});

test('archer: charge level 2 shoots three arrows in a fan', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 1.0);
  assert.equal(p.arrows.length, 3);
  const angles = p.arrows.map((a) => Math.atan2(a.vy, a.vx)).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[0] + (15 * Math.PI) / 180) < 1e-9);
  assert.ok(Math.abs(angles[2] - (15 * Math.PI) / 180) < 1e-9);
});

test('archer: charge level 3 shoots six arrows over a 60 degree fan', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 1.6);
  assert.equal(p.arrows.length, 6);
  const angles = p.arrows.map((a) => Math.atan2(a.vy, a.vx)).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[0] + (30 * Math.PI) / 180) < 1e-9);
  assert.ok(Math.abs(angles[5] - (30 * Math.PI) / 180) < 1e-9);
});

test('archer: releasing right after reaching a level does 1.5x damage for the whole volley', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.7); // level 2 was reached at 0.656 s; its perfect window runs until 0.806 s
  assert.equal(p.arrows.length, 3);
  assert.ok(p.arrows.every((a) => a.dmg === 1.5));
});

test('archer: releasing late in a level does normal damage', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 1.1); // after level 2's perfect window has closed and before level 3
  assert.ok(p.arrows.every((a) => a.dmg === 1));
});

test('archer: arrows are removed once they leave the viewport', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.6);
  updatePlayer(p, input(), 1, BOUNDS, [], noHit, VIEW);
  assert.equal(p.arrows.length, 0);
});

test('archer: an arrow hits an enemy once and is removed', () => {
  const p = createPlayer(500, 500, 'archer');
  const e = enemyAt(540, 500);
  const hits = [];
  shoot(p, 0.6);
  updatePlayer(p, input(), 0.02, BOUNDS, [e], (...a) => hits.push(a), VIEW);
  assert.equal(hits.length, 1);
  assert.equal(hits[0][0], e);
  assert.equal(hits[0][3], 1);
  assert.equal(p.arrows.length, 0);
});

test('archer: traps are placed with the secondary key and limited by charges and cooldown', () => {
  const p = createPlayer(500, 500, 'archer');
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 1);
  assert.equal(p.trapCharges, 2);
  // Still on cooldown: the second press is ignored
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0.1, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 1);
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0.1, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 2);
});

test('archer: no trap without charges', () => {
  const p = createPlayer(500, 500, 'archer');
  p.trapCharges = 0;
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 0);
});

test('archer: a trap recharges one charge every 2 seconds', () => {
  const p = createPlayer(500, 500, 'archer');
  p.trapCharges = 0;
  updatePlayer(p, input(), 1.9, BOUNDS, [], noHit, VIEW);
  assert.equal(p.trapCharges, 0);
  updatePlayer(p, input(), 0.1, BOUNDS, [], noHit, VIEW);
  assert.equal(p.trapCharges, 1);
});

test('archer: trap explosion hurts enemies within 3x the player radius, not the archer', () => {
  const p = createPlayer(500, 500, 'archer');
  const near = enemyAt(515, 500);   // triggers the trap
  const inBlast = enemyAt(540, 500); // 40 px away, inside the 48 px blast
  const far = enemyAt(600, 500);    // outside the blast
  const hits = [];
  const onHit = (e, kx, ky, dmg) => hits.push({ e, dmg });
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0, BOUNDS, [near, inBlast, far], onHit, VIEW);
  updatePlayer(p, input(), 0.01, BOUNDS, [near, inBlast, far], onHit, VIEW);
  assert.equal(p.traps.length, 0);
  assert.equal(p.hp, 5);
  assert.deepEqual(hits.map((h) => h.e), [near, inBlast]);
  assert.ok(hits.every((h) => h.dmg === 3));
});

test('archer: the blast radius is 3x the player radius', () => {
  const p = createPlayer(500, 500, 'archer');
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps[0].blast, p.radius * 3);
});

test('archer: charging slows movement to 0.75x', () => {
  const p = createPlayer(500, 500, 'archer');
  updatePlayer(p, input({ down: ['KeyJ'], pressed: ['KeyJ'] }), 0, BOUNDS, [], noHit, VIEW);
  updatePlayer(p, input({ down: ['KeyJ', 'KeyD'] }), 0.1, BOUNDS, [], noHit, VIEW);
  assert.ok(Math.abs(p.x - (500 + 220 * 0.75 * 0.1)) < 1e-9);
});

test('archer: dash cooldown is 0.6 s', () => {
  const p = createPlayer(500, 500, 'archer');
  assert.equal(p.dashCooldownMax, 0.6);
});

test('archer: a perfect shot leaves an afterimage that follows the archer and then disappears', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.6); // not perfect
  assert.equal(p.afterimages.length, 0);
  shoot(p, 0.35); // perfect: level 1 was reached at 0.225 s, its window runs until 0.375 s
  assert.equal(p.afterimages.length, 1);
  p.x = 700; // the archer moves on; the afterimage is drawn at the archer's position, so it moves with him
  updatePlayer(p, input(), 0.2, BOUNDS, [], noHit, VIEW);
  assert.equal(p.afterimages.length, 1);
  updatePlayer(p, input(), 0.2, BOUNDS, [], noHit, VIEW);
  assert.equal(p.afterimages.length, 0);
});

test('archer: perfect window opens when a level is reached and closes after 0.15 s', () => {
  const p = createPlayer(500, 500, 'archer');
  const hold = (dt) => updatePlayer(p, input({ down: ['KeyJ'], pressed: p.charge === null ? ['KeyJ'] : [] }), dt, BOUNDS, [], noHit, VIEW);
  assert.equal(perfectWindowOpen(p), false);
  hold(0.225); // level 1 reached
  assert.equal(perfectWindowOpen(p), true);
  hold(0.15);
  assert.equal(perfectWindowOpen(p), false);
});

test('archer: the charge bar freezes while the perfect window is open', () => {
  const p = createPlayer(500, 500, 'archer');
  const hold = (dt) => updatePlayer(p, input({ down: ['KeyJ'], pressed: p.charge === null ? ['KeyJ'] : [] }), dt, BOUNDS, [], noHit, VIEW);
  hold(0.225); // level 1 reached, window starts
  assert.ok(Math.abs(p.charge - 0.225) < 1e-9);
  hold(0.1); // still inside the window: no movement
  assert.ok(Math.abs(p.charge - 0.225) < 1e-9);
  hold(0.1); // window ends 0.05 s into this frame, the rest of the frame charges
  assert.ok(Math.abs(p.charge - 0.275) < 1e-9);
});

test('archer: holding the secondary key places only one trap', () => {
  const p = createPlayer(500, 500, 'archer');
  updatePlayer(p, input({ down: ['KeyK'], pressed: ['KeyK'] }), 0.01, BOUNDS, [], noHit, VIEW);
  for (let i = 0; i < 10; i++) updatePlayer(p, input({ down: ['KeyK'] }), 0.2, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 1);
});

test('archer: below the cap each press places a trap', () => {
  const p = createPlayer(500, 500, 'archer');
  for (let i = 0; i < 9; i++) p.traps.push({ x: 100, y: 100, blast: 48 });
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0.01, BOUNDS, [], noHit, VIEW);
  assert.equal(p.traps.length, 10);
  assert.equal(p.trapCharges, 2);
});

test('archer: at the cap a press detonates all traps at once and places none', () => {
  const p = createPlayer(500, 500, 'archer');
  for (let i = 0; i < 10; i++) p.traps.push({ x: 500, y: 500, blast: 48 });
  const enemy = { x: 520, y: 500, radius: 14, dead: false };
  const hits = [];
  updatePlayer(p, input({ pressed: ['KeyK'] }), 0.01, BOUNDS, [enemy], (...a) => hits.push(a), VIEW);
  assert.equal(hits.length, 10, 'every trap hurts the enemy in its blast');
  assert.equal(p.traps.length, 0);
  assert.equal(p.trapCharges, 3, 'no charge is used');
  assert.equal(p.blasts.length, 10);
});
