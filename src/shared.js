// Constants and drawing helpers that more than one character uses.

export const RADIUS = 16;
export const KNOCKBACK = 600;

// A blade drawn from (x, y) pointing along angle. alpha < 1 makes resting weapons look dimmer.
export function drawBlade(ctx, x, y, angle, alpha, reach) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#ddd';
  ctx.fillRect(14, -2.5, reach - 14, 5);
  ctx.fillStyle = '#a73';
  ctx.fillRect(10, -7, 4, 14);
  ctx.restore();
}
