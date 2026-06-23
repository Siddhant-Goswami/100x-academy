-- 0001_init.sql
-- Core schema: identity, cohorts, the lesson registry (mirrored from Git content),
-- and all student-data tables. Plus the atomic-write RPCs.

create type user_role as enum ('student','ta','instructor','admin');
create type cohort_role as enum ('student','ta','instructor');
create type progress_status as enum ('not_started','in_progress','passed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- auto-create a profile row on signup
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create table cohorts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cohort_id uuid not null references cohorts(id) on delete cascade,
  role_in_cohort cohort_role not null default 'student',
  enrolled_at timestamptz not null default now(),
  unique (user_id, cohort_id)
);

create table modules (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  order_index int not null default 0
);

-- mirror of lesson frontmatter, upserted from content at deploy time
create table lessons (
  slug text primary key,
  module_slug text not null references modules(slug) on delete cascade,
  title text not null,
  runtime text not null,
  difficulty int,
  est_minutes int,
  needs_llm boolean not null default false,
  order_index int not null default 0
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_slug text not null references lessons(slug) on delete cascade,
  cohort_id uuid references cohorts(id) on delete set null,
  code text,
  verifier_type text not null,
  passed boolean not null default false,
  score numeric,
  runtime_ms int,
  error text,
  created_at timestamptz not null default now()
);

create table progress (
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_slug text not null references lessons(slug) on delete cascade,
  cohort_id uuid references cohorts(id) on delete set null,
  status progress_status not null default 'in_progress',
  attempts int not null default 0,
  hints_used int not null default 0,
  time_spent_seconds int not null default 0,
  first_started_at timestamptz not null default now(),
  passed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  primary key (user_id, lesson_slug)
);

create table events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_slug text references lessons(slug) on delete set null,
  cohort_id uuid references cohorts(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table llm_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_slug text references lessons(slug) on delete set null,
  cohort_id uuid references cohorts(id) on delete set null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_estimate numeric,
  created_at timestamptz not null default now()
);

create index on submissions (user_id, lesson_slug);
create index on submissions (cohort_id, lesson_slug);
create index on progress (cohort_id, status);
create index on events (cohort_id, type, created_at);
create index on llm_usage (user_id, created_at);

-- 2.1 Atomic writes via RPC ---------------------------------------------------
-- One SECURITY DEFINER function records a submission and advances progress in a
-- single transaction, with the auth check server-side.

create function record_attempt(
  p_lesson_slug text, p_cohort_id uuid, p_code text,
  p_verifier_type text, p_passed boolean, p_score numeric,
  p_runtime_ms int, p_error text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  insert into submissions(user_id, lesson_slug, cohort_id, code, verifier_type, passed, score, runtime_ms, error)
  values (v_user, p_lesson_slug, p_cohort_id, p_code, p_verifier_type, p_passed, p_score, p_runtime_ms, p_error);

  insert into progress(user_id, lesson_slug, cohort_id, status, attempts, last_activity_at, passed_at)
  values (v_user, p_lesson_slug, p_cohort_id,
          case when p_passed then 'passed' else 'in_progress' end,
          1, now(), case when p_passed then now() end)
  on conflict (user_id, lesson_slug) do update
    set attempts = progress.attempts + 1,
        last_activity_at = now(),
        status = case when progress.status = 'passed' or p_passed then 'passed' else 'in_progress' end,
        passed_at = coalesce(progress.passed_at, case when p_passed then now() end);
end; $$;

create function record_heartbeat(p_lesson_slug text, p_cohort_id uuid, p_seconds int) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  insert into progress(user_id, lesson_slug, cohort_id, status, time_spent_seconds)
  values (v_user, p_lesson_slug, p_cohort_id, 'in_progress', greatest(p_seconds,0))
  on conflict (user_id, lesson_slug) do update
    set time_spent_seconds = progress.time_spent_seconds + greatest(p_seconds,0),
        last_activity_at = now();
end; $$;

-- Increment hints_used atomically when a hint is revealed. Upserts a progress row
-- so a hint opened before the first run still counts.
create function increment_hint(p_lesson_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  insert into progress(user_id, lesson_slug, status, hints_used)
  values (v_user, p_lesson_slug, 'in_progress', 1)
  on conflict (user_id, lesson_slug) do update
    set hints_used = progress.hints_used + 1,
        last_activity_at = now();
end; $$;
