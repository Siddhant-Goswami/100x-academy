# ASGI bridge (Phase 1)

The riskiest piece in the platform, which is the argument for porting one FastAPI
lesson early in Phase 1 so the harness is proven before the curriculum leans on it.

This directory will hold:

- **`service-worker.ts`** — a service worker that intercepts requests under a path
  prefix (e.g. `/__student_app/*`) and routes them, over the ASGI protocol, to the
  student's FastAPI app running in a Pyodide Web Worker.
- **`bridge.py`** — the Pyodide-side shim that receives an ASGI `scope` + `receive`
  + `send` and drives the student's `app` object, returning status, headers, and
  body back across the worker boundary.

The `api_contract` verifier (already present in `../verifiers/apiContract.ts`) is
the consumer: in Phase 1 it boots the student's app through this bridge, sends the
requests named in `verifier.cases`, and asserts on status, body, and headers. The
verifier's contract shape does not change between the mocked Phase 0 path and the
real ASGI Phase 1 path.

Budget a one-time hardening of this bridge, then reuse it across every
API-building lesson. Nothing in the data model, RLS, dashboard, lesson schema, or
authoring loop changes when it lands.
