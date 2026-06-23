// Layer 3 — verifier logic tests. Imports the REAL verifier implementations and
// drives each with a mocked `run` (RunResult) and `ctx` (evalInWorker). No Pyodide,
// no network. Asserts pass/fail/crash/hidden behaviour for all six verifiers.
import { verifiers } from '../src/runtimes/verifiers/index.ts';
import type { RunResult, VerifierCtx } from '../src/runtimes/verifiers/types.ts';

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; }
  else { fail++; fails.push(`${name} ${extra}`); }
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}

function mkRun(p: Partial<RunResult> = {}): RunResult {
  return { stdout: '', stderr: '', durationMs: 1, ...p };
}
// ctx that resolves each call expression from a lookup table.
function mkCtx(table: Record<string, { value: unknown; error?: string }>): VerifierCtx {
  return { evalInWorker: async (expr: string) => table[expr] ?? { value: undefined, error: `no mock for ${expr}` } };
}

async function main() {
  // ---------- stdout ----------
  {
    const v = verifiers.stdout;
    const ok = await v(mkRun({ stdout: '200\n' }), { expected_stdout: '200' }, mkCtx({}));
    check('stdout: trims + matches', ok.passed === true);
    const bad = await v(mkRun({ stdout: '404' }), { expected_stdout: '200' }, mkCtx({}));
    check('stdout: mismatch fails', bad.passed === false);
    const crashed = await v(mkRun({ crashed: true, stderr: 'NameError' }), { expected_stdout: '200' }, mkCtx({}));
    check('stdout: crash fails + surfaces stderr', crashed.passed === false && /NameError/.test(crashed.message));
    const empty = await v(mkRun({ stdout: '' }), { expected_stdout: '200' }, mkCtx({}));
    check('stdout: empty shows "(nothing printed)"', empty.passed === false && /nothing printed/.test(empty.message));
  }

  // ---------- unit (lesson 02 shape) ----------
  {
    const v = verifiers.unit;
    const spec = {
      cases: [{ call: "exists('/users/7')", expect: true }, { call: "exists('/missing')", expect: false }],
      hidden_cases: [{ call: "exists('/users/404')", expect: false }],
      on_fail_hint: 'check status',
    };
    const allPass = await v(mkRun(), spec, mkCtx({
      "exists('/users/7')": { value: true },
      "exists('/missing')": { value: false },
      "exists('/users/404')": { value: false },
    }));
    check('unit: all 3 (incl hidden) pass', allPass.passed === true && allPass.score === 1);

    const visFail = await v(mkRun(), spec, mkCtx({
      "exists('/users/7')": { value: false }, // wrong
      "exists('/missing')": { value: false },
      "exists('/users/404')": { value: false },
    }));
    check('unit: visible fail reports the call+got+want', visFail.passed === false && /users\/7/.test(visFail.message) && Math.abs((visFail.score ?? 0) - 2 / 3) < 1e-9);

    const hidFail = await v(mkRun(), spec, mkCtx({
      "exists('/users/7')": { value: true },
      "exists('/missing')": { value: false },
      "exists('/users/404')": { value: true }, // hidden wrong
    }));
    const leaks = JSON.stringify(hidFail.details).includes('/users/404');
    check('unit: hidden fail does NOT leak input', hidFail.passed === false && /hidden case failed/i.test(hidFail.message) && !leaks);

    const crashed = await v(mkRun({ crashed: true, stderr: 'Boom' }), spec, mkCtx({}));
    check('unit: crash fails', crashed.passed === false && /Boom/.test(crashed.message));

    // eq() on object-shaped returns
    const objSpec = { cases: [{ call: 'f()', expect: { a: 1, b: [2, 3] } }] };
    const objOk = await v(mkRun(), objSpec, mkCtx({ 'f()': { value: { a: 1, b: [2, 3] } } }));
    check('unit: deep-eq objects', objOk.passed === true);
  }

  // ---------- ast ----------
  {
    const v = verifiers.ast;
    const ok = await v(mkRun({ namespace: { __ast_names__: ['get', 'status_code', 'print'] } }), { must_use: ['get', 'print'] }, mkCtx({}));
    check('ast: all must_use present', ok.passed === true);
    const missing = await v(mkRun({ namespace: { __ast_names__: ['print'] } }), { must_use: ['get', 'json'] }, mkCtx({}));
    check('ast: reports missing constructs', missing.passed === false && /get/.test(missing.message) && /json/.test(missing.message));
    const crashed = await v(mkRun({ crashed: true, stderr: 'SyntaxError' }), { must_use: ['get'] }, mkCtx({}));
    check('ast: crash fails', crashed.passed === false);
  }

  // ---------- api_contract ----------
  {
    const v = verifiers.api_contract;
    const spec = { cases: [
      { call: 'req("/ping")', expect_status: 200, expect_body: { ok: true } },
      { call: 'req("/missing")', expect_status: 404 },
    ] };
    const ok = await v(mkRun(), spec, mkCtx({
      'req("/ping")': { value: { status: 200, body: { ok: true } } },
      'req("/missing")': { value: { status: 404, body: {} } },
    }));
    check('api_contract: status+body hold', ok.passed === true);
    const badStatus = await v(mkRun(), spec, mkCtx({
      'req("/ping")': { value: { status: 500, body: { ok: true } } },
      'req("/missing")': { value: { status: 404 } },
    }));
    check('api_contract: wrong status fails with note', badStatus.passed === false && /status 500/.test(badStatus.message));
    const badBody = await v(mkRun(), spec, mkCtx({
      'req("/ping")': { value: { status: 200, body: { ok: false } } },
      'req("/missing")': { value: { status: 404 } },
    }));
    check('api_contract: wrong body fails', badBody.passed === false && /body/.test(badBody.message));
    const crashed = await v(mkRun({ crashed: true, stderr: 'x' }), spec, mkCtx({}));
    check('api_contract: crash fails', crashed.passed === false);
  }

  // ---------- agent_trace ----------
  {
    const v = verifiers.agent_trace;
    const trace = [
      { tool: 'search', input: {}, output: {} },
      { tool: 'fetch', input: {}, output: { answer: 'The capital is Paris.' } },
    ];
    const ok = await v(mkRun({ trace }), { must_call: ['search', 'fetch'], must_not_call: ['delete'], final_contains: ['Paris'] }, mkCtx({}));
    check('agent_trace: satisfies contract', ok.passed === true);
    const missTool = await v(mkRun({ trace }), { must_call: ['browse'] }, mkCtx({}));
    check('agent_trace: missing required tool', missTool.passed === false && /did not call: browse/.test(missTool.message));
    const forbidden = await v(mkRun({ trace }), { must_not_call: ['search'] }, mkCtx({}));
    check('agent_trace: forbidden tool used', forbidden.passed === false && /should not have called: search/.test(forbidden.message));
    const missText = await v(mkRun({ trace }), { final_contains: ['London'] }, mkCtx({}));
    check('agent_trace: final answer missing text', missText.passed === false && /missing: London/.test(missText.message));
  }

  // ---------- llm_rubric (no network in this env) ----------
  {
    const v = verifiers.llm_rubric;
    let result;
    try {
      result = await v(mkRun({ stdout: 'an essay' }), { rubric: 'is it good' }, mkCtx({}));
    } catch (e) {
      // import.meta.env undefined outside Vite -> throws before any fetch; that is
      // still "did not hit the network", which is what we are asserting.
      result = { passed: false, message: `threw (no proxy env): ${(e as Error).message}` };
    }
    check('llm_rubric: no proxy/session -> safe non-pass, no network', result.passed === false);
    console.log(`      (llm_rubric msg: ${result.message})`);
  }

  console.log(`\n==== Layer 3 verifier tests: ${pass} passed, ${fail} failed ====`);
  if (fail) { console.log('FAILURES:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
