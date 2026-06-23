// The shared contract between the runtime worker, the verifiers, and the UI.

export interface AgentStep {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  // Names the student defined, for unit checks. Populated by the worker after exec.
  namespace?: Record<string, unknown>;
  // Tool calls and final answer, for agent_trace.
  trace?: AgentStep[];
  durationMs: number;
  // True when the runtime itself errored (syntax error, exception) before any verifier ran.
  crashed?: boolean;
}

export interface VerifierResult {
  passed: boolean;
  score?: number;
  message: string; // shown to the student
  details?: unknown; // per-case breakdown
}

export interface VerifierCtx {
  // Lets a verifier re-run student code in the worker with a different harness
  // (e.g. unit cases call student functions and capture return values).
  evalInWorker: (pythonExpr: string) => Promise<{ value: unknown; error?: string }>;
}

export type Verifier = (
  run: RunResult,
  spec: any,
  ctx: VerifierCtx,
) => Promise<VerifierResult>;
