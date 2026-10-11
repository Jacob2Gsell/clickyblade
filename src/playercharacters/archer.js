import { normalize } from '../math.js';
import { ATTACK_KEY, SECONDARY_KEY } from '../shared.js';

// Archer: a bow (hold the attack key to charge, release to shoot) and up to three traps (secondary key).

const BASE_DAMAGE = 1;                // one plain shot; the knight's and assassin's hits also do 1
const PERFECT_MULT = 1.5;             // damage multiplier for a release while the perfect window is open
const PERFECT_WINDOW = 0.15;          // seconds the charge freezes after reaching a level; releasing in it is perfect
const CHARGE_TIMES = [0.225, 0.50625, 0.84375]; // charge bar positions (seconds) of levels 1, 2 and 3
const CHARGE_SPEED = 0.75;            // movement speed factor while the bow is charged
// Charge bar colour by level reached: below level 1, then level 1, 2 and 3.
const CHARGE_COLORS = ['#666', '#a86', '#e9a24a', '#fc6'];

// Volleys per charge level: 1 arrow, then 3 and 6 in a fan.
const VOLLEYS = [
  { count: 1, step: 0 },
  { count: 3, step: (15 * Math.PI) / 180 },
  { count: 6, step: (12 * Math.PI) / 180 },
];
const ARROW_SPEED = 900;
const ARROW_RADIUS = 3;     // hit margin around the arrow
const ARROW_KNOCKBACK = 300;

export const TRAP_CHARGES = 3;
const TRAP_REGEN_TIME = 2;      // seconds per recovered trap
const TRAP_COOLDOWN = 0.2;      // seconds between placing two traps
const TRAP_DAMAGE = BASE_DAMAGE * 3;
const TRAP_RADIUS_FACTOR = 3;   // blast radius = 3 x the player's radius
const TRAP_TRIGGER = 8;         // enemy distance (beyond its own radius) that sets the trap off
const TRAP_KNOCKBACK = 600;
const BLAST_TIME = 0.25;        // seconds the explosion ring stays visible
const AFTERIMAGE_TIME = 0.3;    // seconds a perfect shot's afterimage lasts
const AFTERIMAGE_GROWTH = 0.6;  // the afterimage grows to 1.6x the archer's radius before it is gone

function createArcherState() {
  return {
    charge: null,         // seconds the bow has been charged, null while not charging
    stage: 0,             // charge levels reached so far (0 to 3)
    perfectLeft: 0,       // seconds of the current perfect window left; the charge is frozen while it runs
    arrows: [],           // { x, y, vx, vy, dmg } in flight
    traps: [],            // { x, y, blast } lying on the floor
    trapCharges: TRAP_CHARGES,
    trapRegen: 0,
    trapCooldown: 0,
    blasts: [],           // { x, y, r, t } explosions still being drawn
    afterimages: [],      // { t } ghosts of the archer left by perfect shots; they follow the archer
  };
}

// True while the bow is charged inside a perfect window (just after a charge level was reached).
export function perfectWindowOpen(p) {
  return p.charge !== null && p.perfectLeft > 0;
}

function updateArcher(p, input, dt, enemies, onHit, view) {
  // Bow: pressing starts the charge, releasing shoots whatever level was reached.
  if (input.wasPressed(ATTACK_KEY) && p.charge === null) {
    p.charge = 0;
    p.stage = 0;
    p.perfectLeft = 0;
  }
  if (p.charge !== null) {
    advanceCharge(p, dt);
    if (!input.isDown(ATTACK_KEY)) {
      shoot(p);
      p.charge = null;
    }
  }

  // Traps: the secondary key places one at the archer's feet if one is charged and the cooldown is over.
  p.trapCooldown = Math.max(0, p.trapCooldown - dt);
  if (input.wasPressed(SECONDARY_KEY) && p.trapCharges > 0 && p.trapCooldown === 0) {
    p.traps.push({ x: p.x, y: p.y, blast: p.radius * TRAP_RADIUS_FACTOR });
    p.trapCharges--;
    p.trapCooldown = TRAP_COOLDOWN;
  }
  if (p.trapCharges < TRAP_CHARGES) {
    p.trapRegen += dt;
    if (p.trapRegen >= TRAP_REGEN_TIME) {
      p.trapCharges++;
      p.trapRegen = 0;
    }
  } else {
    p.trapRegen = 0;
  }

  updateArrows(p, dt, enemies, onHit, view);
  updateTraps(p, enemies, onHit);

  for (const b of p.blasts) b.t -= dt;
  p.blasts = p.blasts.filter((b) => b.t > 0);

  for (const a of p.afterimages) a.t -= dt;
  p.afterimages = p.afterimages.filter((a) => a.t > 0);
}

// Fills the bow by dt. Reaching a level freezes the charge for PERFECT_WINDOW, the perfect window.
function advanceCharge(p, dt) {
  let left = dt;
  while (left > 0) {
    if (p.perfectLeft > 0) {
      const used = Math.min(left, p.perfectLeft);
      p.perfectLeft -= used;
      left -= used;
    } else if (p.stage < CHARGE_TIMES.length) {
      const toNext = CHARGE_TIMES[p.stage] - p.charge;
      if (left < toNext) {
        p.charge += left;
        left = 0;
      } else {
        p.charge = CHARGE_TIMES[p.stage];
        left -= toNext;
        p.stage++;
        p.perfectLeft = PERFECT_WINDOW;
      }
    } else {
      p.charge += left;
      left = 0;
    }
  }
}

function shoot(p) {
  const stage = p.stage;
  if (stage === 0) return; // released before the first level: nothing happens
  const { count, step } = VOLLEYS[stage - 1];
  // Released while the perfect window is open: the whole volley does more damage.
  const perfect = p.perfectLeft > 0;
  const dmg = BASE_DAMAGE * (perfect ? PERFECT_MULT : 1);
  if (perfect) p.afterimages.push({ t: AFTERIMAGE_TIME });
  for (let i = 0; i < count; i++) {
    const angle = p.aim + (i - (count - 1) / 2) * step;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    p.arrows.push({
      x: p.x + dx * p.radius,
      y: p.y + dy * p.radius,
      vx: dx * ARROW_SPEED,
      vy: dy * ARROW_SPEED,
      dmg,
    });
  }
}

// An arrow is removed when it hits an enemy or leaves the viewport.
function updateArrows(p, dt, enemies, onHit, view) {
  for (const a of p.arrows) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    for (const e of enemies) {
      if (e.dead || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + ARROW_RADIUS) continue;
      const dir = normalize(a.vx, a.vy);
      onHit(e, dir.x * ARROW_KNOCKBACK, dir.y * ARROW_KNOCKBACK, a.dmg);
      a.hit = true;
      break;
    }
  }
  p.arrows = p.arrows.filter((a) => !a.hit && a.x >= 0 && a.x <= view.w && a.y >= 0 && a.y <= view.h);
}

// A trap goes off when an enemy reaches it. The blast hurts every enemy in its radius, never the archer.
function updateTraps(p, enemies, onHit) {
  for (const trap of p.traps) {
    const triggered = enemies.some((e) => !e.dead && Math.hypot(e.x - trap.x, e.y - trap.y) <= e.radius + TRAP_TRIGGER);
    if (!triggered) continue;
    trap.exploded = true;
    p.blasts.push({ x: trap.x, y: trap.y, r: trap.blast, t: BLAST_TIME });
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - trap.x, dy = e.y - trap.y;
      if (Math.hypot(dx, dy) > trap.blast + e.radius) continue;
      const dir = normalize(dx, dy);
      onHit(e, dir.x * TRAP_KNOCKBACK, dir.y * TRAP_KNOCKBACK, TRAP_DAMAGE);
    }
  }
  p.traps = p.traps.filter((t) => !t.exploded);
}

// Drawn behind the archer: glow, afterimages, traps on the floor, explosions and arrows in flight.
function drawArcherBack(ctx, p) {
  // Golden glow around the archer while a perfect window is open
  if (perfectWindowOpen(p)) {
    const glowRadius = p.radius * 2.2;
    const glow = ctx.createRadialGradient(p.x, p.y, p.radius, p.x, p.y, glowRadius);
    glow.addColorStop(0, 'rgba(255, 220, 110, 0.55)');
    glow.addColorStop(1, 'rgba(255, 220, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Afterimage of a perfect shot: it stays on the archer, grows and fades out
  for (const a of p.afterimages) {
    const k = 1 - a.t / AFTERIMAGE_TIME; // 0 when it appears, 1 when it is gone
    ctx.globalAlpha = 0.6 * (1 - k);
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (1 + AFTERIMAGE_GROWTH * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const t of p.traps) {
    ctx.fillStyle = '#653';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c96';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const b of p.blasts) {
    ctx.globalAlpha = (b.t / BLAST_TIME) * 0.5;
    ctx.fillStyle = '#fa6';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 2;
  for (const a of p.arrows) {
    const dir = normalize(a.vx, a.vy);
    ctx.beginPath();
    ctx.moveTo(a.x - dir.x * 10, a.y - dir.y * 10);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
  }
}

// Drawn in front of the archer: the bow and the charge bar.
function drawArcherFront(ctx, p) {
  drawBow(ctx, p);
  if (p.charge !== null) drawChargeBar(ctx, p);
}

// The bow is held in front of the archer; the string is pulled back while charging.
function drawBow(ctx, p) {
  const dist = p.radius + 8;
  const pull = p.charge === null ? 0 : Math.min(p.charge / CHARGE_TIMES[2], 1) * 8;
  const half = 0.9; // half the bow's opening angle
  const ax = p.aim - half, bx = p.aim + half;
  ctx.strokeStyle = '#a73';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, dist, ax, bx);
  ctx.stroke();
  // String from one tip to the other, pulled back towards the archer
  const tipA = [p.x + Math.cos(ax) * dist, p.y + Math.sin(ax) * dist];
  const tipB = [p.x + Math.cos(bx) * dist, p.y + Math.sin(bx) * dist];
  const nockX = p.x + Math.cos(p.aim) * (dist - pull), nockY = p.y + Math.sin(p.aim) * (dist - pull);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tipA[0], tipA[1]);
  ctx.lineTo(nockX, nockY);
  ctx.lineTo(tipB[0], tipB[1]);
  ctx.stroke();
}

// Charge bar above the archer, with a tick at each charge level.
function drawChargeBar(ctx, p) {
  const w = 32, h = 5;
  const x = p.x - w / 2, y = p.y - p.radius - 12;
  const full = CHARGE_TIMES[2];
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = CHARGE_COLORS[p.stage];
  ctx.fillRect(x, y, w * Math.min(p.charge / full, 1), h);
  ctx.fillStyle = '#ddd';
  for (const s of CHARGE_TIMES) ctx.fillRect(x + w * (s / full) - 0.5, y - 2, 1, h + 4);
}

export const archer = {
  dashCooldown: 0.6,
  aimFactor: 3,
  // The bow is slower while it is charged.
  speedFactor: (p) => (p.charge !== null ? CHARGE_SPEED : 1),
  state: createArcherState,
  update: updateArcher,
  drawBack: drawArcherBack,
  drawFront: drawArcherFront,
};
