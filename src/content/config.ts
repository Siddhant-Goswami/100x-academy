import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

// A verifier case: a Python expression to evaluate and the value to expect back.
const verifierCase = z.object({
  call: z.string(),
  expect: z.any(),
});

// Lesson fields are optional at the type level so non-lesson docs (the splash
// index, future guides) still validate. A superRefine then enforces that any doc
// declaring `module` is a COMPLETE lesson. A malformed lesson breaks the build,
// which is the safety rail for TA-authored content.
const lesson = z
  .object({
    module: z.string().optional(),
    order: z.number().optional(),
    objective: z.string().optional(),
    runtime: z.enum(['python', 'sql', 'fastapi', 'web', 'agent']).optional(),
    difficulty: z.number().min(1).max(5).optional(),
    est_minutes: z.number().optional(),
    primitive: z.string().optional(),
    needs_llm: z.boolean().default(false),
    packages: z.array(z.string()).default([]),
    verifier: z
      .object({
        type: z.enum(['stdout', 'unit', 'ast', 'api_contract', 'agent_trace', 'llm_rubric']),
        setup: z.string().optional(),
        cases: z.array(verifierCase).optional(),
        hidden_cases: z.array(verifierCase).optional(),
        on_fail_hint: z.string().optional(),
        expected_stdout: z.string().optional(),
        must_use: z.array(z.string()).optional(),
        rubric: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.module === undefined) return; // not a lesson; nothing more to require
    const required: Array<keyof typeof data> = [
      'order',
      'objective',
      'runtime',
      'difficulty',
      'est_minutes',
      'verifier',
    ];
    for (const key of required) {
      if (data[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lesson is missing required field: ${String(key)}`,
          path: [key],
        });
      }
    }
  });

export const collections = {
  docs: defineCollection({ schema: docsSchema({ extend: lesson }) }),
};
