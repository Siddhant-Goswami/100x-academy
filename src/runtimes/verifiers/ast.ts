import type { Verifier } from './types';

// Structural check: assert the student's source uses (or avoids) named constructs.
// The actual parse happens in the Python worker via the `ast` module; here we read
// the precomputed `usedNames` the worker attaches to the namespace under __ast_names__.
// `must_use` is a list of identifiers/keywords that must all appear.
export const astVerifier: Verifier = async (run, spec) => {
  if (run.crashed) {
    return { passed: false, message: run.stderr.trim() || 'Your code raised an error.' };
  }
  const used = (run.namespace?.['__ast_names__'] as string[]) ?? [];
  const mustUse: string[] = spec.must_use ?? [];
  const missing = mustUse.filter((name) => !used.includes(name));
  if (missing.length === 0) {
    return { passed: true, message: 'Your solution uses the expected constructs.' };
  }
  return {
    passed: false,
    message: `Your solution should use: ${missing.join(', ')}.`,
    details: { used, missing },
  };
};
