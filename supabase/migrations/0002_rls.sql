-- 0002_rls.sql
-- Row Level Security. Two access shapes: a student sees only their own rows; a TA
-- or instructor sees every row for the cohorts they staff. The recursion trap (a
-- policy on enrollments that reads enrollments) is avoided with one SECURITY
-- DEFINER helper that returns the caller's staff cohort ids.

create function staff_cohort_ids() returns setof uuid
language sql security definer stable set search_path = public as $$
  select cohort_id from enrollments
  where user_id = auth.uid() and role_in_cohort in ('ta','instructor');
$$;

alter table profiles    enable row level security;
alter table submissions enable row level security;
alter table progress    enable row level security;
alter table events       enable row level security;
alter table llm_usage    enable row level security;
alter table enrollments  enable row level security;

-- profiles
create policy profiles_self        on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_staff_read  on profiles for select using (
  exists (select 1 from enrollments e
          where e.user_id = profiles.id
            and e.cohort_id in (select staff_cohort_ids()))
);

-- enrollments: self read, staff read own cohorts
create policy enr_self        on enrollments for select using (user_id = auth.uid());
create policy enr_staff_read  on enrollments for select using (cohort_id in (select staff_cohort_ids()));

-- student data tables: self read and write, staff read by cohort
create policy subs_self_rw    on submissions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subs_staff_read on submissions for select using (cohort_id in (select staff_cohort_ids()));

create policy prog_self_rw    on progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prog_staff_read on progress for select using (cohort_id in (select staff_cohort_ids()));

create policy evt_self_rw     on events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy evt_staff_read  on events for select using (cohort_id in (select staff_cohort_ids()));

create policy llm_self_read   on llm_usage for select using (user_id = auth.uid());
create policy llm_staff_read  on llm_usage for select using (cohort_id in (select staff_cohort_ids()));

-- The lesson registry is public read (it mirrors Git content). Writes happen only
-- via the service role at deploy time.
alter table lessons enable row level security;
alter table modules enable row level security;
alter table cohorts enable row level security;
create policy lessons_read on lessons for select using (true);
create policy modules_read on modules for select using (true);
create policy cohorts_read on cohorts for select using (
  id in (select cohort_id from enrollments where user_id = auth.uid())
);
