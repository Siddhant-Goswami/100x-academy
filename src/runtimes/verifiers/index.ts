import type { Verifier } from './types';
import { stdoutVerifier } from './stdout';
import { unitVerifier } from './unit';
import { astVerifier } from './ast';
import { apiContractVerifier } from './apiContract';
import { agentTraceVerifier } from './agentTrace';
import { llmRubricVerifier } from './llmRubric';

// Maps the lesson spec's verifier.type to its implementation. Four of these run
// fully client-side; only llm_rubric calls the proxy.
export const verifiers: Record<string, Verifier> = {
  stdout: stdoutVerifier,
  unit: unitVerifier,
  ast: astVerifier,
  api_contract: apiContractVerifier,
  agent_trace: agentTraceVerifier,
  llm_rubric: llmRubricVerifier,
};

export type VerifierType = keyof typeof verifiers;
export * from './types';
