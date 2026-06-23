import type { Verifier } from './types';

// Phase 2 (agent module): asserts on the sequence of tool calls and the final
// answer captured in run.trace. Deterministic where possible: required tools must
// appear, forbidden tools must not, and the final answer must contain expected
// substrings. Model judging is reserved for llm_rubric.
export const agentTraceVerifier: Verifier = async (run, spec) => {
  const trace = run.trace ?? [];
  const usedTools = trace.map((s) => s.tool);
  const mustCall: string[] = spec.must_call ?? [];
  const mustNotCall: string[] = spec.must_not_call ?? [];
  const finalContains: string[] = spec.final_contains ?? [];
  const finalAnswer = String((trace.at(-1)?.output as { answer?: string })?.answer ?? '');

  const missing = mustCall.filter((t) => !usedTools.includes(t));
  const forbidden = mustNotCall.filter((t) => usedTools.includes(t));
  const missingText = finalContains.filter((s) => !finalAnswer.includes(s));

  if (missing.length === 0 && forbidden.length === 0 && missingText.length === 0) {
    return { passed: true, message: 'Agent trace satisfies the contract.' };
  }
  const problems: string[] = [];
  if (missing.length) problems.push(`did not call: ${missing.join(', ')}`);
  if (forbidden.length) problems.push(`should not have called: ${forbidden.join(', ')}`);
  if (missingText.length) problems.push(`final answer missing: ${missingText.join(', ')}`);
  return { passed: false, message: problems.join('; '), details: { usedTools, finalAnswer } };
};
