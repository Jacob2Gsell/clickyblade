import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../../src/player.js';
import { archer, perfectWindowOpen } from '../../src/playercharacters/archer.js';

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
  shoot(p, 0.8); // level 2 was reached at 0.694 s; its perfect window runs until 0.881 s
  assert.equal(p.arrows.length, 3);
  assert.ok(p.arrows.every((a) => a.dmg === 1.5));
});

test('archer: releasing late in a level does normal damage', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 1.1); // after level 2's perfect window has closed and before level 3
  assert.ok(p.arrows.every((a) => a.dmg === 1));
});

test('archer: releasing 0.175 s after level 1 is still perfect', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.4); // level 1 was reached at 0.225 s; its window runs until 0.4125 s
  assert.equal(p.arrows.length, 1);
  assert.equal(p.arrows[0].dmg, 1.5);
});

test('archer: releasing after the 0.1875 s perfect window does normal damage', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.5); // level 1 window closed at 0.4125 s; level 2 is not reached yet
  assert.equal(p.arrows.length, 1);
  assert.equal(p.arrows[0].dmg, 1);
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
  shoot(p, 0.35); // perfect: level 1 was reached at 0.225 s, its window runs until 0.4125 s
  assert.equal(p.afterimages.length, 1);
  p.x = 700; // the archer moves on; the afterimage is drawn at the archer's position, so it moves with him
  updatePlayer(p, input(), 0.2, BOUNDS, [], noHit, VIEW);
  assert.equal(p.afterimages.length, 1);
  updatePlayer(p, input(), 0.2, BOUNDS, [], noHit, VIEW);
  assert.equal(p.afterimages.length, 0);
});

// A canvas stand-in that records the drawing state at every fill() call, in drawing order.
function recordingCtx() {
  const fills = [];
  const stack = [];
  const ctx = {
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    saves: 0,
    restores: 0,
    save() {
      this.saves++;
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
      });
    },
    restore() {
      this.restores++;
      const saved = stack.pop();
      if (!saved) throw new Error('restore() without a matching save()');
      Object.assign(this, saved);
    },
    beginPath() {},
    fillRect() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {
      fills.push({
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
      });
    },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { ctx, fills };
}

test('archer: the afterimage of a perfect shot is drawn pure green (rgb 0 255 0) with a glow', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.35); // perfect: level 1 was reached at 0.225 s
  assert.equal(p.afterimages.length, 1);
  const { ctx, fills } = recordingCtx();
  archer.drawBack(ctx, p);
  const afterimage = fills.find((f) => f.fillStyle === '#00ff00');
  assert.ok(afterimage, `expected a green afterimage, drew ${JSON.stringify(fills)}`);
  assert.equal(afterimage.globalCompositeOperation, 'lighter');
  assert.equal(afterimage.shadowColor, '#00ff00');
  assert.equal(afterimage.shadowBlur, 20);
  assert.equal(afterimage.globalAlpha, 1, 'a fresh afterimage is fully opaque');
});

test('archer: the afterimage fades out from full opacity', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.35);
  p.afterimages[0].t = 0.15; // half of AFTERIMAGE_TIME (0.3 s) has passed
  const { ctx, fills } = recordingCtx();
  archer.drawBack(ctx, p);
  const afterimage = fills.find((f) => f.fillStyle === '#00ff00');
  assert.ok(Math.abs(afterimage.globalAlpha - 0.5) < 1e-9);
});

test('archer: the golden perfect-window glow uses the same additive glow', () => {
  const p = createPlayer(500, 500, 'archer');
  p.charge = 0.3;
  p.perfectLeft = 0.1; // perfect window is open, no afterimage
  assert.equal(perfectWindowOpen(p), true);
  const { ctx, fills } = recordingCtx();
  archer.drawBack(ctx, p);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].globalCompositeOperation, 'lighter');
  assert.equal(fills[0].shadowColor, 'rgb(255, 220, 110)');
  assert.equal(fills[0].shadowBlur, 20);
});

test('archer: glow settings are reset after drawing, so other effects are not affected', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.35); // afterimage drawn with glow
  p.traps.push({ x: 100, y: 100, blast: 48 }); // trap is drawn afterwards without glow
  const { ctx, fills } = recordingCtx();
  archer.drawBack(ctx, p);
  assert.equal(ctx.globalCompositeOperation, 'source-over');
  assert.equal(ctx.shadowBlur, 0);
  assert.equal(ctx.shadowColor, 'rgba(0, 0, 0, 0)');
  const trap = fills.find((f) => f.fillStyle === '#653');
  assert.equal(trap.globalCompositeOperation, 'source-over');
  assert.equal(trap.shadowBlur, 0);
});

test('archer: drawing restores the canvas state the caller had, not the defaults', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.35); // afterimage drawn with glow
  p.charge = 0.3;
  p.perfectLeft = 0.1; // golden glow drawn too
  const { ctx } = recordingCtx();
  ctx.globalAlpha = 0.4;
  ctx.globalCompositeOperation = 'multiply';
  ctx.shadowColor = 'rgb(1, 2, 3)';
  ctx.shadowBlur = 7;
  ctx.fillStyle = '#123456';
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 5;
  archer.drawBack(ctx, p);
  assert.equal(ctx.globalAlpha, 0.4);
  assert.equal(ctx.globalCompositeOperation, 'multiply');
  assert.equal(ctx.shadowColor, 'rgb(1, 2, 3)');
  assert.equal(ctx.shadowBlur, 7);
  assert.equal(ctx.fillStyle, '#123456');
  assert.equal(ctx.strokeStyle, '#654321');
  assert.equal(ctx.lineWidth, 5);
});

test('archer: drawing with arrows and traps does not leave stroke settings behind', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.6); // an arrow in flight is drawn with a stroke
  p.traps.push({ x: 100, y: 100, blast: 48 }); // a trap is drawn with a stroke too
  const { ctx } = recordingCtx();
  archer.drawBack(ctx, p);
  assert.equal(ctx.strokeStyle, null);
  assert.equal(ctx.lineWidth, 1);
});

test('archer: drawing the bow and charge bar restores the canvas state and leaves no stroke settings behind', () => {
  const p = createPlayer(500, 500, 'archer');
  p.charge = 0.3; // bow pulled and charge bar shown
  p.stage = 1;
  const { ctx } = recordingCtx();
  ctx.fillStyle = '#123456';
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 5;
  archer.drawFront(ctx, p);
  assert.equal(ctx.fillStyle, '#123456');
  assert.equal(ctx.strokeStyle, '#654321');
  assert.equal(ctx.lineWidth, 5);
  assert.equal(ctx.saves, 1);
  assert.equal(ctx.restores, 1);
});

test('archer: all drawing happens inside one save and its restore', () => {
  const p = createPlayer(500, 500, 'archer');
  shoot(p, 0.35);
  p.charge = 0.3;
  p.perfectLeft = 0.1;
  const { ctx } = recordingCtx();
  archer.drawBack(ctx, p);
  assert.equal(ctx.saves, 1);
  assert.equal(ctx.restores, 1);
});

test('archer: perfect window opens when a level is reached and closes after 0.1875 s', () => {
  const p = createPlayer(500, 500, 'archer');
  const hold = (dt) => updatePlayer(p, input({ down: ['KeyJ'], pressed: p.charge === null ? ['KeyJ'] : [] }), dt, BOUNDS, [], noHit, VIEW);
  assert.equal(perfectWindowOpen(p), false);
  hold(0.225); // level 1 reached
  assert.equal(perfectWindowOpen(p), true);
  hold(0.1); // 0.0875 s of the window left
  assert.equal(perfectWindowOpen(p), true);
  hold(0.08); // 0.0075 s left
  assert.equal(perfectWindowOpen(p), true);
  hold(0.01);
  assert.equal(perfectWindowOpen(p), false);
});

test('archer: the perfect window is 25% longer than the old 0.15 s', () => {
  const p = createPlayer(500, 500, 'archer');
  const hold = (dt) => updatePlayer(p, input({ down: ['KeyJ'], pressed: p.charge === null ? ['KeyJ'] : [] }), dt, BOUNDS, [], noHit, VIEW);
  hold(0.225); // level 1 reached
  hold(0.16); // 0.16 s into the window: still open, the old 0.15 s window would be closed
  assert.equal(perfectWindowOpen(p), true);
});

test('archer: the charge bar freezes while the perfect window is open', () => {
  const p = createPlayer(500, 500, 'archer');
  const hold = (dt) => updatePlayer(p, input({ down: ['KeyJ'], pressed: p.charge === null ? ['KeyJ'] : [] }), dt, BOUNDS, [], noHit, VIEW);
  hold(0.225); // level 1 reached, window starts
  assert.ok(Math.abs(p.charge - 0.225) < 1e-9);
  hold(0.1); // still inside the window: no movement
  assert.ok(Math.abs(p.charge - 0.225) < 1e-9);
  hold(0.2); // window ends 0.0875 s into this frame, the remaining 0.1125 s charge
  assert.ok(Math.abs(p.charge - 0.3375) < 1e-9);
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
