# 100x Interactive Platform

Browser-first interactive exercises for the 100x curriculum. Astro + Starlight for
delivery, Pyodide in a Web Worker for execution, Supabase for identity, data, and
Row Level Security, and instructor/TA dashboards from day one. The only server
component is a Cloudflare Worker LLM proxy, needed later by the agent and MCP
modules.

Worked example: the **APIs** module (consuming and parsing HTTP). Everything except
the worked example and its verifier is module-agnostic.

## Why it is shaped this way

- **Content lives in Git and is the source of truth for lessons.** Supabase holds a
  lightweight lesson registry (synced at deploy by `scripts/sync-lessons.ts`) plus
  all student data. This avoids drift while letting dashboards join on
  human-readable titles.
- **Execution is browser-first.** Python runs in a Pyodide Web Worker. No execution
  backend, so hosting is free and a student's code can never touch your servers.
- **Deterministic verifiers are the default.** Four of the six verifier types
  (`stdout`, `unit`, `ast`, `api_contract`) run fully client-side. Only `llm_rubric`
  calls the proxy. The check is cheaper and more reliable than the thing it checks.

## Layout

```
src/
  content/config.ts          Zod schema; validates every lesson at build time
  content/docs/apis/*.mdx     the three worked-example lessons
  components/                 Problem, Concept, Exercise, Hints, Primitive, Dashboard
  runtimes/python.worker.ts   Pyodide worker (init / run / eval protocol)
  runtimes/verifiers/         stdout, unit, ast, apiContract, agentTrace, llmRubric
  lib/                        supabase client, auth, telemetry
proxy/                        Cloudflare Worker: LLM proxy + per-student budget caps
supabase/migrations/          0001 schema + RPCs, 0002 RLS, 0003 dashboard views
scripts/sync-lessons.ts       deploy step: upsert the lesson registry into Supabase
.claude/skills/author-lesson/ the authoring assistant (intake -> one MDX lesson)
```

## Local setup

```bash
npm install
cp .env.example .env        # fill in PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Without Supabase env vars the site still builds and exercises still run and grade
locally; only telemetry and the dashboard need a project.

## Supabase

1. Create a project. Run the three migrations in order (SQL editor or CLI):
   `supabase/migrations/0001_init.sql`, `0002_rls.sql`, `0003_views.sql`.
2. Seed one cohort: `supabase/seed.sql`.
3. After a user signs up, enroll them (see the commented examples in `seed.sql`).
   A TA or instructor needs `role_in_cohort` of `ta`/`instructor` to see the
   dashboard for that cohort.
4. Sync the lesson registry from content:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync-lessons
   ```
   Wire this into your deploy so the registry tracks content on every ship.

Writes go through two `SECURITY DEFINER` RPCs (`record_attempt`,
`record_heartbeat`) so an attempt is recorded atomically and the auth check is
server-side. Reads are constrained by RLS: a student sees only their own rows; a
TA or instructor sees every row for the cohorts they staff.

## Deploy

- **Site:** static output, Cloudflare Pages free tier. Build command `npm run build`,
  output `dist/`. Add the deploy hook to run `npm run sync-lessons` with the service
  role key.
- **Proxy (later):** `cd proxy && npm install && wrangler deploy`. Set secrets
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the
  `DAILY_TOKEN_CAP` var. Your bill ceiling is `DAILY_TOKEN_CAP x active students`.

## Authoring a lesson

A lesson is one MDX file under `src/content/docs/<module>/`. Frontmatter is
validated against the Zod schema at build time, so a malformed lesson fails CI
before it can ship. The MDX body uses the five pedagogy components in fixed order:
`Problem`, `Concept`, `Exercise`, `Hints`, `Primitive`. The order is the curriculum
stance made structural: problem before solution, derive before name.

Two authoring paths, both proven by the three APIs lessons:

1. **By hand:** copy an existing lesson and edit.
2. **Assistant:** fill the intake (`.claude/skills/author-lesson/intake-template.md`)
   and run the `author-lesson` skill, which emits one schema-valid MDX file. A
   senior reviews the PR; the build is the quality gate.

Step 7 of the build plan opens this to TAs through a Git-backed CMS (Keystatic or
TinaCMS) with PR review. The content schema and the build-time validation are what
make that safe: the CMS writes MDX, the schema rejects anything malformed.

## Status

Day-one vertical slice is complete: Starlight scaffold, the five pedagogy
components, CodeMirror + Pyodide worker, the four client-side verifiers, the three
migrations with atomic RPCs and RLS, telemetry, the staff dashboard over the three
views, the three APIs lessons, the LLM proxy, and the authoring skill.

Phase 1 (FastAPI) is the next drop: the ASGI bridge in `src/runtimes/asgi/` and the
real-network `api_contract` path. Nothing in the data model, RLS, dashboard, lesson
schema, or authoring loop changes when it lands. See `src/runtimes/asgi/README.md`.
```
