/// <reference lib="webworker" />
// Pyodide runs Python entirely in this Web Worker, off the main thread, so a slow
// or runaway student program never freezes the lesson UI. No execution backend.

const PYODIDE_VERSION = '0.26.2';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;
let loadingPackages = new Set<string>();

type InMsg =
  | { type: 'init' }
  | { type: 'run'; runId: number; code: string; setup?: string; packages?: string[] }
  | { type: 'eval'; runId: number; expr: string };

// Harness that wraps every run. It executes setup + student code inside a fresh
// module-like namespace dict (`_ns`), captures stdout/stderr, and records the set
// of identifiers the student's source references (for the ast verifier).
const HARNESS = `
import sys, io, ast, json

_ns = {}

def _collect_ast_names(src):
    names = set()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.For, ast.While, ast.If, ast.Try, ast.With)):
            names.add(type(node).__name__.lower())
    return sorted(names)

def _run(setup_src, student_src):
    global _ns
    _ns = {}
    out, err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    crashed = False
    try:
        if setup_src:
            exec(setup_src, _ns)
        exec(student_src, _ns)
    except Exception as e:
        crashed = True
        print(repr(e), file=sys.stderr)
    finally:
        sys.stdout, sys.stderr = old_out, old_err

    _ns['__ast_names__'] = _collect_ast_names(student_src)

    # Only surface JSON-serializable, non-callable names to the main thread.
    safe_ns = {}
    for k, v in _ns.items():
        if k.startswith('__') and k != '__ast_names__':
            continue
        try:
            json.dumps(v)
            safe_ns[k] = v
        except (TypeError, ValueError):
            pass
    return {
        'stdout': out.getvalue(),
        'stderr': err.getvalue(),
        'namespace': safe_ns,
        'crashed': crashed,
    }

def _eval(expr):
    # Evaluate against the persisted namespace from the last _run.
    try:
        value = eval(expr, _ns)
        try:
            json.dumps(value)
        except (TypeError, ValueError):
            value = repr(value)
        return {'value': value, 'error': None}
    except Exception as e:
        return {'value': None, 'error': repr(e)}
`;

async function ensurePyodide() {
  if (pyodide) return;
  // Load the ESM build from the CDN. /* @vite-ignore */ keeps Vite from trying to
  // bundle a remote URL; it stays a runtime dynamic import inside the module worker.
  const mod = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
  pyodide = await mod.loadPyodide({ indexURL: PYODIDE_CDN });
  await pyodide.runPythonAsync(HARNESS);
}

async function ensurePackages(packages: string[]) {
  const needed = packages.filter((p) => p && !loadingPackages.has(p));
  if (needed.length === 0) return;
  needed.forEach((p) => loadingPackages.add(p));
  // micropip handles pure-Python wheels (fastapi, pydantic, etc.).
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  for (const p of needed) {
    try {
      await micropip.install(p);
    } catch {
      // Fall back to bundled package set; report nothing fatal here.
      try {
        await pyodide.loadPackage(p);
      } catch {
        /* leave to the runtime error if the import then fails */
      }
    }
  }
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      await ensurePyodide();
      self.postMessage({ type: 'ready' });
      return;
    }

    await ensurePyodide();

    if (msg.type === 'run') {
      const started = performance.now();
      if (msg.packages?.length) await ensurePackages(msg.packages);
      const runFn = pyodide.globals.get('_run');
      const resultProxy = runFn(msg.setup ?? '', msg.code);
      const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
      resultProxy.destroy();
      runFn.destroy();
      self.postMessage({
        type: 'run:done',
        runId: msg.runId,
        result: { ...result, durationMs: Math.round(performance.now() - started) },
      });
      return;
    }

    if (msg.type === 'eval') {
      const evalFn = pyodide.globals.get('_eval');
      const proxy = evalFn(msg.expr);
      const value = proxy.toJs({ dict_converter: Object.fromEntries });
      proxy.destroy();
      evalFn.destroy();
      self.postMessage({ type: 'eval:done', runId: msg.runId, result: value });
      return;
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      runId: 'runId' in msg ? msg.runId : -1,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
