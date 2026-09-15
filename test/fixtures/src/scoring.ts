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

/** Frozen to `false` at every production call site (two of them). */
export function discount(price: number, isPremium: boolean): number {
  return isPremium ? price * 0.9 : price;
}

/**
 * Frozen at a SINGLE production call site. One call site is still enough: the useful
 * branch (a region other than "EU") never runs in production.
 */
export function tax(amount: number, region: string): number {
  return region === 'EU' ? amount * 1.2 : amount;
}

/**
 * Loaded lazily through a destructured dynamic import elsewhere, so symbol resolution
 * misses the reference. The text cross-check must keep it OUT of the dead list.
 */
export function lazyLoaded(x: number): number {
  return x + 1;
}
