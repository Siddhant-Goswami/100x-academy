import type { RunResult } from '../runtimes/verifiers/types';

interface RunArgs {
  code: string;
  setup?: string;
  packages?: string[];
}

// Owns a single Pyodide worker and serializes run/eval round-trips over it.
// One instance per Exercise. The first run pays the Pyodide load cost; later runs
// reuse the warm interpreter.
export class CodeRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private ready: Promise<void> | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // Vite resolves this URL form and bundles the worker.
    this.worker = new Worker(new URL('../runtimes/python.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent) => {
      const { type, runId, result, error } = e.data;
      if (type === 'ready') return;
      const p = this.pending.get(runId);
      if (!p) return;
      this.pending.delete(runId);
      if (type === 'error') p.reject(new Error(error));
      else p.resolve(result);
    };
    return this.worker;
  }

  // Resolves once Pyodide has loaded, so the UI can show a one-time "warming up".
  warm(): Promise<void> {
    if (this.ready) return this.ready;
    const w = this.ensureWorker();
    this.ready = new Promise<void>((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          w.removeEventListener('message', onReady);
          resolve();
        }
      };
      w.addEventListener('message', onReady);
      w.postMessage({ type: 'init' });
    });
    return this.ready;
  }

  private call<T>(payload: Record<string, unknown>): Promise<T> {
    const w = this.ensureWorker();
    const runId = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(runId, { resolve, reject });
      w.postMessage({ ...payload, runId });
    });
  }

  async run(args: RunArgs): Promise<RunResult> {
    await this.warm();
    return this.call<RunResult>({ type: 'run', ...args });
  }

  // Used by unit / api_contract verifiers to evaluate a case expression against
  // the namespace left behind by the last run.
  evalInWorker(expr: string): Promise<{ value: unknown; error?: string }> {
    return this.call<{ value: unknown; error?: string }>({ type: 'eval', expr });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.pending.clear();
  }
}
