import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLexicon, unlockSpells, SPELLS, SPELLS_PER_WAVE } from '../src/lexicon.js';

const pool = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, name: `Spell ${n}`, effects: ['x'] }));

test('lexicon: a new one is empty', () => {
  assert.deepEqual(createLexicon(), []);
});

test('unlockSpells: adds two spells per call and never the same one twice', () => {
  const lex = createLexicon();
  const a = unlockSpells(lex, pool);
  const b = unlockSpells(lex, pool);
  assert.equal(a.length, SPELLS_PER_WAVE);
  assert.equal(b.length, SPELLS_PER_WAVE);
  assert.equal(lex.length, 4);
  assert.equal(new Set(lex.map((s) => s.id)).size, 4);
});

test('unlockSpells: picks via the injected random function', () => {
  const lex = createLexicon();
  unlockSpells(lex, pool, 2, () => 0);
  assert.deepEqual(lex.map((s) => s.id), ['s1', 's2']);
  unlockSpells(lex, pool, 1, () => 0.999);
  assert.equal(lex[2].id, 's5');
});

test('unlockSpells: hands out only what is left and then nothing', () => {
  const lex = createLexicon();
  unlockSpells(lex, pool);
  unlockSpells(lex, pool);
  assert.equal(unlockSpells(lex, pool).length, 1);
  assert.equal(unlockSpells(lex, pool).length, 0);
  assert.equal(lex.length, pool.length);
});

test('unlockSpells: leaves the pool untouched', () => {
  const copy = structuredClone(pool);
  unlockSpells(createLexicon(), pool);
  assert.deepEqual(pool, copy);
});

test('spells.json: valid entries with unique ids', () => {
  assert.ok(SPELLS.length >= 2 * SPELLS_PER_WAVE);
  assert.equal(new Set(SPELLS.map((s) => s.id)).size, SPELLS.length);
  for (const s of SPELLS) {
    assert.ok(s.id && s.name, 'id and name');
    assert.ok(Array.isArray(s.effects) && s.effects.length > 0, `${s.id} needs effects`);
    assert.ok(s.effects.every((e) => typeof e === 'string' && e.length > 0));
  }
});

test('spells.json: texts are plain text (no markup characters, sane length)', () => {
  for (const s of SPELLS) {
    for (const text of [s.name, ...s.effects]) {
      assert.ok(!/[<>]/.test(text), `${s.id}: "${text}" contains markup characters`);
      assert.ok(text.length <= 60, `${s.id}: "${text}" is too long for the panel`);
    }
  }
});
