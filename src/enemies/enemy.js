import { normalize } from '../math.js';

const FRICTION = 8; // knockback decay rate per second
const STUN_TIME = 0.2;
const FLASH_TIME = 0.1;
const DASH_STOP = 0.6;  // seconds the dasher stands still between dashes
const DASH_TIME = 0.2;  // seconds a dash lasts
const DASH_SPEED = 600; // px per second during a dash

export function createDasher(x, y) {
  return {
    kind: 'dasher',
    x, y,
    radius: 14,
    speed: DASH_SPEED,
    hp: 2,
    maxHp: 2,
    kx: 0, ky: 0,
    stun: 0,
    flash: 0,
    dead: false,
    stopTimer: DASH_STOP,
    dashing: false,
    dashTimer: 0,
    tx: 0, ty: 0, // target point, locked when the dash starts
    blockCd: 0,   // seconds until this enemy can be blocked by the shield again
  };
}

export function createEnemy(x, y, wave) {
  const big = Math.random() < Math.min(0.1 + wave * 0.03, 0.35);
  return {
    x, y,
    radius: big ? 22 : 14,
    speed: big ? 70 : 100 + Math.random() * 30 + wave * 4,
    hp: big ? 4 : 2,
    maxHp: big ? 4 : 2,
    kx: 0, ky: 0,
    stun: 0,
    flash: 0,
    dead: false,
    blockCd: 0,
  };
}

export function hitEnemy(e, kx, ky, dmg) {
  e.hp -= dmg;
  shoveEnemy(e, kx, ky);
  e.flash = FLASH_TIME;
  if (e.hp <= 0) e.dead = true;
}

// Knockback and stun without damage (used when the knight's shield throws an enemy back).
export function shoveEnemy(e, kx, ky) {
  // Heavier enemies get pushed less.
  const mass = e.radius / 14;
  e.kx = kx / mass;
  e.ky = ky / mass;
  e.stun = STUN_TIME;
}

// Dasher: stands still for DASH_STOP, then dashes in a straight line toward
// the point where the player was when the dash started.
function updateDasher(e, player, dt) {
  if (e.dashing) {
    if (e.stun === 0) {
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const dist = Math.hypot(dx, dy);
      const step = e.speed * dt;
      if (dist <= step) {
        e.x = e.tx; e.y = e.ty; // reached the locked point, stay there
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    }
    e.dashTimer -= dt;
    if (e.dashTimer <= 0) {
      e.dashing = false;
      e.stopTimer = DASH_STOP;
    }
  } else {
    e.stopTimer -= dt;
    if (e.stopTimer <= 0) {
      e.dashing = true;
      e.dashTimer = DASH_TIME;
      e.tx = player.x;
      e.ty = player.y;
    }
  }
}

export function updateEnemies(enemies, player, dt, bounds) {
  for (const e of enemies) {
    e.stun = Math.max(0, e.stun - dt);
    e.flash = Math.max(0, e.flash - dt);
    e.blockCd = Math.max(0, e.blockCd - dt);

    if (e.kind === 'dasher') {
      updateDasher(e, player, dt);
    } else if (e.stun === 0) {
      const dir = normalize(player.x - e.x, player.y - e.y);
      e.x += dir.x * e.speed * dt;
      e.y += dir.y * e.speed * dt;
    }
    e.x += e.kx * dt;
    e.y += e.ky * dt;
    const decay = Math.exp(-FRICTION * dt);
    e.kx *= decay;
    e.ky *= decay;

    // Bounce off arena walls when knocked into them.
    if (e.x < bounds.x + e.radius) { e.x = bounds.x + e.radius; e.kx = Math.abs(e.kx) * 0.5; }
    if (e.x > bounds.x + bounds.w - e.radius) { e.x = bounds.x + bounds.w - e.radius; e.kx = -Math.abs(e.kx) * 0.5; }
    if (e.y < bounds.y + e.radius) { e.y = bounds.y + e.radius; e.ky = Math.abs(e.ky) * 0.5; }
    if (e.y > bounds.y + bounds.h - e.radius) { e.y = bounds.y + bounds.h - e.radius; e.ky = -Math.abs(e.ky) * 0.5; }
  }

  // Separation so enemies don't stack on top of each other.
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / 2;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }
  }
}

function kindColor(e) {
  if (e.kind === 'dasher') return '#fd3';
  return e.radius > 14 ? '#c33' : '#e55';
}

export function drawEnemy(ctx, e) {
  ctx.fillStyle = e.flash > 0 ? '#fff' : kindColor(e);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();

  if (e.hp < e.maxHp) {
    const w = e.radius * 2;
    ctx.fillStyle = '#300';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, w, 4);
    ctx.fillStyle = '#f66';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, w * (e.hp / e.maxHp), 4);
  }
}
