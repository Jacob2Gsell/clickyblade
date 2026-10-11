import { createInput } from './input.js';
import { createPlayer, updatePlayer, drawPlayer, isPlayerVulnerable, hurtPlayer, isShielded, useShield } from './player.js';
import { createEnemy, createDasher, hitEnemy, shoveEnemy, updateEnemies, drawEnemy } from './enemies/enemy.js';
import { createAsciiRenderer } from './ascii.js';
import { TRAP_CHARGES } from './playercharacters/archer.js';
import {
  createWaves, advanceWaves, spawnPoint, isDasherSpawn,
  resolveContacts, removeDead, advanceTime, HITSTOP_HIT,
} from './rules.js';
import { createLexicon, unlockSpells, findKnownSpell, matchedPrefixLength } from './lexicon.js';
import { spawnDamageNumber, updateDamageNumbers, drawDamageNumbers } from './damage-numbers.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput();
// ASCII mode draws the scene here first, then converts it to characters on the main canvas.
const sceneCanvas = document.createElement('canvas');
const sceneCtx = sceneCanvas.getContext('2d');
const drawAscii = createAsciiRenderer();
let asciiMode = false;
const renderLabels = ['render-main', 'render-pause'].map((id) => document.getElementById(id));
function setAsciiMode(on) {
  asciiMode = on;
  for (const el of renderLabels) el.textContent = `Render: ${on ? 'ASCII' : 'Graphics'} [T]`;
}

const overlay = document.getElementById('slowmo-overlay');
const lexiconEl = document.getElementById('lexicon');
const spellInput = document.getElementById('spell-input');
const pauseMenu = document.getElementById('pause-menu');
const mainMenu = document.getElementById('main-menu');
let character = 'knight';
// Choosing a character starts the game with it (there is no separate Continue button).
function startGame(char) {
  character = char;
  reset();
  inMenu = false;
  mainMenu.classList.remove('open');
}
function openMainMenu() {
  paused = false;
  slowmo = false;
  inMenu = true;
  mainMenu.classList.add('open');
}

// Menu keys: pressing one runs its action while that menu is on screen.
const menuKeys = [
  { menu: mainMenu, actions: { Digit1: () => startGame('knight'), Digit2: () => startGame('assassin'), Digit3: () => startGame('archer') } },
  { menu: pauseMenu, actions: { KeyP: () => { paused = false; }, KeyM: openMainMenu } },
];
function pressMenuKeys() {
  for (const { menu, actions } of menuKeys) {
    if (!menu.classList.contains('open')) continue;
    for (const [code, action] of Object.entries(actions)) if (input.wasPressed(code)) action();
  }
}

const STEP = 1 / 120;
const ARENA_MARGIN = 20;
let bounds, player, enemies, score, waves, gameOver, lexicon, activeSpells;
let damageNumbers = []; // floating "-health" numbers over enemies that were hit
let slowmo, paused;
const fx = { shake: 0, hitstop: 0, timeScale: 1 }; // screenshake, hitstop and time scale
let inMenu = true;
let focused = false; // focus mode is visibly active (slow motion, not paused, not in a menu)

// Typed spell text is cleared after this long without a keystroke.
const TYPING_TIMEOUT = 500; // ms, real time
let typingTimer;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  sceneCanvas.width = canvas.width;
  sceneCanvas.height = canvas.height;
  bounds = {
    x: ARENA_MARGIN, y: ARENA_MARGIN,
    w: canvas.width - ARENA_MARGIN * 2, h: canvas.height - ARENA_MARGIN * 2,
  };
}
window.addEventListener('resize', resize);
resize();

// Name elements by spell id, so the typed-letter highlight can update them without re-rendering the lexicon.
const spellNameEls = new Map();

// Marks the letters of each spell name that the typed text matches from the start (green).
function highlightSpellMatches(typed) {
  for (const spell of lexicon) {
    const name = spellNameEls.get(spell.id);
    if (!name) continue; // not rendered yet (renderLexicon highlights again once it is)
    const n = matchedPrefixLength(spell, typed);
    if (n === 0) {
      name.textContent = spell.name;
      continue;
    }
    const matched = document.createElement('span');
    matched.classList.add('spell-match');
    matched.textContent = spell.name.slice(0, n);
    name.replaceChildren(matched, spell.name.slice(n));
  }
}

// Newest spell on top: a header followed by one block per spell (name, then its effects).
function renderLexicon() {
  const head = document.createElement('div');
  head.classList.add('lex-title');
  head.textContent = 'Lexicon';
  spellNameEls.clear();
  const blocks = [...lexicon].reverse().map((spell) => {
    const block = document.createElement('div');
    block.classList.add('spell');
    if (activeSpells.includes(spell.id)) block.classList.add('spell-active');
    const name = document.createElement('div');
    name.classList.add('spell-name');
    name.textContent = spell.name;
    spellNameEls.set(spell.id, name);
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
  lexiconEl.scrollTop = 0; // show the newest spell
  highlightSpellMatches(spellInput.value);
}

function clearSpellInput() {
  clearTimeout(typingTimer);
  spellInput.value = '';
  highlightSpellMatches('');
}

// Casting marks the spell as active (its effect is not implemented yet), closes focus mode and clears the field.
function castSpell(spell) {
  clearSpellInput();
  if (!activeSpells.includes(spell.id)) activeSpells.push(spell.id);
  slowmo = false;
  renderLexicon();
}

spellInput.addEventListener('input', () => {
  spellInput.value = spellInput.value.toUpperCase(); // every input is uppercase, spell names are compared in uppercase too
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearSpellInput, TYPING_TIMEOUT); // also removes the green letters
  const spell = findKnownSpell(lexicon, spellInput.value);
  if (spell) castSpell(spell);
  else highlightSpellMatches(spellInput.value);
});

function reset() {
  lexicon = createLexicon();
  activeSpells = [];
  clearSpellInput();
  renderLexicon();
  player = createPlayer(canvas.width / 2, canvas.height / 2, character);
  enemies = [];
  damageNumbers = [];
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
    if (input.wasPressed('Enter')) reset();
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
    spawnDamageNumber(damageNumbers, e, dmg);
    fx.shake = Math.max(fx.shake, 6);
    fx.hitstop = Math.max(fx.hitstop, HITSTOP_HIT);
  }, { w: canvas.width, h: canvas.height });
  updateEnemies(enemies, player, dt, bounds);
  updateDamageNumbers(damageNumbers, dt);

  if (resolveContacts(player, enemies, fx)) gameOver = true;

  const { alive, killed } = removeDead(enemies);
  enemies = alive;
  score += killed;

  if (gameOver) fx.shake = 0; // no screenshake on the death screen
  fx.shake = Math.max(0, fx.shake - 40 * dt);
}

function drawFloor(ctx, boldBorder) {
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
  ctx.strokeStyle = boldBorder ? '#9aa4b5' : '#3a404b'; // thin lines vanish when shrunk to characters
  ctx.lineWidth = boldBorder ? 8 : 2;
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
  const g = asciiMode ? sceneCtx : ctx;
  g.save();
  if (fx.shake > 0 && !paused) g.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  drawFloor(g, asciiMode);
  for (const e of enemies) drawEnemy(g, e);
  drawPlayer(g, player);
  drawDamageNumbers(g, damageNumbers);
  g.restore();
  if (asciiMode) drawAscii(sceneCanvas, ctx);

  drawHud();

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`Score ${score} · Wave ${waves.wave} · Press Enter to restart`, canvas.width / 2, canvas.height / 2 + 24);
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
    pressMenuKeys();
    if (input.wasPressed('KeyT')) setAsciiMode(!asciiMode);
    if (!paused && !inMenu) {
      update(advanceTime(fx, slowmo, STEP));
    }
    input.endFrame();
    acc -= STEP;
  }
  pauseMenu.classList.toggle('open', paused);
  focused = slowmo && !paused && !inMenu;
  overlay.classList.toggle('active', focused);
  lexiconEl.classList.toggle('active', focused);
  spellInput.classList.toggle('active', focused);
  if (focused && document.activeElement !== spellInput) spellInput.focus();
  if (!focused && document.activeElement === spellInput) spellInput.blur();
  if (!focused && spellInput.value !== '') clearSpellInput(); // leaving focus mode mid-word discards the typed text
  render();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
