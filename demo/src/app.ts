import { send, enqueue } from './notify';

// Every call site freezes `channel` to "email": the "sms" branch is a green dead branch.
export function welcome(name: string): string { return send(`Welcome, ${name}`, 'email'); }
export function receipt(id: number): string { return send(`Receipt #${id}`, 'email'); }

// `priority` is genuinely varied, so unwired must NOT flag it.
export function scheduleA(m: string): string { return enqueue(m, 1); }
export function scheduleB(m: string): string { return enqueue(m, 5); }
