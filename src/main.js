import { createInput } from './input.js';
import { createPlayer, updatePlayer, drawPlayer, isPlayerVulnerable, hurtPlayer, isShielded, useShield } from './player.js';
import { createEnemy, createDasher, hitEnemy, shoveEnemy, updateEnemies, drawEnemy } from './enemies/enemy.js';
import { TRAP_CHARGES } from './playercharacters/archer.js';
import {
  createWaves, advanceWaves, spawnPoint, isDasherSpawn,
  resolveContacts, removeDead, advanceTime, HITSTOP_HIT,
} from './rules.js';
import { createLexicon, unlockSpells } from './lexicon.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

const overlay = document.getElementById('slowmo-overlay');
const lexiconEl = document.getElementById('lexicon');
const pauseMenu = document.getElementById('pause-menu');
const mainMenu = document.getElementById('main-menu');
const charCards = [...document.querySelectorAll('.char-card')];
document.getElementById('btn-proceed').addEventListener('click', () => { paused = false; });
document.getElementById('btn-main-menu').addEventListener('click', () => {
  paused = false;
  slowmo = false;
  inMenu = true;
  mainMenu.classList.add('open');
});
document.getElementById('btn-continue').addEventListener('click', () => {
  reset();
  inMenu = false;
  mainMenu.classList.remove('open');
});
let character = 'knight';
for (const card of charCards) {
  card.addEventListener('click', () => {
    character = card.dataset.char;
    charCards.forEach((c) => c.classList.toggle('selected', c === card));
  });
}

const STEP = 1 / 120;
const ARENA_MARGIN = 20;
let bounds, player, enemies, score, waves, gameOver, lexicon;
let slowmo, paused;
const fx = { shake: 0, hitstop: 0, timeScale: 1 }; // screenshake, hitstop and time scale
let inMenu = true;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  bounds = {
    x: ARENA_MARGIN, y: ARENA_MARGIN,
    w: canvas.width - ARENA_MARGIN * 2, h: canvas.height - ARENA_MARGIN * 2,
  };
}
window.addEventListener('resize', resize);
resize();

// Newest spell on top: a header followed by one block per spell (name, then its effects).
function renderLexicon() {
  const head = document.createElement('div');
  head.classList.add('lex-title');
  head.textContent = 'Lexicon';
  const blocks = [...lexicon].reverse().map((spell) => {
    const block = document.createElement('div');
    block.classList.add('spell');
    const name = document.createElement('div');
    name.classList.add('spell-name');
    name.textContent = spell.name;
    block.append(name);
    for (const effect of spell.effects) {
      const line = document.createElement('div');
      line.classList.add('spell-effect');
      line.textContent = effect;
      block.append(line);
    }
    return block;
  });
  lexiconEl.replaceChildren(head, ...blocks);
}

function reset() {
  lexicon = createLexicon();
  renderLexicon();
  player = createPlayer(canvas.width / 2, canvas.height / 2, character);
  enemies = [];
  score = 0;
  waves = createWaves();
  fx.shake = 0;
  fx.hitstop = 0;
  fx.timeScale = 1;
  gameOver = false;
  slowmo = false;
  paused = false;
}

function spawnEnemy() {
  const { x, y } = spawnPoint(bounds, Math.floor(Math.random() * 4), Math.random());
  const dasher = isDasherSpawn(waves.wave, Math.random());
  enemies.push(dasher ? createDasher(x, y) : createEnemy(x, y, waves.wave));
}

function update(dt) {
  if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) slowmo = !slowmo;

  if (gameOver) {
    if (input.mouse.clicked) reset();
    return;
  }

  if (advanceWaves(waves, enemies.length, dt)) spawnEnemy();
  if (waves.cleared) {
    waves.cleared = false;
    unlockSpells(lexicon);
    renderLexicon();
  }

  updatePlayer(player, input, dt, bounds, enemies, (e, kx, ky, dmg) => {
    hitEnemy(e, kx, ky, dmg);
    fx.shake = Math.max(fx.shake, 6);
    fx.hitstop = Math.max(fx.hitstop, HITSTOP_HIT);
  }, { w: canvas.width, h: canvas.height });
  updateEnemies(enemies, player, dt, bounds);

  if (resolveContacts(player, enemies, fx)) gameOver = true;

  const { alive, killed } = removeDead(enemies);
  enemies = alive;
  score += killed;

  if (gameOver) fx.shake = 0; // no screenshake on the death screen
  fx.shake = Math.max(0, fx.shake - 40 * dt);
}

function drawFloor() {
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1f232a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = bounds.x; x <= bounds.x + bounds.w; x += 40) {
    ctx.moveTo(x + 0.5, bounds.y);
    ctx.lineTo(x + 0.5, bounds.y + bounds.h);
  }
  for (let y = bounds.y; y <= bounds.y + bounds.h; y += 40) {
    ctx.moveTo(bounds.x, y + 0.5);
    ctx.lineTo(bounds.x + bounds.w, y + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = '#3a404b';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
}

function drawHud() {
  for (let i = 0; i < player.maxHp; i++) {
    ctx.fillStyle = i < player.hp ? '#e44' : '#422';
    ctx.fillRect(36 + i * 22, 36, 16, 16);
  }
  ctx.fillStyle = '#ccc';
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Score ${score}   Wave ${waves.wave}`, canvas.width - 36, 50);
  ctx.textAlign = 'left';

  // Dash cooldown bar
  const ready = 1 - player.dashCooldown / player.dashCooldownMax;
  ctx.fillStyle = '#223';
  ctx.fillRect(36, 60, 104, 6);
  ctx.fillStyle = ready >= 1 ? '#6cf' : '#468';
  ctx.fillRect(36, 60, 104 * ready, 6);

  // Shield charges (knight only)
  if (player.type === 'knight') {
    for (let i = 0; i < player.maxShield; i++) {
      ctx.fillStyle = i < player.shield ? '#8cf' : '#223';
      ctx.fillRect(36 + i * 22, 74, 16, 6);
    }
  }

  // Trap charges (archer only)
  if (player.type === 'archer') {
    for (let i = 0; i < TRAP_CHARGES; i++) {
      ctx.fillStyle = i < player.trapCharges ? '#c96' : '#322';
      ctx.fillRect(36 + i * 22, 74, 16, 6);
    }
  }
}

function render() {
  ctx.save();
  if (fx.shake > 0 && !paused) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  drawFloor();
  for (const e of enemies) drawEnemy(ctx, e);
  drawPlayer(ctx, player);
  ctx.restore();

  drawHud();

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`Score ${score} · Wave ${waves.wave} · Click to restart`, canvas.width / 2, canvas.height / 2 + 24);
    ctx.textAlign = 'left';
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= STEP) {
    if (input.wasPressed('Escape') && !gameOver && !inMenu) paused = !paused;
    if (!paused && !inMenu) {
      update(advanceTime(fx, slowmo, STEP));
    }
    input.endFrame();
    acc -= STEP;
  }
  pauseMenu.classList.toggle('open', paused);
  const focused = slowmo && !paused && !inMenu;
  overlay.classList.toggle('active', focused);
  lexiconEl.classList.toggle('active', focused);
  render();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
