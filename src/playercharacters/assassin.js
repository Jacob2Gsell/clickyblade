import { clamp, normalize } from '../math.js';
import { KNOCKBACK, drawBlade, ATTACK_KEY, SECONDARY_KEY } from '../shared.js';

// Assassin: two daggers, half the sword's reach. They stab forward; only one attacks at a time.
const DAGGER_THRUST = 61.25; // how far a stab pushes the dagger out (75% more than 35)
const DAGGER_BLADE = 31.5;   // blade length (50% more than 21)
const DAGGER_WIDTH = 3;     // hit margin around the thin blade
const DAGGER_SIDE_GAP = 10; // distance of each dagger from the body's centre
const DAGGER_TIME = 0.12;
const DAGGER_ENDLAG = 0.15;
const DAGGER_DAMAGE = 1;

const WEAPONS = {
  left: { stab: true, side: -Math.PI / 2, reach: DAGGER_THRUST, time: DAGGER_TIME, endlag: DAGGER_ENDLAG },
  right: { stab: true, side: Math.PI / 2, reach: DAGGER_THRUST, time: DAGGER_TIME, endlag: DAGGER_ENDLAG },
};

function createAssassinState() {
  return {
    swing: null,          // { t, weapon, aim, hit: Set } while stabbing
    swingCooldown: 0,
    queued: null,         // stab from a press that happened while the dagger was not ready
    side: null,           // last dagger that was activated
  };
}

function updateAssassin(p, input, dt, enemies, onHit) {
  // Attacks start on press, not on hold. The attack key stabs with the left dagger, the secondary key with the right one.
  p.swingCooldown = Math.max(0, p.swingCooldown - dt);
  const press = daggerFor(p, input);
  if (press) p.queued = press;
  if (p.queued && !p.swing && p.swingCooldown === 0) {
    const weapon = WEAPONS[p.queued];
    p.swing = { t: 0, weapon, aim: p.aim, hit: new Set() };
    p.swingCooldown = weapon.time + weapon.endlag;
    p.queued = null;
  }
  if (p.swing) {
    const { weapon } = p.swing;
    p.swing.t += dt;
    p.swing.aim = p.aim;
    // The dagger thrust hits every enemy its blade passes through, once per thrust.
    const { ax, ay, bx, by } = thrustLine(p, weapon, p.swing.t);
    for (const e of enemies) {
      if (e.dead || p.swing.hit.has(e)) continue;
      if (distToSegment(e.x, e.y, ax, ay, bx, by) > e.radius + DAGGER_WIDTH) continue;
      p.swing.hit.add(e);
      const dir = normalize(e.x - p.x, e.y - p.y);
      onHit(e, dir.x * KNOCKBACK, dir.y * KNOCKBACK, DAGGER_DAMAGE);
    }
    if (p.swing.t >= weapon.time) p.swing = null;
  }
}

// The attack key activates the left dagger, the secondary key the right one; left wins if both are pressed.
// Switching to the other dagger resets the endlag of the previous one.
function daggerFor(p, input) {
  const side = input.wasPressed(ATTACK_KEY) ? 'left' : input.wasPressed(SECONDARY_KEY) ? 'right' : null;
  if (side && side !== p.side) {
    p.side = side;
    p.swingCooldown = 0;
  }
  return side;
}

// Where a dagger rests on its side of the body.
function sideBase(p, side) {
  return {
    x: p.x + Math.cos(p.aim + side) * DAGGER_SIDE_GAP,
    y: p.y + Math.sin(p.aim + side) * DAGGER_SIDE_GAP,
  };
}

// The dagger slides out straight in front of its side of the body and back again.
// ox, oy is where the dagger is drawn from; the blade itself runs from ax, ay to bx, by.
function thrustLine(p, w, t) {
  const ext = w.reach * Math.sin(Math.PI * Math.min(t / w.time, 1));
  const base = sideBase(p, w.side);
  const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
  const ox = base.x + dx * ext, oy = base.y + dy * ext;
  return {
    ox, oy, ext,
    ax: ox + dx * 10, ay: oy + dy * 10,
    bx: ox + dx * (14 + DAGGER_BLADE), by: oy + dy * (14 + DAGGER_BLADE),
  };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function drawAssassinBack(ctx, p) {
  if (!p.swing) return;
  const { ox, oy } = thrustLine(p, p.swing.weapon, p.swing.t);
  drawBlade(ctx, ox, oy, p.aim, 1, 14 + DAGGER_BLADE);
}

function drawAssassinFront(ctx, p) {
  // Resting daggers: the one that is not stabbing stays in hand
  for (const name of ['left', 'right']) {
    const w = WEAPONS[name];
    if (p.swing && p.swing.weapon === w) continue;
    const { x, y } = sideBase(p, w.side);
    drawBlade(ctx, x, y, p.aim, 0.6, 14 + DAGGER_BLADE);
  }
}

export const assassin = {
  dashCooldown: 0.4,
  state: createAssassinState,
  update: updateAssassin,
  drawBack: drawAssassinBack,
  drawFront: drawAssassinFront,
};
