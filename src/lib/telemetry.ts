import { supabase } from './supabase';
import { getActiveCohortId } from './auth';

// Thin wrappers over the atomic RPCs and the events table. Time on task comes from
// a focus-gated heartbeat so an idle open tab does not inflate it. Heartbeat
// seconds are batched client-side and flushed on a timer or on blur.

let cohortId: string | null = null;
async function cohort(): Promise<string | null> {
  if (cohortId === null) cohortId = await getActiveCohortId();
  return cohortId;
}

export interface AttemptInput {
  lessonSlug: string;
  code: string;
  verifierType: string;
  passed: boolean;
  score?: number;
  runtimeMs?: number;
  error?: string;
}

// One atomic call records the submission AND advances progress server-side.
export async function recordAttempt(a: AttemptInput) {
  const { error } = await supabase.rpc('record_attempt', {
    p_lesson_slug: a.lessonSlug,
    p_cohort_id: await cohort(),
    p_code: a.code,
    p_verifier_type: a.verifierType,
    p_passed: a.passed,
    p_score: a.score ?? null,
    p_runtime_ms: a.runtimeMs ?? null,
    p_error: a.error ?? null,
  });
  if (error) console.error('record_attempt failed', error.message);
}

export async function recordHeartbeat(lessonSlug: string, seconds: number) {
  if (seconds <= 0) return;
  const { error } = await supabase.rpc('record_heartbeat', {
    p_lesson_slug: lessonSlug,
    p_cohort_id: await cohort(),
    p_seconds: seconds,
  });
  if (error) console.error('record_heartbeat failed', error.message);
}

export async function logEvent(
  lessonSlug: string | null,
  type: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await supabase.from('events').insert({
    lesson_slug: lessonSlug,
    cohort_id: await cohort(),
    type,
    payload,
  });
  if (error) console.error('logEvent failed', error.message);
}

// A focus-gated, batched heartbeat. Accumulates wall-clock seconds only while the
// tab is focused, and flushes them to record_heartbeat every `flushEverySec` and
// on blur / pagehide. Returns a stop() to detach listeners on unmount.
export function startHeartbeat(lessonSlug: string, flushEverySec = 30) {
  let accrued = 0;
  let lastTick = Date.now();
  let focused = typeof document !== 'undefined' ? document.hasFocus() : true;

  const accrue = () => {
    if (focused) {
      accrued += Math.round((Date.now() - lastTick) / 1000);
    }
    lastTick = Date.now();
  };

  const flush = async () => {
    accrue();
    if (accrued > 0) {
      const toSend = accrued;
      accrued = 0;
      await recordHeartbeat(lessonSlug, toSend);
    }
  };

  const onFocus = () => {
    focused = true;
    lastTick = Date.now();
  };
  const onBlur = () => {
    accrue();
    focused = false;
    void flush();
  };

  const interval = setInterval(flush, flushEverySec * 1000);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', () => void flush());

  return function stop() {
    clearInterval(interval);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    void flush();
  };
}

// lesson_started: fired once per lesson per browser session. Ensures a progress
// row exists (the RPC upserts) and writes an analytics event.
const startedThisSession = new Set<string>();
export async function markLessonStarted(lessonSlug: string) {
  if (startedThisSession.has(lessonSlug)) return;
  startedThisSession.add(lessonSlug);
  await recordHeartbeat(lessonSlug, 0); // upserts an in_progress row without adding time
  await logEvent(lessonSlug, 'lesson_started');
}

export async function markHintRevealed(lessonSlug: string, index: number) {
  await logEvent(lessonSlug, 'hint_revealed', { index });
  // hints_used is incremented atomically server-side.
  const { error } = await supabase.rpc('increment_hint', { p_lesson_slug: lessonSlug });
  if (error) console.error('increment_hint failed', error.message);
}
