import type { Verifier } from './types';

// Phase 0: runs against a mock HTTP layer injected into the runtime, so the check
// is deterministic and never touches the network. The unit harness already drives
// the student's functions; this verifier asserts on the request/response contract
// (status, body shape) the spec declares.
//
// Phase 1 (FastAPI): the same verifier name boots the student's ASGI app in the
// Pyodide worker, sends spec requests over the ASGI bridge, and asserts on
// status, body, and headers. The contract shape below does not change.
interface ContractCase {
  call: string; // expression that returns { status, body } from the mock layer
  expect_status?: number;
  expect_body?: unknown;
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const apiContractVerifier: Verifier = async (run, spec, ctx) => {
  if (run.crashed) {
    return { passed: false, message: run.stderr.trim() || 'Your code raised an error.' };
  }
  const cases: ContractCase[] = spec.cases ?? [];
  const details: Array<{ call: string; ok: boolean; note?: string }> = [];

  for (const c of cases) {
    const { value, error } = await ctx.evalInWorker(c.call);
    if (error) {
      details.push({ call: c.call, ok: false, note: `error: ${error}` });
      continue;
    }
    const resp = (value ?? {}) as { status?: number; body?: unknown };
    let ok = true;
    let note = '';
    if (c.expect_status !== undefined && resp.status !== c.expect_status) {
      ok = false;
      note = `status ${resp.status}, expected ${c.expect_status}`;
    }
    if (ok && c.expect_body !== undefined && !eq(resp.body, c.expect_body)) {
      ok = false;
      note = `body did not match contract`;
    }
    details.push({ call: c.call, ok, note });
  }

  const failed = details.filter((d) => !d.ok);
  if (failed.length === 0) {
    return { passed: true, message: `Contract holds across ${details.length} requests.`, details };
  }
  return {
    passed: false,
    message: `Contract broke on ${failed.length} request(s). First: ${failed[0].call} (${failed[0].note}).`,
    details,
  };
};
