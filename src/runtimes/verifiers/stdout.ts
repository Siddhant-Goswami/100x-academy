import type { Verifier } from './types';

// Compares trimmed stdout against the expected text in the lesson spec.
// The cheapest possible check: the student prints, we diff the print.
export const stdoutVerifier: Verifier = async (run, spec) => {
  if (run.crashed) {
    return { passed: false, message: run.stderr.trim() || 'Your code raised an error.' };
  }
  const expected = String(spec.expected_stdout ?? '').trim();
  const actual = run.stdout.trim();
  if (actual === expected) {
    return { passed: true, message: 'Output matches. Nice.' };
  }
  return {
    passed: false,
    message: `Expected output:\n${expected}\n\nYour output:\n${actual || '(nothing printed)'}`,
    details: { expected, actual },
  };
};
