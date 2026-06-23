-- 0004_tighten_function_grants.sql
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so anon and
-- authenticated can reach every SECURITY DEFINER function via /rest/v1/rpc.
-- Lock the API surface to exactly what the client is meant to call.

-- Trigger-only and RLS-internal helpers: reachable by no API role.
-- (staff_cohort_ids EXECUTE for authenticated is restored in 0005 — RLS needs it.)
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.staff_cohort_ids()  from public, anon, authenticated;

-- Client RPCs: only signed-in users. They already guard on auth.uid() internally,
-- but there is no reason for anon to call them at all.
revoke execute on function public.record_attempt(text, uuid, text, text, boolean, numeric, int, text) from public, anon;
revoke execute on function public.record_heartbeat(text, uuid, int)                                   from public, anon;
revoke execute on function public.increment_hint(text)                                                from public, anon;

grant execute on function public.record_attempt(text, uuid, text, text, boolean, numeric, int, text) to authenticated;
grant execute on function public.record_heartbeat(text, uuid, int)                                   to authenticated;
grant execute on function public.increment_hint(text)                                                to authenticated;
