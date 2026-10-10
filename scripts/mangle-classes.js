// Renames CSS class names to short ones, consistently in the inline <style>, the class="" attributes
// and the classList / querySelector calls of the bundled JS. Ids and data-* attributes stay untouched.
//
// Only these usages are understood; anything else that refers to a class by name (e.g. `el.className = 'x'`)
// makes the build fail instead of silently shipping a broken page.

const CLASS_IN_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;
const JS_CLASS_CALL = /(\bclassList\.(?:add|remove|toggle|contains)\(")([^"]+)(")/g;
const JS_QUERY_CALL = /(\bquerySelector(?:All)?\(")([^"]*)(")/g;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function shortName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    n--;
    name = ALPHABET[n % ALPHABET.length] + name;
    n = Math.floor(n / ALPHABET.length);
  }
  return name;
}

// Walks every place a class name can occur and replaces each name with fn(name).
function rewrite({ html, js }, fn) {
  const selector = (s) => s.replace(CLASS_IN_SELECTOR, (_, name) => `.${fn(name)}`);
  html = html
    .replace(/<style>([\s\S]*?)<\/style>/g, (_, css) =>
      `<style>${css.replace(/([^{}]+)\{/g, (_m, prelude) => `${selector(prelude)}{`)}</style>`)
    .replace(/(\sclass=")([^"]*)(")/g, (_, a, value, b) =>
      a + value.split(/\s+/).filter(Boolean).map(fn).join(' ') + b);
  js = js
    .replace(JS_CLASS_CALL, (_, a, name, b) => a + fn(name) + b)
    .replace(JS_QUERY_CALL, (_, a, sel, b) => a + selector(sel) + b);
  return { html, js };
}

export function mangleClasses({ html, js }) {
  // Pass 1: count uses so that the most frequent classes get the shortest names.
  const uses = new Map();
  rewrite({ html, js }, (name) => {
    uses.set(name, (uses.get(name) ?? 0) + 1);
    return name;
  });
  const names = [...uses.keys()].sort((a, b) => uses.get(b) - uses.get(a));
  const map = new Map(names.map((name, i) => [name, shortName(i)]));

  // Pass 2: apply.
  const out = rewrite({ html, js }, (name) => map.get(name));

  for (const name of map.keys()) {
    if (out.js.includes(`"${name}"`) || out.js.includes(`".${name}`)) {
      throw new Error(`Klasse "${name}" wird im JS noch ausserhalb von classList/querySelector verwendet`);
    }
  }
  return { ...out, map };
}
