-- 0003_views.sql
-- Dashboard views. security_invoker=on means a staff member querying a view sees
-- only their own cohorts through the underlying tables' RLS, with no extra policy
-- on the views themselves.

create view v_cohort_lesson_progress with (security_invoker=on) as
select p.cohort_id, l.module_slug, p.lesson_slug, l.title,
       count(*) filter (where p.status='passed')      as passed,
       count(*) filter (where p.status='in_progress') as in_progress,
       count(*)                                        as started,
       round(100.0 * count(*) filter (where p.status='passed') / nullif(count(*),0), 1) as pass_rate
from progress p
join lessons l on l.slug = p.lesson_slug
group by p.cohort_id, l.module_slug, p.lesson_slug, l.title;

create view v_hardest_lessons with (security_invoker=on) as
select cohort_id, lesson_slug,
       round(avg(attempts), 1) as avg_attempts,
       round(100.0 * count(*) filter (where status <> 'passed') / nullif(count(*),0), 1) as not_passed_rate
from progress
group by cohort_id, lesson_slug
order by not_passed_rate desc, avg_attempts desc;

create view v_stuck_students with (security_invoker=on) as
select cohort_id, user_id, lesson_slug, attempts, hints_used, last_activity_at
from progress
where status <> 'passed'
  and (attempts >= 4 or last_activity_at < now() - interval '3 days');
