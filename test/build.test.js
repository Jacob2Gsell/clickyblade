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
  dom.listeners['btn-continue'].click();
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
  const makeEl = (id) => ({
    id,
    width: 0, height: 0,
    dataset: { char: id },
    classList: {
      add(c) { dom.classesUsed.add(c); }, remove(c) { dom.classesUsed.add(c); }, toggle(c) { dom.classesUsed.add(c); },
    },
    addEventListener(ev, fn) { (listeners[id] ||= {})[ev] = fn; },
    append() {}, replaceChildren() {}, textContent: '',
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  });
  const els = {};
  const getEl = (id) => (els[id] ||= makeEl(id));
  const cards = ['knight', 'assassin', 'archer'].map((c) => makeEl(`card-${c}`));
  cards.forEach((c, i) => { c.dataset.char = ['knight', 'assassin', 'archer'][i]; });

  let raf = null;
  const sandbox = {
    document: { getElementById: getEl, createElement: (tag) => makeEl(tag), querySelectorAll: () => cards },
    window: {
      innerWidth: 1000, innerHeight: 700,
      addEventListener(ev, fn) { // several handlers per event are all called, like in a browser
        const w = (listeners.window ||= {}), prev = w[ev];
        w[ev] = prev ? (e) => { prev(e); fn(e); } : fn;
      },
    },
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => { raf = fn; },
    Math, console,
  };
  return Object.assign(dom, {
    sandbox, listeners, draws, cards, getEl,
    frame(now) { const f = raf; raf = null; f(now); },
    hasFrame: () => raf !== null,
  });
}

function loadBundle(dom) {
  vm.createContext(dom.sandbox);
  new vm.Script(inlineScript()).runInContext(dom.sandbox);
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
    dom.listeners['btn-continue'].click();                 // start
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

test('build: arrow keys and wheel scroll the lexicon only while focus mode is active', () => {
  const dom = createFakeDom();
  loadBundle(dom);
  const lexicon = dom.getEl('lexicon');
  dom.listeners['btn-continue'].click();
  const win = dom.listeners.window;
  const key = (code) => ({ code, preventDefault() {} });
  win.keydown(key('ArrowDown'));
  assert.equal(lexicon.scrollTop, 0, 'scrolls without focus mode');
  win.keydown(key('ShiftLeft'));                        // toggle focus mode on
  for (let i = 1; i <= 5; i++) dom.frame(i * 16);
  win.keydown(key('ArrowDown'));
  win.keydown(key('ArrowDown'));
  win.keydown(key('ArrowUp'));
  assert.equal(lexicon.scrollTop, 60, 'down, down, up = one step down');
  win.wheel({ deltaY: 100 });
  assert.equal(lexicon.scrollTop, 160);
});
