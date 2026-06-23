-- seed.sql
-- One cohort (C8) and the APIs module. Lessons are upserted by sync-lessons.ts from
-- Git content, so they are intentionally not seeded here. Enrollments are added by
-- hand per real user id after signup (auth.users rows are created by Supabase Auth).

insert into modules (slug, title, order_index) values
  ('apis', 'APIs: consuming and parsing HTTP', 1)
on conflict (slug) do nothing;

insert into cohorts (slug, name, starts_on) values
  ('c8', 'Cohort 8', '2026-07-01')
on conflict (slug) do nothing;

-- Example enrollment wiring (fill in real auth.users ids after signup):
--   insert into enrollments (user_id, cohort_id, role_in_cohort)
--   select '<student-uuid>', id, 'student' from cohorts where slug = 'c8';
--   insert into enrollments (user_id, cohort_id, role_in_cohort)
--   select '<ta-uuid>', id, 'ta' from cohorts where slug = 'c8';
