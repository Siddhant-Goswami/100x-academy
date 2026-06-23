-- 0005_fix_staff_cohort_ids_grant.sql
-- 0004 over-tightened: the staff-read RLS policies call staff_cohort_ids() in
-- their USING clause, and RLS expressions run with the *caller's* privileges.
-- SECURITY DEFINER governs what runs INSIDE the function, not who may invoke it,
-- so authenticated must keep EXECUTE or every staff policy errors out
-- ("permission denied for function staff_cohort_ids").
-- Exposing it via RPC is harmless: it filters on auth.uid() and only ever returns
-- the caller's own staff cohort ids.
grant execute on function public.staff_cohort_ids() to authenticated;
