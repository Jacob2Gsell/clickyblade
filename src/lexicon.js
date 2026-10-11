import spellPool from './data/spells.json' with { type: 'json' };

// The lexicon is a plain in-memory array of spells (see src/data/spells.json); a new game starts with an empty one.
export const SPELLS = spellPool;
export const SPELLS_PER_WAVE = 2;

export const createLexicon = () => [];

// Appends `count` random spells that the lexicon doesn't know yet. Returns the spells that were added
// (fewer than `count`, or none, once the pool runs dry). `random` is injectable for tests.
export function unlockSpells(lexicon, pool = SPELLS, count = SPELLS_PER_WAVE, random = Math.random) {
  const known = new Set(lexicon.map((s) => s.id));
  const rest = pool.filter((s) => !known.has(s.id));
  const picked = [];
  while (picked.length < count && rest.length > 0) {
    picked.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  }
  lexicon.push(...picked);
  return picked;
}

// Spell names are compared in uppercase and ignoring extra spaces, so "  ember   lash " matches "Ember Lash".
const normalizeName = (text) => text.trim().replace(/\s+/g, ' ').toUpperCase();

// How many leading letters of the spell's name the typed text matches (0 if it is not the start of the name).
export function matchedPrefixLength(spell, text) {
  const typed = normalizeName(text);
  return typed !== '' && normalizeName(spell.name).startsWith(typed) ? typed.length : 0;
}

// The spell in the lexicon whose name equals `text`, or undefined. Only spells already in the lexicon can be cast.
export function findKnownSpell(lexicon, text) {
  const wanted = normalizeName(text);
  return lexicon.find((s) => normalizeName(s.name) === wanted);
}
