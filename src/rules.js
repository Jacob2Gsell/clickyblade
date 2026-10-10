import { isPlayerVulnerable, hurtPlayer, isShielded, useShield } from './player.js';
import { shoveEnemy } from './enemies/enemy.js';

// Game rules that don't touch the DOM or canvas, so they can be tested on their own.

// Time scale: slow motion eases towards SLOWMO_SCALE; hitstop drops the game to a crawl for a moment.
export const SLOWMO_SCALE = 0.25;
export const SLOWMO_EASE = 12; // how quickly timeScale approaches its target (per second)
export const HITSTOP_SCALE = 0.05;
export const HITSTOP_HIT = 0.1;   // seconds, sword connects
export const HITSTOP_HURT = 0.14; // seconds, player takes damage

export const SHIELD_KNOCKBACK = 450; // how hard a blocked enemy is thrown back
export const BLOCK_COOLDOWN = 0.5;   // seconds before the same enemy can hit the shield again

export const FIRST_WAVE_PAUSE = 1;
export const WAVE_PAUSE = 1.5;
const DASHER_FIRST_WAVE = 2;
const DASHER_CHANCE = 0.25;

export function createWaves() {
  return { wave: 0, spawnQueue: 0, spawnTimer: 0, wavePause: FIRST_WAVE_PAUSE };
}

export const waveSize = (wave) => 3 + wave * 2;
export const spawnInterval = (wave) => Math.max(0.15, 0.6 - wave * 0.04);

// Dashers appear from wave 2 on, making up about a quarter of the spawns.
export const isDasherSpawn = (wave, roll) => wave >= DASHER_FIRST_WAVE && roll < DASHER_CHANCE;

// A point on the arena edge. side 0/1 are top/bottom, 2/3 left/right; r in [0, 1) moves along that edge.
export function spawnPoint(bounds, side, r) {
  const x = side < 2 ? bounds.x + r * bounds.w : side === 2 ? bounds.x : bounds.x + bounds.w;
  const y = side < 2 ? (side === 0 ? bounds.y : bounds.y + bounds.h) : bounds.y + r * bounds.h;
  return { x, y };
}

// Once the field is clear, pause briefly then start the next, bigger wave.
// Returns true when an enemy should be spawned right now.
export function advanceWaves(s, enemyCount, dt) {
  if (s.spawnQueue === 0 && enemyCount === 0) {
    s.wavePause -= dt;
    if (s.wavePause <= 0) {
      s.wave++;
      s.spawnQueue = waveSize(s.wave);
      s.wavePause = WAVE_PAUSE;
    }
  }
  if (s.spawnQueue > 0) {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      s.spawnQueue--;
      s.spawnTimer = spawnInterval(s.wave);
      return true;
    }
  }
  return false;
}

// Enemy/player contact for one tick. fx is { shake, hitstop }; returns true if the player died.
export function resolveContacts(player, enemies, fx) {
  let gameOver = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    if (dist >= e.radius + player.radius) continue;
    const nx = (e.x - player.x) / (dist || 1), ny = (e.y - player.y) / (dist || 1);
    if (isShielded(player, nx, ny)) {
      // The shield absorbs the hit and throws the enemy back; the same enemy can't use up charges every frame.
      if (!(e.blockCd > 0)) {
        useShield(player);
        shoveEnemy(e, nx * SHIELD_KNOCKBACK, ny * SHIELD_KNOCKBACK);
        e.blockCd = BLOCK_COOLDOWN;
        fx.shake = Math.max(fx.shake, 5);
        fx.hitstop = Math.max(fx.hitstop, HITSTOP_HIT);
      }
      continue;
    }
    if (isPlayerVulnerable(player)) {
      hurtPlayer(player, 1);
      fx.shake = 4;
      fx.hitstop = Math.max(fx.hitstop, HITSTOP_HURT);
      // Shove the enemy back a little so it doesn't sit on top of the player.
      e.kx = nx * 300; e.ky = ny * 300;
      if (player.hp <= 0) gameOver = true;
    }
  }
  return gameOver;
}

// Splits off dead enemies; the kill count is the score gain.
export function removeDead(enemies) {
  const alive = enemies.filter((e) => !e.dead);
  return { alive, killed: enemies.length - alive.length };
}

// One fixed step of the time scale. fx is { timeScale, hitstop }; returns the dt the game should simulate.
export function advanceTime(fx, slowmo, step) {
  const target = slowmo ? SLOWMO_SCALE : 1;
  fx.timeScale += (target - fx.timeScale) * Math.min(1, SLOWMO_EASE * step);
  const stop = fx.hitstop > 0 ? HITSTOP_SCALE : 1;
  fx.hitstop = Math.max(0, fx.hitstop - step); // counts down in real time
  return step * fx.timeScale * stop;
}
