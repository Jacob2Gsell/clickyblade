import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDamageTracker, trackDamage, spawnBook, updateBook, touchesBook,
  DAMAGE_PER_BOOK, BOOK_LIFE, BOOK_RADIUS, drawBook,
} from '../src/book-powerup.js';

test('book: 10 damage is the threshold', () => {
  assert.equal(DAMAGE_PER_BOOK, 10);
  const t = createDamageTracker();
  assert.equal(trackDamage(t, 9), 0);
  assert.equal(trackDamage(t, 1), 1);
});

test('book: damage counts at face value, overkill included (2, 4, 6, 8 ... adds up to 10)', () => {
  const t = createDamageTracker();
  // 7 hp enemy hit by 2 damage per swing: the enemy takes 2+2+2+2 = 8 counted damage, not 7.
  assert.equal(trackDamage(t, 2), 0);
  assert.equal(trackDamage(t, 2), 0);
  assert.equal(trackDamage(t, 2), 0);
  assert.equal(trackDamage(t, 2), 0);
  assert.equal(t.total, 8);
  assert.equal(trackDamage(t, 2), 1, 'the 5th swing reaches 10');
});

test('book: a single big hit can earn several books, and the next one needs another 10', () => {
  const t = createDamageTracker();
  assert.equal(trackDamage(t, 25), 2);
  assert.equal(t.nextAt, 30);
  assert.equal(trackDamage(t, 4), 0);
  assert.equal(trackDamage(t, 1), 1);
});

test('book: spawns inside the arena and away from the player', () => {
  const bounds = { x: 20, y: 20, w: 1000, h: 700 };
  const player = { x: 500, y: 370 };
  for (const r of [0, 0.3, 0.7, 0.999]) {
    const b = spawnBook(bounds, player, () => r);
    assert.ok(b.x >= bounds.x && b.x <= bounds.x + bounds.w, `x ${b.x} outside the arena`);
    assert.ok(b.y >= bounds.y && b.y <= bounds.y + bounds.h, `y ${b.y} outside the arena`);
  }
  // The first random pair puts the book right on the player, so the next pair is used instead.
  const rolls = [0.5, 0.5, 0.1, 0.1];
  const b = spawnBook(bounds, player, () => rolls.shift());
  assert.ok(Math.hypot(b.x - player.x, b.y - player.y) >= 150);
});

test('book: disappears after BOOK_LIFE seconds', () => {
  const b = { x: 0, y: 0, radius: BOOK_RADIUS, age: 0 };
  assert.equal(updateBook(b, BOOK_LIFE - 0.1), true);
  assert.equal(updateBook(b, 0.2), false);
});

test('book: touching it needs the player and the book to overlap', () => {
  const player = { x: 100, y: 100, radius: 12 };
  const far = { x: 100 + 40, y: 100, radius: BOOK_RADIUS };
  const near = { x: 100 + 20, y: 100, radius: BOOK_RADIUS };
  assert.equal(touchesBook(far, player), false);
  assert.equal(touchesBook(near, player), true);
});

test('book: exactly touching edges do not count as touching', () => {
  const player = { x: 0, y: 0, radius: 12 };
  const edge = { x: BOOK_RADIUS + 12, y: 0, radius: BOOK_RADIUS };
  assert.equal(touchesBook(edge, player), false);
});

test('book: it is still there one tick before its life is over, and gone at the end', () => {
  const b = { x: 0, y: 0, radius: BOOK_RADIUS, age: 0 };
  assert.equal(updateBook(b, BOOK_LIFE - 0.001), true);
  assert.equal(updateBook(b, 0.001), false);
});

test('book: a 0 damage hit earns nothing and changes nothing', () => {
  const t = createDamageTracker();
  trackDamage(t, 9);
  assert.equal(trackDamage(t, 0), 0);
  assert.equal(t.total, 9);
  assert.equal(t.nextAt, 10);
});

test('book: a non-finite damage value earns nothing and cannot hang the loop', () => {
  const t = createDamageTracker();
  assert.equal(trackDamage(t, Infinity), 0);
  assert.equal(trackDamage(t, NaN), 0);
  assert.equal(t.total, 0);
  assert.equal(t.nextAt, 10);
});

test('book: when no spawn spot is far enough, it still lands inside the arena', () => {
  const bounds = { x: 0, y: 0, w: 200, h: 200 };
  const player = { x: 100, y: 100 };
  const b = spawnBook(bounds, player, () => 0.5);
  assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'no NaN position');
  assert.ok(b.x >= 0 && b.x <= 200 && b.y >= 0 && b.y <= 200);
});

test('book: draws the image, and skips a frame during the blink at the end', () => {
  const calls = [];
  const ctx = { drawImage: (...args) => calls.push(args) };
  const img = { id: 'icon' };
  const b = { x: 50, y: 60, radius: BOOK_RADIUS, age: 1 };
  drawBook(ctx, b, img);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], img);
  b.age = 4.25; // inside the blink window, on an "off" phase
  drawBook(ctx, b, img);
  assert.equal(calls.length, 1, 'blink phase skipped the draw');
  b.age = 4.0; // inside the blink window, on an "on" phase
  drawBook(ctx, b, img);
  assert.equal(calls.length, 2);
});
