/** A frozen parameter: every production call site passes `true`. */
export function score(value: number, isMale: boolean): number {
  return isMale ? value * 1.0 : value * 0.85;
}

/** A healthy parameter: production varies it. */
export function clamp(value: number, max: number): number {
  return Math.min(value, max);
}

/** Exported for its test only. Never called in production. */
export function unusedHelper(a: number, b: number): number {
  return a + b;
}
