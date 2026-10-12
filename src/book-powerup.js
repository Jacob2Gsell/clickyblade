// The book power-up. It appears once the player has dealt DAMAGE_PER_BOOK damage in total, and opens the lexicon
// when touched. Damage counts at face value, so overkill on a nearly dead enemy still adds up. No DOM here.

export const DAMAGE_PER_BOOK = 10;
export const BOOK_LIFE = 6;        // seconds until an untouched book disappears
export const BOOK_RADIUS = 16;
const BLINK_TIME = 2;              // the book blinks during its last seconds
const SPAWN_MARGIN = 40;           // px away from the arena edge
const MIN_PLAYER_DISTANCE = 150;   // px, so the book is not collected by accident
const SPAWN_TRIES = 20;

export const createDamageTracker = () => ({ total: 0, nextAt: DAMAGE_PER_BOOK });

// Adds dealt damage. Returns how many books were earned with it (0 most of the time).
export function trackDamage(t, amount) {
  if (!Number.isFinite(amount)) return 0; // an infinite amount would never stop the loop below
  t.total += amount;
  let earned = 0;
  while (t.total >= t.nextAt) {
    t.nextAt += DAMAGE_PER_BOOK;
    earned++;
  }
  return earned;
}

// A book at a random spot inside the arena, away from the player. random is injectable for tests.
export function spawnBook(bounds, player, random = Math.random) {
  let x = 0, y = 0;
  for (let i = 0; i < SPAWN_TRIES; i++) {
    x = bounds.x + SPAWN_MARGIN + random() * Math.max(0, bounds.w - SPAWN_MARGIN * 2);
    y = bounds.y + SPAWN_MARGIN + random() * Math.max(0, bounds.h - SPAWN_MARGIN * 2);
    if (Math.hypot(x - player.x, y - player.y) >= MIN_PLAYER_DISTANCE) break;
  }
  return { x, y, radius: BOOK_RADIUS, age: 0 };
}

// Ages the book. Returns false once it has disappeared.
export function updateBook(book, dt) {
  book.age += dt;
  return book.age < BOOK_LIFE;
}

export const touchesBook = (book, player) =>
  Math.hypot(book.x - player.x, book.y - player.y) < book.radius + player.radius;

// Draws the book icon (an <img> of icons/book.svg). It blinks during its last seconds.
export function drawBook(ctx, book, image) {
  const blinkOff = book.age > BOOK_LIFE - BLINK_TIME && Math.floor(book.age * 6) % 2 === 1;
  if (blinkOff) return;
  const size = book.radius * 2.5;
  ctx.drawImage(image, book.x - size / 2, book.y - size / 2, size, size);
}
