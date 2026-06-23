import type { Verifier } from './types';

// The ONLY verifier that leaves the browser. Sends the student's output and a
// strict rubric to the LLM proxy, which enforces per-student budget caps and logs
// usage. Used only when output is open-ended. This is the exception to the
// Verifier's Rule: a deterministic check is always preferred when one exists.
export const llmRubricVerifier: Verifier = async (run, spec, _ctx) => {
  const proxyUrl = import.meta.env.PUBLIC_LLM_PROXY_URL;
  if (!proxyUrl) {
    return { passed: false, message: 'LLM proxy is not configured for this deployment.' };
  }

  // The browser Supabase client holds the session; the proxy verifies the JWT.
  const { supabase } = await import('../../lib/supabase');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { passed: false, message: 'Sign in to use a model-judged exercise.' };
  }

  const res = await fetch(`${proxyUrl}/rubric`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      rubric: spec.rubric ?? '',
      output: run.stdout,
      lesson_slug: spec.__lesson_slug,
    }),
  });

  if (res.status === 429) {
    return { passed: false, message: 'You have hit your daily AI budget. Try again tomorrow.' };
  }
  if (!res.ok) {
    return { passed: false, message: `Grader unavailable (${res.status}). Try again shortly.` };
  }

  const judged = (await res.json()) as { passed: boolean; score?: number; feedback?: string };
  return {
    passed: judged.passed,
    score: judged.score,
    message: judged.feedback ?? (judged.passed ? 'Meets the rubric.' : 'Does not meet the rubric yet.'),
  };
};
