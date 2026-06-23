import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export type CohortRole = 'student' | 'ta' | 'instructor';

export interface StaffEnrollment {
  cohort_id: string;
  cohort_slug: string;
  cohort_name: string;
  role_in_cohort: CohortRole;
}

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// The cohort a student is currently enrolled in as a learner. Submissions and
// progress are stamped with this cohort_id so dashboards can scope by cohort.
export async function getActiveCohortId(): Promise<string | null> {
  const { data } = await supabase
    .from('enrollments')
    .select('cohort_id')
    .eq('role_in_cohort', 'student')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.cohort_id ?? null;
}

// Cohorts this user staffs. Drives whether the dashboard route is shown and which
// cohorts its filters offer.
export async function getStaffEnrollments(): Promise<StaffEnrollment[]> {
  const { data } = await supabase
    .from('enrollments')
    .select('cohort_id, role_in_cohort, cohorts(slug, name)')
    .in('role_in_cohort', ['ta', 'instructor']);
  return (data ?? []).map((row: any) => ({
    cohort_id: row.cohort_id,
    role_in_cohort: row.role_in_cohort,
    cohort_slug: row.cohorts?.slug,
    cohort_name: row.cohorts?.name,
  }));
}
