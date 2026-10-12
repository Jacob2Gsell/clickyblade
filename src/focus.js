// Focus mode timer. Every focus mode starts with FOCUS_DURATION seconds of real time. Cast spells add bonus
// time, words that run out unfinished cost time. No DOM here, so it can be tested on its own.

export const FOCUS_DURATION = 3;
export const BONUS_STEPS = [1, 0.6, 0.2]; // bonus for the 1st, 2nd and 3rd spell of one focus mode ...
export const BONUS_REST = 0.2;            // ... and for every further spell
export const TYPO_PENALTY = 0.5;

export const createFocus = () => ({ time: 0, castCount: 0 });

export function startFocus(f) {
  f.time = FOCUS_DURATION;
  f.castCount = 0;
}

// Leaving focus mode: the bonus sequence starts again next time.
export function endFocus(f) {
  f.time = 0;
  f.castCount = 0;
}

// Real time that passes. Returns true once the time is used up.
export function tickFocus(f, dt) {
  f.time -= dt;
  return f.time <= 0;
}

// A spell was cast. The total never exceeds FOCUS_DURATION, the rest is cut off.
// Returns the time that was really added.
export function addBonus(f) {
  const bonus = BONUS_STEPS[f.castCount] ?? BONUS_REST;
  f.castCount++;
  const before = f.time;
  f.time = Math.min(FOCUS_DURATION, f.time + bonus);
  return Math.round((f.time - before) * 100) / 100;
}

// A started word ran out. Returns the time that was really taken away (never more than what was left).
export function applyPenalty(f) {
  const taken = Math.min(TYPO_PENALTY, Math.max(0, f.time));
  f.time -= TYPO_PENALTY;
  return Math.round(taken * 100) / 100;
}

// Share of the full bar that is left, 0 to 1.
export const focusRatio = (f) => Math.min(1, Math.max(0, f.time / FOCUS_DURATION));
