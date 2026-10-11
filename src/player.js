import { clamp, normalize } from './math.js';
import { RADIUS, AIM_RANGE } from './shared.js';
import { knight } from './playercharacters/knight.js';
import { assassin } from './playercharacters/assassin.js';
import { archer } from './playercharacters/archer.js';

const SPEED = 220;
const MAX_HP = 5;

const DASH_SPEED = SPEED * 3.5;
const DASH_TIME = 0.15;

const HURT_INVULN = 1.0;

// Each character supplies its own state, attacks and drawing; the player core handles movement, dash and hits.
const CHARACTERS = { knight, assassin, archer };

export { isShielded, useShield } from './playercharacters/knight.js';

export function createPlayer(x, y, type = 'knight') {
  const character = CHARACTERS[type];
  return {
    type,                 // 'knight' | 'assassin' | 'archer'
    x, y,
    radius: RADIUS,
    hp: MAX_HP,
    maxHp: MAX_HP,
    aim: 0,               // direction the character acts in: the nearest enemy in range, else the facing
    facing: 0,            // last direction the player walked in
    blocking: false,      // knight: secondary key held and shield not broken
    dash: null,           // { t, dx, dy } while dashing
    dashCooldown: 0,
    dashCooldownMax: character.dashCooldown,
    invuln: 0,
    trail: [],
    ...character.state(),
  };
}

// Aim range of this player: the base range scaled by the character.
export function aimRange(p) {
  return AIM_RANGE * CHARACTERS[p.type].aimFactor;
}

// The nearest living enemy within the aim range (centre to centre) decides the aim; without one, the player faces
// the way it last walked.
function aimAngle(p, enemies) {
  let best = null, bestDist = aimRange(p);
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = Math.hypot(e.x - p.x, e.y - p.y);
    if (dist < bestDist) { best = e; bestDist = dist; }
  }
  return best ? Math.atan2(best.y - p.y, best.x - p.x) : p.facing;
}

export function updatePlayer(p, input, dt, bounds, enemies, onHit, view) {
  let mx = 0, my = 0;
  if (input.isDown('KeyW')) my -= 1;
  if (input.isDown('KeyS')) my += 1;
  if (input.isDown('KeyA')) mx -= 1;
  if (input.isDown('KeyD')) mx += 1;
  const move = normalize(mx, my);
  if (mx || my) p.facing = Math.atan2(move.y, move.x);
  p.aim = aimAngle(p, enemies);

  // Dash
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (!p.dash && p.dashCooldown === 0 && input.wasPressed('Space')) {
    const dir = (mx || my) ? move : { x: Math.cos(p.aim), y: Math.sin(p.aim) };
    p.dash = { t: DASH_TIME, dx: dir.x, dy: dir.y };
    p.dashCooldown = p.dashCooldownMax;
  }

  if (p.dash) {
    p.x += p.dash.dx * DASH_SPEED * dt;
    p.y += p.dash.dy * DASH_SPEED * dt;
    p.trail.push({ x: p.x, y: p.y, life: 0.2 });
    p.dash.t -= dt;
    if (p.dash.t <= 0) p.dash = null;
  } else {
    const speed = SPEED * (CHARACTERS[p.type].speedFactor?.(p) ?? 1);
    p.x += move.x * speed * dt;
    p.y += move.y * speed * dt;
  }
  p.x = clamp(p.x, bounds.x + p.radius, bounds.x + bounds.w - p.radius);
  p.y = clamp(p.y, bounds.y + p.radius, bounds.y + bounds.h - p.radius);

  for (const t of p.trail) t.life -= dt;
  p.trail = p.trail.filter((t) => t.life > 0);

  p.invuln = Math.max(0, p.invuln - dt);

  CHARACTERS[p.type].update(p, input, dt, enemies, onHit, view);
}

// Attacks, shields and bows are handled by the character modules.
export function isPlayerVulnerable(p) {
  return !p.dash && p.invuln === 0;
}

export function hurtPlayer(p, dmg) {
  p.hp -= dmg;
  p.invuln = HURT_INVULN;
}

export function drawPlayer(ctx, p) {
  for (const t of p.trail) {
    ctx.globalAlpha = (t.life / 0.2) * 0.35;
    ctx.fillStyle = '#6cf';
    ctx.beginPath();
    ctx.arc(t.x, t.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Auto-aim range as a line, in the player's colour
  ctx.strokeStyle = '#4af';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, aimRange(p), 0, Math.PI * 2);
  ctx.stroke();

  const character = CHARACTERS[p.type];
  character.drawBack(ctx, p);

  const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = p.dash ? '#9df' : '#4af';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Facing triangle
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(p.radius + 6, 0);
    ctx.lineTo(p.radius - 4, -6);
    ctx.lineTo(p.radius - 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  character.drawFront(ctx, p);
}
