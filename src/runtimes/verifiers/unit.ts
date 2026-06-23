import type { Verifier, VerifierResult } from './types';

interface UnitCase {
  call: string;
  expect: unknown;
}

// Deep-ish equality good enough for JSON-shaped return values.
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// Injects the spec `setup` (mock layer + fixtures) ahead of the student code,
// then evaluates each `call` expression and compares its return value to `expect`.
// Visible cases report which one failed; hidden cases only report that a hidden
// case failed, so students cannot reverse-engineer the edge path.
export const unitVerifier: Verifier = async (run, spec, ctx): Promise<VerifierResult> => {
  if (run.crashed) {
    return { passed: false, message: run.stderr.trim() || 'Your code raised an error.' };
  }

  const visible: UnitCase[] = spec.cases ?? [];
  const hidden: UnitCase[] = spec.hidden_cases ?? [];
  const hint: string | undefined = spec.on_fail_hint;
  const details: Array<{ call: string; ok: boolean; got?: unknown; want?: unknown; hidden: boolean }> = [];

  const runCases = async (cases: UnitCase[], isHidden: boolean) => {
    for (const c of cases) {
      const { value, error } = await ctx.evalInWorker(c.call);
      if (error) {
        details.push({ call: c.call, ok: false, got: `error: ${error}`, want: c.expect, hidden: isHidden });
        continue;
      }
      details.push({ call: c.call, ok: eq(value, c.expect), got: value, want: c.expect, hidden: isHidden });
    }
  };

  await runCases(visible, false);
  await runCases(hidden, true);

  const failed = details.filter((d) => !d.ok);
  if (failed.length === 0) {
    return { passed: true, score: 1, message: `All ${details.length} cases passed.`, details };
  }

  const firstVisibleFail = failed.find((d) => !d.hidden);
  const lines: string[] = [];
  if (firstVisibleFail) {
    lines.push(
      `Case \`${firstVisibleFail.call}\` returned ${JSON.stringify(firstVisibleFail.got)}, expected ${JSON.stringify(
        firstVisibleFail.want,
      )}.`,
    );
  } else {
    lines.push('A hidden case failed. Think about the edge or failure path.');
  }
  if (hint) lines.push(hint);

  return {
    passed: false,
    score: (details.length - failed.length) / details.length,
    message: lines.join('\n\n'),
    // Never leak hidden-case inputs/outputs to the student.
    details: details.map((d) => (d.hidden ? { call: 'hidden', ok: d.ok, hidden: true } : d)),
  };
};
