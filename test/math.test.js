import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, length, normalize, angleDiff } from '../src/math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('length returns the euclidean norm', () => {
  assert.equal(length(3, 4), 5);
  assert.equal(length(0, 0), 0);
  assert.equal(length(-3, -4), 5);
});

test('normalize returns a unit vector', () => {
  const n = normalize(3, 4);
  close(n.x, 0.6);
  close(n.y, 0.8);
  close(Math.hypot(n.x, n.y), 1);
});

test('normalize of the zero vector is zero (no NaN)', () => {
  assert.deepEqual(normalize(0, 0), { x: 0, y: 0 });
});

test('angleDiff is zero for equal angles', () => {
  assert.equal(angleDiff(1, 1), 0);
});

test('angleDiff returns the signed shortest difference', () => {
  close(angleDiff(0.5, 0.2), 0.3);
  close(angleDiff(0.2, 0.5), -0.3);
});

test('angleDiff wraps around +-PI', () => {
  // 170 deg - (-170 deg) = 340 deg -> shortest is -20 deg
  const deg = (d) => (d * Math.PI) / 180;
  close(angleDiff(deg(170), deg(-170)), deg(-20));
  close(angleDiff(deg(-170), deg(170)), deg(20));
});

test('angleDiff handles multiples of a full turn', () => {
  close(angleDiff(Math.PI * 6 + 0.1, 0), 0.1);
  close(angleDiff(-Math.PI * 6 - 0.1, 0), -0.1);
});

test('angleDiff result is always within [-PI, PI]', () => {
  for (let a = -10; a <= 10; a += 0.37) {
    for (let b = -10; b <= 10; b += 0.41) {
      const d = angleDiff(a, b);
      assert.ok(d >= -Math.PI - 1e-9 && d <= Math.PI + 1e-9);
    }
  }
});
