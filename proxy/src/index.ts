/**
 * The one server component: an LLM proxy on Cloudflare Workers.
 *
 * Not needed for the APIs pilot. Specified so the agent and MCP modules drop in
 * without rework. It does four things:
 *   1. Verify the student's Supabase JWT.
 *   2. Sum today's llm_usage tokens for that user; reject if over the daily cap.
 *   3. Forward to the model with the server-held key and stream the reply back.
 *   4. Log input/output tokens and a cost estimate to llm_usage (service role).
 *
 * A runaway agent loop cannot exceed a student's daily cap, so the cap is the
 * bill ceiling: cap x active students, computable in advance.
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DAILY_TOKEN_CAP: string;
}

const MODEL = 'claude-opus-4-8';
// Opus 4.8 list price, USD per token. Adjust if the model changes.
const PRICE_IN = 5 / 1_000_000;
const PRICE_OUT = 25 / 1_000_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

// Verify the Supabase access token by asking Supabase Auth who it belongs to.
async function getUserId(env: Env, jwt: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${jwt}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
}

// Sum today's tokens for the user via PostgREST, using the service role key.
async function tokensUsedToday(env: Env, userId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const url =
    `${env.SUPABASE_URL}/rest/v1/llm_usage` +
    `?select=input_tokens,output_tokens&user_id=eq.${userId}` +
    `&created_at=gte.${since.toISOString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return 0;
  const rows = (await res.json()) as Array<{ input_tokens: number; output_tokens: number }>;
  return rows.reduce((sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
}

async function logUsage(
  env: Env,
  userId: string,
  lessonSlug: string | null,
  inTok: number,
  outTok: number,
) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/llm_usage`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      lesson_slug: lessonSlug,
      model: MODEL,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_estimate: inTok * PRICE_IN + outTok * PRICE_OUT,
    }),
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    const auth = req.headers.get('authorization') ?? '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing token' }, 401);

    const userId = await getUserId(env, jwt);
    if (!userId) return json({ error: 'invalid token' }, 401);

    const cap = Number(env.DAILY_TOKEN_CAP || '100000');
    const used = await tokensUsedToday(env, userId);
    if (used >= cap) {
      return json({ error: 'daily token cap reached', used, cap }, 429);
    }

    const url = new URL(req.url);
    const body = (await req.json()) as {
      rubric?: string;
      output?: string;
      messages?: unknown[];
      lesson_slug?: string | null;
    };

    // The /rubric path turns a deterministic-ish grading request into a strict,
    // low-token model judgement returning JSON.
    const isRubric = url.pathname.endsWith('/rubric');
    const messages = isRubric
      ? [
          {
            role: 'user',
            content:
              `Grade this student output against the rubric. Reply with ONLY JSON: ` +
              `{"passed": boolean, "score": number 0-1, "feedback": string}.\n\n` +
              `RUBRIC:\n${body.rubric}\n\nOUTPUT:\n${body.output}`,
          },
        ]
      : body.messages ?? [];

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages }),
    });

    if (!upstream.ok) {
      return json({ error: 'upstream error', status: upstream.status }, 502);
    }

    const data = (await upstream.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const inTok = data.usage?.input_tokens ?? 0;
    const outTok = data.usage?.output_tokens ?? 0;
    await logUsage(env, userId, body.lesson_slug ?? null, inTok, outTok);

    const text = data.content?.map((c) => c.text ?? '').join('') ?? '';

    if (isRubric) {
      // Parse the model's JSON judgement; fall back to a soft fail on bad JSON.
      try {
        const parsed = JSON.parse(text.trim().replace(/^```json\n?|```$/g, ''));
        return json(parsed);
      } catch {
        return json({ passed: false, score: 0, feedback: 'Grader returned unparseable output.' });
      }
    }

    return json({ text, usage: { input_tokens: inTok, output_tokens: outTok } });
  },
};
