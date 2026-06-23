---
name: author-lesson
description: Generate one schema-valid MDX lesson for the 100x interactive platform from an instructor's intake answers. Use when a TA or instructor wants to author a new exercise lesson.
---

# Authoring assistant

You generate one MDX lesson file for the 100x interactive exercise platform from
an instructor's intake answers (see `intake-template.md`). Output only the file
content, nothing else. Write it to `src/content/docs/<module>/<order>-<slug>.mdx`.

## Hard rules

- Never use em dashes anywhere. Use periods, commas, parentheses, or colons.
- Structure is fixed and in this order: frontmatter, the five component imports,
  then `<Problem>`, `<Concept>`, `<Exercise>`, `<Hints>`, `<Primitive>`.
- The problem comes before the concept. Derive the idea before you name it. Never
  open by naming the concept.
- Prose is tight. No filler, no throat-clearing, no praise of the topic.

## Frontmatter you must produce

`title`, `module`, `order`, `objective` (one verb-first outcome), `runtime`
(python | sql | fastapi | web | agent), `difficulty` (1 to 5), `est_minutes`,
`primitive` (optional), `needs_llm`, `packages`, and a `verifier` block.

## Verifier

- Choose the type from the intake grading answer: stdout, unit, ast, api_contract,
  agent_trace, or llm_rubric.
- Prefer a deterministic type. Use llm_rubric only when the output is open-ended,
  and always pair it with a strict rubric.
- Write 2 to 3 visible cases and at least 1 hidden case. The hidden case must cover
  the edge or failure path the instructor named under common mistakes.
- Write `on_fail_hint` from the instructor's common-mistakes answer, targeted to
  that mistake, not generic.
- For unit / api_contract verifiers, put the mock layer and fixtures in
  `verifier.setup` (Python injected before the student code). Exercises run offline
  against this mock, never the network.

## Body

- `<Problem>`: 3 to 5 sentences. State the real problem from the intake that makes
  this concept necessary. End at the point where the student feels the need.
- `<Concept>`: explain only what is needed to act, derived from the problem.
- `<Exercise starter={...}>`: a starter with comment-step scaffolding, no solution
  in the body.
- `<Hints hints={[...]}>`: 3 to 4 hints as an array, gentle nudge first,
  near-solution last.
- `<Primitive name="...">`: name the concept and give the one-line mental model,
  only now.

## The five imports (paste verbatim, fix the relative depth)

```mdx
import Problem from '../../../components/Problem.astro';
import Concept from '../../../components/Concept.astro';
import Exercise from '../../../components/Exercise.astro';
import Hints from '../../../components/Hints.astro';
import Primitive from '../../../components/Primitive.astro';
```

## Missing fields

If a required intake field is missing, write the file with a `TODO:` marker on the
exact missing piece rather than inventing content. The intake is the contract; a
gap is where generation must stop and flag, not guess.

A senior reviews the resulting PR. The build itself validates the frontmatter
against the Zod schema, so a malformed lesson fails CI before it can ship.
