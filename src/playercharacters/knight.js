import { angleDiff, normalize } from '../math.js';
import { KNOCKBACK, drawBlade } from '../shared.js';

// Knight: full-size sword (left hand) and a shield (right hand).
const SWING_ARC = (120 * Math.PI) / 180;
const SWING_REACH = 70;
const SWING_TIME = 0.15;
const SWING_COOLDOWN = 0.175;
const SWING_DAMAGE = 1;
const SHIELD_CHARGES = 3;
const SHIELD_REGEN_TIME = 2; // seconds per recovered charge
const SHIELD_ARC = (120 * Math.PI) / 180; // the shield covers this arc in front of the knight

const SWORD = { arc: SWING_ARC, reach: SWING_REACH, offset: 0, time: SWING_TIME, endlag: SWING_COOLDOWN };

function createKnightState() {
  return {
    swing: null,          // { t, weapon, aim, hit: Set } while attacking
    swingCooldown: 0,
    queued: null,         // attack from a click that happened while the sword was not ready
    shield: SHIELD_CHARGES,
    maxShield: SHIELD_CHARGES,
    shieldRegen: 0,       // seconds accumulated towards the next recovered charge
  };
}

function updateKnight(p, input, dt, enemies, onHit) {
  // Shield recovers one charge every SHIELD_REGEN_TIME seconds, up to the maximum.
  if (p.shield < p.maxShield) {
    p.shieldRegen += dt;
    if (p.shieldRegen >= SHIELD_REGEN_TIME) {
      p.shield++;
      p.shieldRegen = 0;
    }
  } else {
    p.shieldRegen = 0;
  }

  // Holding right mouse blocks, as long as the shield has charges left.
  p.blocking = !!input.mouse.rightDown && p.shield > 0;

  // Attacks start on click, not on hold. Left click swings the sword.
  p.swingCooldown = Math.max(0, p.swingCooldown - dt);
  if (input.mouse.clicked) p.queued = true;
  if (p.queued && !p.swing && p.swingCooldown === 0) {
    p.swing = { t: 0, weapon: SWORD, aim: p.aim, hit: new Set() };
    p.swingCooldown = SWORD.time + SWORD.endlag;
    p.queued = null;
  }
  if (p.swing) {
    const { weapon } = p.swing;
    p.swing.t += dt;
    p.swing.aim = p.aim;
    // The blade sweeps across the arc; enemies anywhere inside the arc get hit once per swing.
    const center = p.swing.aim + weapon.offset;
    for (const e of enemies) {
      if (e.dead || p.swing.hit.has(e)) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > weapon.reach + e.radius) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), center)) > weapon.arc / 2 && dist > p.radius + e.radius) continue;
      p.swing.hit.add(e);
      const dir = normalize(dx, dy);
      onHit(e, dir.x * KNOCKBACK, dir.y * KNOCKBACK, SWING_DAMAGE);
    }
    if (p.swing.t >= weapon.time) p.swing = null;
  }
}

// (nx, ny) is the direction from the player to the enemy. True if the shield faces that way.
export function isShielded(p, nx, ny) {
  return p.blocking && Math.abs(angleDiff(Math.atan2(ny, nx), p.aim)) <= SHIELD_ARC / 2;
}

// One blocked hit costs one shield charge; the shield breaks at zero.
export function useShield(p) {
  p.shield = Math.max(0, p.shield - 1);
  if (p.shield === 0) p.blocking = false;
}

function drawKnightBack(ctx, p) {
  if (!p.swing) return;
  const { weapon } = p.swing;
  // Swing arc
  const progress = p.swing.t / weapon.time;
  const start = p.swing.aim + weapon.offset - weapon.arc / 2;
  const bladeAngle = start + weapon.arc * progress;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, weapon.reach, start, bladeAngle);
  ctx.closePath();
  ctx.fill();
  drawBlade(ctx, p.x, p.y, bladeAngle, 1, weapon.reach);
}

function drawKnightFront(ctx, p) {
  drawShield(ctx, p);
  // Resting sword held on the left side
  if (!p.swing) drawBlade(ctx, p.x, p.y, p.aim - Math.PI / 2, 0.6, SWING_REACH);
}

// Shield: in front of the knight while blocking, otherwise resting on the right side.
function drawShield(ctx, p) {
  const side = p.blocking ? p.aim : p.aim + Math.PI / 2;
  const dist = p.blocking ? p.radius + 8 : p.radius + 2;
  ctx.save();
  ctx.translate(p.x + Math.cos(side) * dist, p.y + Math.sin(side) * dist);
  ctx.rotate(side);
  ctx.fillStyle = p.shield === 0 ? '#444' : p.blocking ? '#8cf' : '#4a6a8a';
  ctx.fillRect(-3, -14, 6, 28);
  ctx.restore();
}

export const knight = {
  dashCooldown: 0.8,
  state: createKnightState,
  update: updateKnight,
  drawBack: drawKnightBack,
  drawFront: drawKnightFront,
};
