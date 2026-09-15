import { score, clamp, discount, tax } from './scoring';

export function runA(v: number): number { return clamp(score(v, true), 100); }
export function runB(v: number): number { return clamp(score(v, true), 250); }

// `max` here is 100 then 250: a genuinely varied parameter, never flagged.

export function runC(p: number): number { return discount(p, false) + discount(p * 2, false); }

export function runD(a: number): number { return tax(a, 'EU'); }

// lazyLoaded is wired through a destructured dynamic import at runtime:
//   const { lazyLoaded } = await import('./scoring');
// Its name appears here in text, so the cross-check must not call it dead.
