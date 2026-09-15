/**
 * A notification helper that supports two channels. The SMS branch is correct,
 * unit-tested, and green in CI. It has simply never run in production: every real
 * call site below passes the string literal "email".
 *
 * This is the shape unwired is built to catch. A test that calls send(..., "sms")
 * directly proves the branch WORKS; it says nothing about whether it is REACHED.
 */
export function send(message: string, channel: string): string {
  if (channel === 'sms') return `SMS: ${message}`;
  return `EMAIL: ${message}`;
}

/** A healthy parameter for contrast: production genuinely varies the priority. */
export function enqueue(message: string, priority: number): string {
  return `[p${priority}] ${message}`;
}
