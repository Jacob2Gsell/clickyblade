// Floating damage numbers: each hit on an enemy shows the health it took away,
// rising smoothly above the enemy and fading out until it disappears.

export const DAMAGE_NUMBER_LIFE = 0.8; // seconds until a number is gone
export const DAMAGE_NUMBER_RISE = 30;  // px the number travels upwards over its life
export const DAMAGE_NUMBER_LIFT = 18;  // px above the enemy's top edge where a number starts
const LANE_OFFSETS = [0, -16, 16, -32, 32]; // horizontal slots for numbers hitting the same spot
const LANE_CLEARANCE_X = 12; // px, closer than this sideways ...
const LANE_CLEARANCE_Y = 16; // px, ... and closer than this vertically counts as overlapping

// Vertical position of a number: starts at y0 and eases out, so it slows down near the top.
function popupY(p) {
  const t = p.age / DAMAGE_NUMBER_LIFE;
  return p.y0 - DAMAGE_NUMBER_RISE * (1 - (1 - t) * (1 - t));
}

// Adds a number for `amount` health taken from enemy e. list is the array of live numbers.
export function spawnDamageNumber(list, e, amount) {
  const y0 = e.y - e.radius - DAMAGE_NUMBER_LIFT;
  // Take the first lane where no live number is sitting on top of the new one.
  const lane = LANE_OFFSETS.find((dx) => {
    const x = e.x + dx;
    return !list.some((p) => Math.abs(p.x - x) < LANE_CLEARANCE_X && Math.abs(popupY(p) - y0) < LANE_CLEARANCE_Y);
  }) ?? 0;
  list.push({ x: e.x + lane, y0, age: 0, text: String(Math.round(amount * 10) / 10) });
}

// Ages all numbers and removes the ones that have faded out.
export function updateDamageNumbers(list, dt) {
  for (const p of list) p.age += dt;
  const alive = list.filter((p) => p.age < DAMAGE_NUMBER_LIFE);
  list.length = 0;
  list.push(...alive);
}

export function drawDamageNumbers(ctx, list) {
  if (list.length === 0) return;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of list) {
    ctx.globalAlpha = 1 - p.age / DAMAGE_NUMBER_LIFE; // fully visible at the start, transparent at the end
    ctx.fillText(p.text, p.x, popupY(p));
  }
  ctx.restore();
}
