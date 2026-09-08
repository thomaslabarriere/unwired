import { score, clamp } from './scoring';

export function runA(v: number): number { return clamp(score(v, true), 100); }
export function runB(v: number): number { return clamp(score(v, true), 250); }
