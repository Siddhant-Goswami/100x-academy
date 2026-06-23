# QA Report — 100x Interactive Platform

_Date: 2026-06-23 · Branch: `main` · Commit at test time: `1b82d80`_

End-to-end QA of the day-one vertical slice (Astro + Starlight + Supabase, browser-first
Pyodide execution). Because the app is a static site whose code execution and grading happen
in the browser, testing is split into four automated layers plus a manual browser checklist.

## Summary

| Layer | What | Result |
|-------|------|--------|
| 1 | Build + typecheck (`astro build`, `astro check`) | ✅ 6 pages, 29 files, **0 errors** |
| 2 | Dev-server route smoke test (all 6 routes) | ✅ all **200**, content renders, log clean |
| 3 | Verifier logic tests (all 6 verifiers, mocked run+ctx) | ✅ **21/21** |
| 4 | Python harness replica (real python3, lesson solutions) | ✅ **13/13** |
| 5 | Browser-only behaviours | ⬜ manual checklist below |

**Verdict: all automated layers green.** No regressions found. Grading logic and the
worker harness are correct against every shipped lesson's reference solution.

## Layer 1 — Build + typecheck

- `npm run build` → 6 pages built clean.
- `astro check` → 29 files, 0 errors / 0 warnings / 0 hints.
- Run with `export npm_config_cache=/tmp/npm-cache-100x` (npm cache has root-owned files).

## Layer 2 — Route smoke test

Dev server on `:4329`. All routes return 200 and render real content (titles, primitives,
dashboard shell); no errors/warnings in the dev log.

| Route | Status |
|-------|--------|
| `/` | 200 (`<title>100x Interactive`) |
| `/apis/01-why-http/` | 200 (title + primitive render) |
| `/apis/02-status-and-shape/` | 200 |
| `/apis/03-parse-and-transform/` | 200 |
| `/dashboard/` | 200 (Dashboard shell) |

## Layer 3 — Verifier logic (21 assertions)

Imports the real verifier implementations from `src/runtimes/verifiers/` and drives each with a
mocked `RunResult` and `evalInWorker`. Covers, per verifier: happy path, failure path, crash
path, and the security-sensitive behaviours.

- **stdout** — trims & matches; mismatch fails; crash surfaces stderr; empty → "(nothing printed)".
- **unit** — all-pass (incl. hidden) → score 1; visible fail reports call/got/want + partial score;
  **hidden fail does NOT leak the hidden input** (verified `details` is scrubbed); crash fails; deep-eq on objects.
- **ast** — all `must_use` present passes; missing constructs listed; crash fails.
- **api_contract** — status+body hold; wrong status noted; wrong body noted; crash fails.
- **agent_trace** — contract satisfied; missing required tool; forbidden tool used; final-answer missing text.
- **llm_rubric** — with no proxy/session configured, returns a safe non-pass **without hitting the
  network**. _Note:_ outside Vite, `import.meta.env` is undefined and the verifier throws on property
  access before any fetch; under Astro/Vite `import.meta.env` is always defined, so the real path returns
  the graceful "LLM proxy is not configured" message. Either way: no network, no pass. ✔

## Layer 4 — Python harness replica (13 assertions)

`_run` / `_eval` / `_collect_ast_names` copied verbatim from `src/runtimes/python.worker.ts` and run
against local **python3 3.12.10** (Pyodide ships CPython semantics, so this validates the harness logic).
Each lesson's setup + reference solution runs through the harness, then every visible **and hidden** case
is evaluated and compared.

- **L01 (stdout):** `print(get("/ping").status_code)` → stdout `"200"`. ✔
- **L02 (unit):** `exists()` → `/users/7`→true, `/missing`→false, hidden `/users/404`→false. ✔
- **L03 (unit):** `city_of()` → `/users/7`→"Bengaluru", hidden `/users/0`→null. ✔
- **Harness mechanics:** crash path sets `crashed=True` + captures `NameError` in stderr; `__ast_names__`
  collected from source (funcdef names + loop keywords); namespace drops callables/dunders but keeps `__ast_names__`.

## Layer 5 — Manual browser checklist (not automatable without Playwright)

Run `npm run dev`, open the routes, and confirm:

- [ ] **Pyodide boots** — first lesson load fetches `pyodide.mjs` from the jsDelivr CDN and the worker
      posts `ready` (watch the Network tab / "Run" button enabling). Requires network.
- [ ] **CodeMirror editor** mounts with the lesson's starter code and is editable.
- [ ] **Run → grade loop** — clicking Run executes in the worker and the verifier verdict renders
      (pass message / fail message). Try L01 correct (`print(response.status_code)`) → pass;
      a wrong answer → fail with hint.
- [ ] **Hints** progressively reveal.
- [ ] **Auth form** (AuthGate) — sign-in/sign-up via Supabase, session persists on reload.
- [ ] **Telemetry RPCs** — after sign-in, running an exercise writes `record_attempt` /
      `record_heartbeat` / `increment_hint` (check `attempts`/`heartbeats` tables in Supabase). RLS:
      a student sees only their own rows.
- [ ] **Dashboard** (`/dashboard/`) — as a TA, renders cohort submissions + student profiles;
      as a student, RLS blocks staff-only data. (DB-level RLS already verified server-side in a
      rolled-back tx — see project-state memory.)
- [ ] **LLM rubric** — only if `PUBLIC_LLM_PROXY_URL` is set and the Cloudflare proxy is deployed;
      otherwise the verifier shows "LLM proxy is not configured" (expected).

## How to re-run the automated layers

```bash
export npm_config_cache=/tmp/npm-cache-100x
npm run build && node_modules/.bin/astro check          # Layer 1
# Layer 2: astro dev --port 4329, then curl the 5 routes
node_modules/.bin/tsx  test/verifier.test.ts             # Layer 3
/Users/siddhant/miniconda3/bin/python3 test/harness.test.py   # Layer 4
```
