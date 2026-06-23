# Lesson intake (the thirteen fields)

The intake is the contract for the authoring assistant. A missing field is exactly
where generation stops and flags a TODO instead of guessing.

1. **Module** — which module does this belong to (e.g. `apis`)?
2. **Order** — where in the module does it sit (integer)?
3. **Title** — the lesson title, learner-facing.
4. **Objective** — one verb-first outcome ("Student can ...").
5. **Runtime** — python | sql | fastapi | web | agent.
6. **The real problem** — the concrete situation that makes this concept
   necessary. What breaks or does not scale without it?
7. **The concept** — the minimum idea needed to act on that problem.
8. **The primitive** — the one-line mental model and its name (optional).
9. **Starter shape** — what the student starts from: a function signature, a
   stub, comment steps.
10. **Grading method** — how do we know they got it: exact output (stdout),
    function return values (unit), structure used (ast), request/response
    (api_contract), tool trace (agent_trace), or open-ended (llm_rubric)?
11. **Worked cases** — 2 to 3 visible input/output examples.
12. **Common mistakes** — the edge or failure path students actually miss. This
    becomes the hidden case and the targeted fail hint.
13. **Difficulty and time** — difficulty 1 to 5 and estimated minutes.

Optional: `needs_llm` (default false) and `packages` (extra Python packages the
runtime must load, e.g. `[fastapi, pydantic]`).
