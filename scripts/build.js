import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { mangleClasses } from './mangle-classes.js';

const SCRIPT_TAG = '<script type="module" src="src/main.js"></script>';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  metafile: true,
});
result.metafile_inputs = Object.keys(result.metafile.inputs);
// "</script" im Code würde das Inline-Script vorzeitig beenden, "<!--" kann es in den Script-Data-Modus kippen.
// Beides steht nur in String-/Regex-Literalen, dort ist der Backslash-Escape wirkungsgleich.
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');

let html = await readFile('index.html', 'utf8');
if (!html.includes(SCRIPT_TAG)) {
  throw new Error(`Script-Tag nicht in index.html gefunden: ${SCRIPT_TAG}`);
}

// Icons als Daten-URIs einbetten
const iconPaths = [...new Set([...html.matchAll(/src="(icons\/[^"]+\.svg)"/g)].map((m) => m[1]))];
for (const path of iconPaths) {
  const svg = (await readFile(path, 'utf8'))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  html = html.replaceAll(`src="${path}"`, () => `src="${uri}"`);
}

// CSS-Klassen kuerzen (Style, class-Attribute und classList-Aufrufe im JS gemeinsam)
const mangled = mangleClasses({ html, js });
html = mangled.html;

// Funktion als Ersatz, damit "$" im Code nicht als Pattern interpretiert wird
html = html.replace(SCRIPT_TAG, () => `<script>${mangled.js}</script>`);

// HTML und Inline-CSS minifizieren (JS ist bereits von esbuild minifiziert)
html = await minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  minifyCSS: true,
  minifyJS: false,
});

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const srcSize = (await Promise.all(['index.html', ...iconPaths, ...result.metafile_inputs].map((p) => readFile(p)))).reduce((a, b) => a + b.length, 0);
console.log(`dist/index.html: ${kb(Buffer.byteLength(html))} (JS minified: ${kb(Buffer.byteLength(js))})`);
console.log(`Quelldateien gesamt: ${kb(srcSize)}`);
