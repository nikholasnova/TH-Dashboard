import crypto from 'node:crypto';

export function timingSafeCompare(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const A = crypto.createHash('sha256').update(a).digest();
  const B = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(A, B);
}
