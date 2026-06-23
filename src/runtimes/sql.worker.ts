/// <reference lib="webworker" />
// Phase placeholder: DuckDB-WASM SQL runtime. Mirrors the python.worker protocol
// (init / run / eval) so the SQL module drops into the same CodeRunner and
// verifier flow without UI changes. Not wired up for the APIs pilot.
//
// When implemented: load @duckdb/duckdb-wasm, run the student's SQL against an
// in-memory database seeded by the lesson's verifier.setup, and return rows as the
// RunResult namespace for the unit verifier to assert on.

export {};

self.onmessage = (e: MessageEvent) => {
  const { type, runId } = e.data ?? {};
  if (type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }
  self.postMessage({
    type: 'error',
    runId: runId ?? -1,
    error: 'SQL runtime (DuckDB-WASM) is not implemented in the day-one slice.',
  });
};
