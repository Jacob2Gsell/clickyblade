import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build.js');
const MAX_KB = 30; // the build is ~21 KB; this catches an accidentally unminified or doubled bundle

// The build reads index.html, src/ and icons/ relative to the working directory, so it can run in a
// throwaway copy of the project without touching the real dist/.
function makeProjectCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'clicky-build-'));
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(ROOT, 'icons'), join(dir, 'icons'), { recursive: true });
  cpSync(join(ROOT, 'index.html'), join(dir, 'index.html'));
  return dir;
}

const jsFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? jsFiles(join(dir, d.name)) : d.name.endsWith('.js') ? [join(dir, d.name)] : []);

const runBuild = (cwd) => spawnSync(process.execPath, [BUILD_SCRIPT], { cwd, encoding: 'utf8' });

let work, html;
before(() => {
  work = makeProjectCopy();
  const res = runBuild(work);
  assert.equal(res.status, 0, res.stderr);
  html = readFileSync(join(work, 'dist', 'index.html'), 'utf8');
});
after(() => rmSync(work, { recursive: true, force: true }));

function inlineScript() {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, 'no inline script found');
  return m[1];
}

test('build: produces dist/index.html', () => {
  assert.ok(existsSync(join(work, 'dist', 'index.html')));
});

test('build: the spell input is limited to 40 characters', () => {
  const tag = html.match(/<input[^>]*id="spell-input"[^>]*>/)?.[0];
  assert.ok(tag, 'spell input not found in the output');
  assert.match(tag, /maxlength="40"/);
});

test('build: output is a single self-contained file', () => {
  assert.ok(!html.includes('type="module"'), 'module script tag left over');
  assert.ok(!html.includes('src/main.js'), 'reference to the source entry left over');
  assert.ok(!/src="icons\//.test(html), 'external icon reference left over');
  assert.ok(!/<link[^>]+href=/.test(html), 'external stylesheet');
  assert.equal((html.match(/<script\b/g) || []).length, 1, 'exactly one script');
});

test('build: HTML is minified (no comments, no indentation or blank lines)', () => {
  assert.ok(!html.includes('<!--'));
  assert.ok(!/\n\s*\n/.test(html), 'blank lines');
  assert.ok(!/\n {2,}</.test(html), 'indented tags');
  assert.ok(html.length < readFileSync(join(ROOT, 'index.html'), 'utf8').length + 25000);
});

test('build: all three icons are embedded as valid SVG data URIs', () => {
  const uris = [...html.matchAll(/src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/g)];
  assert.equal(uris.length, 3);
  for (const [, b64] of uris) {
    const svg = Buffer.from(b64, 'base64').toString('utf8');
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), svg.slice(0, 40));
    assert.ok(!svg.includes('<!--'), 'comments should be stripped from icons');
    assert.ok(!svg.includes('\n'), 'icons should be on one line');
  }
});

test('build: embedded icons are visually the same shapes as the originals', () => {
  const shapes = (svg) => (svg.match(/<(rect|polygon|path|circle|ellipse|line)\b[^>]*>/g) || []).map((t) => t.replace(/\s+/g, ' '));
  for (const name of ['knight', 'assassin', 'archer']) {
    const original = readFileSync(join(ROOT, 'icons', `${name}.svg`), 'utf8');
    const m = [...html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)]
      .map(([, b]) => Buffer.from(b, 'base64').toString('utf8'))
      .find((svg) => JSON.stringify(shapes(svg)) === JSON.stringify(shapes(original)));
    assert.ok(m, `${name}.svg not found unchanged in the build`);
  }
});

test('build: CSS class names are shortened and the original names are gone', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const classes = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)(?=[\s.:{,>+~[]|$)/g)].map((m) => m[1]));
  assert.ok(classes.size >= 5, `only found ${[...classes]}`);
  for (const c of classes) assert.ok(c.length <= 2, `class "${c}" not shortened`);
  for (const original of ['char-card', 'char-row', 'menu-title', 'menu-center', 'pause-title', 'focus-label', 'selected']) {
    assert.ok(!html.includes(original), `"${original}" still in the build`);
  }
});

test('build: every class the script toggles has a CSS rule, and every class in the markup is styled', () => {
  const dom = createFakeDom();
  loadBundle(dom);
  dom.listeners['card-knight'].click();
  dom.listeners['btn-main-menu'].click();
  dom.listeners[dom.cards[1].id].click();
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const styled = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
  assert.ok(dom.classesUsed.size >= 2, 'script did not touch any class');
  for (const c of dom.classesUsed) assert.ok(styled.has(c), `script uses class "${c}" which has no CSS rule`);
  const body = html.slice(html.indexOf('</style>'));
  for (const [, value] of body.matchAll(/\sclass="([^"]+)"/g)) {
    for (const c of value.split(/\s+/)) assert.ok(styled.has(c), `markup uses class "${c}" which has no CSS rule`);
  }
  assert.ok(!/:disabled/.test(css), 'dead :disabled rules are back');
});

test('build: the inline script is valid classic JavaScript (no leftover import/export)', () => {
  assert.doesNotThrow(() => new vm.Script(inlineScript()));
});

test('build: the JavaScript is minified', () => {
  const js = inlineScript();
  assert.ok(!js.includes('// '), 'comments left in');
  assert.ok(js.split('\n').length < 20, 'looks unminified');
  const total = jsFiles(join(ROOT, 'src')).reduce((a, f) => a + statSync(f).size, 0);
  assert.ok(js.length < total * 0.7, `${js.length} B bundle vs ${total} B sources`);
});

test(`build: the file stays below ${MAX_KB} KB and is smaller than the sources`, () => {
  const size = Buffer.byteLength(html);
  assert.ok(size < MAX_KB * 1024, `${(size / 1024).toFixed(1)} KB`);
  const sources = ['src/main.js', 'src/player.js', 'src/rules.js', 'src/enemies/enemy.js',
    'src/playercharacters/archer.js', 'src/playercharacters/knight.js', 'src/playercharacters/assassin.js',
    'index.html'].reduce((a, f) => a + statSync(join(ROOT, f)).size, 0);
  assert.ok(size < sources, `${size} >= ${sources}`);
});

test('build: running it twice gives the same output', () => {
  const again = runBuild(work);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(join(work, 'dist', 'index.html'), 'utf8'), html);
});

test('build: the real project builds too (dist/ is what gets shipped)', () => {
  const out = execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /dist\/index\.html/);
  assert.ok(existsSync(join(ROOT, 'dist', 'index.html')));
});

test('build: fails loudly when the script tag in index.html is missing', () => {
  const broken = makeProjectCopy();
  try {
    const src = readFileSync(join(broken, 'index.html'), 'utf8');
    writeFileSync(join(broken, 'index.html'), src.replace(/<script[^>]*><\/script>/, ''));
    const res = runBuild(broken);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /Script-Tag/);
    assert.ok(!existsSync(join(broken, 'dist', 'index.html')), 'no output on failure');
  } finally {
    rmSync(broken, { recursive: true, force: true });
  }
});

// ---- run the built script against a stubbed DOM ----

function createFakeDom() {
  const listeners = {};      // element id (or 'window') -> { event: handler }
  const draws = { calls: 0 };
  const dom = { classesUsed: new Set() };
  const ctx = new Proxy({}, {
    get: (_t, prop) => (typeof prop === 'string' ? () => { draws.calls++; } : undefined),
    set: () => true,
  });
  const makeEl = (id) => {
    const el = {
      id,
      width: 0, height: 0,
      dataset: { char: id },
      children: [],
      classes: new Set(),
      classList: {
        add(c) { el.classes.add(c); dom.classesUsed.add(c); },
        remove(c) { el.classes.delete(c); dom.classesUsed.add(c); },
        toggle(c, force) {
          const on = force ?? !el.classes.has(c);
          if (on) el.classes.add(c); else el.classes.delete(c);
          dom.classesUsed.add(c);
          return on;
        },
        contains: (c) => el.classes.has(c),
      },
      addEventListener(ev, fn) { (listeners[id] ||= {})[ev] = fn; },
      append(...nodes) { el.children.push(...nodes); },
      replaceChildren(...nodes) { el.children = [...nodes]; },
      get textContent() { return el._text ?? ''; },
      set textContent(text) { el._text = text; el.children = []; }, // like the DOM: setting text drops the children
      value: '',
      tagName: id === 'spell-input' ? 'INPUT' : 'DIV',
      focus() { dom.activeElement = el; },
      blur() { if (dom.activeElement === el) dom.activeElement = null; },
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };
    return el;
  };
  const els = {};
  const getEl = (id) => (els[id] ||= makeEl(id));
  const cards = ['knight', 'assassin', 'archer'].map((c) => makeEl(`card-${c}`));
  cards.forEach((c, i) => { c.dataset.char = ['knight', 'assassin', 'archer'][i]; });

  let raf = null;
  const timers = [];
  const sandbox = {
    document: {
      getElementById: getEl, createElement: (tag) => makeEl(tag), querySelectorAll: () => cards,
      get activeElement() { return dom.activeElement ?? null; },
    },
    window: {
      innerWidth: 1000, innerHeight: 700,
      addEventListener(ev, fn) { // several handlers per event are all called, like in a browser
        const w = (listeners.window ||= {}), prev = w[ev];
        w[ev] = prev ? (e) => { prev(e); fn(e); } : fn;
      },
    },
    performance: { now: () => 0 },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    requestAnimationFrame: (fn) => { raf = fn; },
    Math, console,
  };
  return Object.assign(dom, {
    sandbox, listeners, draws, cards, getEl,
    frame(now) { const f = raf; raf = null; f(now); },
    hasFrame: () => raf !== null,
    // Runs the timeouts that are still pending (cleared ones are null).
    runTimers() { for (const fn of timers.splice(0)) fn?.(); },
  });
}

function loadBundle(dom, script = inlineScript()) {
  vm.createContext(dom.sandbox);
  new vm.Script(script).runInContext(dom.sandbox);
}

// A build in which the lexicon already holds every spell (in the game, spells are unlocked by clearing waves).
function fullLexiconScript() {
  const dir = makeProjectCopy();
  try {
    const file = join(dir, 'src', 'lexicon.js');
    const src = readFileSync(file, 'utf8');
    const patched = src.replace('export const createLexicon = () => [];', 'export const createLexicon = () => [...SPELLS];');
    assert.notEqual(patched, src, 'createLexicon pattern not found');
    writeFileSync(file, patched);
    const res = runBuild(dir);
    assert.equal(res.status, 0, res.stderr);
    return readFileSync(join(dir, 'dist', 'index.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('build: the bundled game starts and renders frames against a stubbed DOM', () => {
  const dom = createFakeDom();
  assert.doesNotThrow(() => loadBundle(dom));
  assert.ok(dom.hasFrame(), 'game loop was not started');
  for (let i = 1; i <= 30; i++) dom.frame(i * 16);
  assert.ok(dom.draws.calls > 0, 'nothing was drawn');
});

test('build: every character can be started and survives ten seconds of play', () => {
  for (let c = 0; c < 3; c++) {
    const dom = createFakeDom();
    loadBundle(dom);
    dom.listeners[dom.cards[c].id].click();               // pick the character
    dom.listeners['card-knight'].click();                 // start
    // Press Space/Shift and click now and then, like a player would.
    const win = dom.listeners.window;
    for (let i = 1; i <= 600; i++) {
      if (i % 40 === 0) win.keydown?.({ code: 'Space', preventDefault() {} });
      if (i % 90 === 0) win.keydown?.({ code: 'ShiftLeft', preventDefault() {} });
      if (i % 91 === 0) win.keyup?.({ code: 'ShiftLeft' });
      dom.frame(i * 16);
    }
    assert.ok(dom.draws.calls > 1000, `character ${c}: too little was drawn`);
  }
});

test('build: the lexicon does not scroll with the arrow keys, not even in focus mode', () => {
  const dom = createFakeDom();
  loadBundle(dom);
  const lexicon = dom.getEl('lexicon');
  dom.listeners['card-knight'].click();
  const win = dom.listeners.window;
  const key = (code) => ({ code, preventDefault() {} });
  win.keydown(key('ShiftLeft'));                        // toggle focus mode on
  for (let i = 1; i <= 5; i++) dom.frame(i * 16);
  win.keydown(key('ArrowDown'));
  win.keydown(key('ArrowUp'));
  assert.equal(lexicon.scrollTop, 0);
});

test('build: focus mode opens the spell input and typing there does not steer the game', () => {
  const dom = createFakeDom();
  loadBundle(dom);
  const field = dom.getEl('spell-input');
  dom.listeners['card-knight'].click();
  const win = dom.listeners.window;
  dom.frame(16);
  assert.notEqual(dom.activeElement, field, 'field not focused without focus mode');
  win.keydown({ code: 'ShiftLeft', preventDefault() {} });                // Shift: focus mode on
  dom.frame(32);
  assert.equal(dom.activeElement, field, 'field is focused in focus mode');
  field.value = 'Not A Spell';
  dom.listeners['spell-input'].input();
  dom.frame(48);
  assert.equal(field.value, 'NOT A SPELL', 'the field always shows uppercase');
  assert.equal(dom.activeElement, field, 'a wrong word keeps focus mode open');
  win.keyup({ code: 'ShiftLeft', target: field });
  win.keydown({ code: 'ShiftLeft', preventDefault() {}, target: field }); // Shift while typing: focus mode off
  dom.frame(64);
  assert.notEqual(dom.activeElement, field, 'leaving focus mode blurs the field');
  assert.equal(field.value, '', 'leaving focus mode mid-word clears the field');
});

// ---- green letters for the typed start of a spell name ----

const isSpan = (node) => node.id === 'span';
const greenParts = (nameEl) => nameEl.children.filter(isSpan).map((s) => s.textContent);
// The name element of every lexicon block (the header is the first child of the lexicon).
const lexiconNames = (dom) => dom.getEl('lexicon').children.slice(1).map((block) => block.children[0]);

function typeInSpellInput(dom, text) {
  const field = dom.getEl('spell-input');
  field.value = text;
  dom.listeners['spell-input'].input();
  return field;
}

test('build: typed letters that start a lexicon spell turn green, the other names stay plain', () => {
  const dom = createFakeDom();
  loadBundle(dom, fullLexiconScript());
  dom.listeners['card-knight'].click();
  typeInSpellInput(dom, 'ch');
  const marked = lexiconNames(dom).filter((n) => greenParts(n).length > 0);
  assert.equal(marked.length, 1, 'only "Chain Spark" starts with CH');
  assert.deepEqual(greenParts(marked[0]), ['Ch'], 'the matched letters are green');
  assert.equal(marked[0].children.length, 2, 'the rest of the name stays uncoloured');
  assert.equal(marked[0].children[1], 'ain Spark');
  assert.ok(lexiconNames(dom).filter((n) => n !== marked[0]).every((n) => n.children.length === 0), 'other names are plain');
});

test('build: a word that stops matching takes the green letters away again', () => {
  const dom = createFakeDom();
  loadBundle(dom, fullLexiconScript());
  dom.listeners['card-knight'].click();
  typeInSpellInput(dom, 'ch');
  typeInSpellInput(dom, 'chx');
  assert.ok(lexiconNames(dom).every((n) => greenParts(n).length === 0), 'no name is green after the mismatch');
  assert.ok(lexiconNames(dom).every((n) => n.children.length === 0), 'names are back to plain text');
  assert.ok(lexiconNames(dom).some((n) => n.textContent === 'Chain Spark'), 'the spell name is intact');
});

test('build: the typing timeout clears the field and the green letters', () => {
  const dom = createFakeDom();
  loadBundle(dom, fullLexiconScript());
  dom.listeners['card-knight'].click();
  const field = typeInSpellInput(dom, 'ch');
  assert.ok(lexiconNames(dom).some((n) => greenParts(n).length > 0), 'precondition: letters are green');
  dom.runTimers();
  assert.equal(field.value, '', 'the field is cleared');
  assert.ok(lexiconNames(dom).every((n) => greenParts(n).length === 0), 'the green letters are gone');
});

test('build: "</script" and "<!--" in the game data can not break out of the inline script', () => {
  const dir = makeProjectCopy();
  try {
    const file = join(dir, 'src', 'data', 'spells.json');
    const spells = JSON.parse(readFileSync(file, 'utf8'));
    spells[0].name = 'Evil </script><script>alert(1)</script> <!-- x';
    spells[0].effects = ['</SCRIPT> and <!-- again'];
    writeFileSync(file, JSON.stringify(spells));
    const res = runBuild(dir);
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
    // A literal "<script" inside the script is harmless as long as "<!--" (double-escaped state) can't occur.
    assert.equal((out.match(/<\/script/gi) || []).length, 1, 'exactly one script close tag');
    assert.ok(!out.includes('<!--'), 'no HTML comment opener in the output');
    const js = out.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(js));
    assert.ok(js.includes('Evil <\\/script>'), 'the text itself is kept (escaped), not dropped');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
