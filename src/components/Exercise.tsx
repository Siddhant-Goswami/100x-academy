import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { CodeRunner } from './CodeRunner';
import { verifiers } from '../runtimes/verifiers';
import type { RunResult, VerifierResult } from '../runtimes/verifiers/types';
import { recordAttempt, markLessonStarted, startHeartbeat } from '../lib/telemetry';
import { hasSupabase } from '../lib/supabase';

interface Props {
  lessonSlug: string;
  starter: string;
  verifier: any; // the lesson's verifier spec block
  packages?: string[];
}

type Phase = 'idle' | 'warming' | 'running' | 'done';

// CodeMirror editor + run + verify + telemetry. The single interactive surface of
// a lesson. Runs student code in a Pyodide worker, applies the spec's verifier,
// then records the attempt atomically.
export default function Exercise({ lessonSlug, starter, verifier, packages = [] }: Props) {
  const [code, setCode] = useState(starter.replace(/^\n/, ''));
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<VerifierResult | null>(null);
  const [stdout, setStdout] = useState('');
  const runnerRef = useRef<CodeRunner | null>(null);

  const runner = useMemo(() => {
    if (!runnerRef.current) runnerRef.current = new CodeRunner();
    return runnerRef.current;
  }, []);

  useEffect(() => {
    if (hasSupabase) void markLessonStarted(lessonSlug);
    const stop = hasSupabase ? startHeartbeat(lessonSlug) : undefined;
    return () => {
      stop?.();
      runner.dispose();
      runnerRef.current = null;
    };
  }, [lessonSlug, runner]);

  const verifierType = verifier?.type ?? 'stdout';

  async function handleRun() {
    setResult(null);
    setStdout('');
    setPhase(runner['ready'] ? 'running' : 'warming');

    const started = performance.now();
    let run: RunResult;
    try {
      run = await runner.run({ code, setup: verifier?.setup, packages });
    } catch (e) {
      setPhase('done');
      setResult({ passed: false, message: `Runtime error: ${(e as Error).message}` });
      return;
    }
    setPhase('running');
    setStdout(run.stdout);

    const verify = verifiers[verifierType] ?? verifiers.stdout;
    const spec = { ...verifier, __lesson_slug: lessonSlug };
    let vr: VerifierResult;
    try {
      vr = await verify(run, spec, { evalInWorker: (e) => runner.evalInWorker(e) });
    } catch (e) {
      vr = { passed: false, message: `Verifier error: ${(e as Error).message}` };
    }

    setResult(vr);
    setPhase('done');

    if (hasSupabase) {
      void recordAttempt({
        lessonSlug,
        code,
        verifierType,
        passed: vr.passed,
        score: vr.score,
        runtimeMs: Math.round(performance.now() - started),
        error: vr.passed ? undefined : run.stderr || vr.message,
      });
    }
  }

  function handleReset() {
    setCode(starter.replace(/^\n/, ''));
    setResult(null);
    setStdout('');
    setPhase('idle');
  }

  const busy = phase === 'warming' || phase === 'running';

  return (
    <div className="ex">
      <div className="ex-editor">
        <CodeMirror
          value={code}
          height="220px"
          theme="dark"
          extensions={[python()]}
          onChange={setCode}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
        />
      </div>

      <div className="ex-controls">
        <button type="button" className="ex-btn ex-btn-primary" onClick={handleRun} disabled={busy}>
          {phase === 'warming' ? 'Warming up Python...' : busy ? 'Running...' : 'Run & check'}
        </button>
        <button type="button" className="ex-btn ex-btn-ghost" onClick={handleReset} disabled={busy}>
          Reset
        </button>
        <span className="ex-verifier-badge" title="How this exercise is graded">
          {verifierType}
        </span>
      </div>

      {stdout && (
        <pre className="ex-stdout" aria-label="Program output">
          {stdout}
        </pre>
      )}

      {result && (
        <div className={`ex-result ${result.passed ? 'ex-pass' : 'ex-fail'}`} role="status">
          <strong>{result.passed ? 'Passed' : 'Not yet'}</strong>
          <p>{result.message}</p>
        </div>
      )}

      {!hasSupabase && (
        <p className="ex-note">
          Telemetry is off (no Supabase env). Exercises run and grade locally.
        </p>
      )}
    </div>
  );
}
