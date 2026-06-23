import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getStaffEnrollments, type StaffEnrollment } from '../lib/auth';
import AuthGate from './AuthGate';

interface LessonProgressRow {
  cohort_id: string;
  module_slug: string;
  lesson_slug: string;
  title: string;
  passed: number;
  in_progress: number;
  started: number;
  pass_rate: number | null;
}
interface HardestRow {
  cohort_id: string;
  lesson_slug: string;
  avg_attempts: number | null;
  not_passed_rate: number | null;
}
interface StuckRow {
  cohort_id: string;
  user_id: string;
  lesson_slug: string;
  attempts: number;
  hints_used: number;
  last_activity_at: string;
}
interface MatrixRow {
  user_id: string;
  lesson_slug: string;
  status: 'not_started' | 'in_progress' | 'passed';
}

// Instructor and TA dashboard. Reads the three security_invoker views plus raw
// progress for the matrix; RLS scopes every read to the cohorts the viewer staffs.
function Panels({ cohortId }: { cohortId: string }) {
  const [lessons, setLessons] = useState<LessonProgressRow[]>([]);
  const [hardest, setHardest] = useState<HardestRow[]>([]);
  const [stuck, setStuck] = useState<StuckRow[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [lp, hl, ss, pr] = await Promise.all([
        supabase.from('v_cohort_lesson_progress').select('*').eq('cohort_id', cohortId),
        supabase.from('v_hardest_lessons').select('*').eq('cohort_id', cohortId).limit(10),
        supabase.from('v_stuck_students').select('*').eq('cohort_id', cohortId),
        supabase.from('progress').select('user_id, lesson_slug, status').eq('cohort_id', cohortId),
      ]);
      if (!alive) return;
      setLessons((lp.data as LessonProgressRow[]) ?? []);
      setHardest((hl.data as HardestRow[]) ?? []);
      setStuck((ss.data as StuckRow[]) ?? []);
      setMatrix((pr.data as MatrixRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [cohortId]);

  if (loading) return <p>Loading cohort data...</p>;

  // Build the completion matrix: students down, lessons across.
  const students = [...new Set(matrix.map((m) => m.user_id))];
  const lessonSlugs = [...new Set(matrix.map((m) => m.lesson_slug))].sort();
  const cell = (u: string, l: string) =>
    matrix.find((m) => m.user_id === u && m.lesson_slug === l)?.status ?? 'not_started';

  return (
    <div className="dash">
      <h2>Cohort completion matrix</h2>
      {students.length === 0 ? (
        <p>No student activity yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                {lessonSlugs.map((l) => (
                  <th key={l} title={l}>
                    {l.split('/').pop()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((u) => (
                <tr key={u}>
                  <td title={u}>{u.slice(0, 8)}</td>
                  {lessonSlugs.map((l) => (
                    <td key={l}>
                      <span className={`cell cell-${cell(u, l)}`} title={cell(u, l)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: '2rem' }}>Per-lesson pass rate</h2>
      <table>
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Started</th>
            <th>Passed</th>
            <th>Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((r) => (
            <tr key={r.lesson_slug}>
              <td>{r.title}</td>
              <td>{r.started}</td>
              <td>{r.passed}</td>
              <td>{r.pass_rate ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: '2rem' }}>Hardest lessons</h2>
      <table>
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Avg attempts</th>
            <th>Not-passed rate</th>
          </tr>
        </thead>
        <tbody>
          {hardest.map((r) => (
            <tr key={r.lesson_slug}>
              <td>{r.lesson_slug}</td>
              <td>{r.avg_attempts ?? 0}</td>
              <td>{r.not_passed_rate ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: '2rem' }}>Stuck students</h2>
      <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
        Thrashed past 4 attempts, or quiet for 3+ days. Act before the drift compounds.
      </p>
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Lesson</th>
            <th>Attempts</th>
            <th>Hints</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {stuck.map((r) => (
            <tr key={`${r.user_id}-${r.lesson_slug}`}>
              <td className="dash-bad" title={r.user_id}>
                {r.user_id.slice(0, 8)}
              </td>
              <td>{r.lesson_slug}</td>
              <td>{r.attempts}</td>
              <td>{r.hints_used}</td>
              <td>{new Date(r.last_activity_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {stuck.length === 0 && (
            <tr>
              <td colSpan={5}>Nobody is stuck right now.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AuthGate>
      {() => <StaffShell />}
    </AuthGate>
  );
}

function StaffShell() {
  const [staff, setStaff] = useState<StaffEnrollment[] | null>(null);
  const [cohortId, setCohortId] = useState<string>('');

  useEffect(() => {
    getStaffEnrollments().then((s) => {
      setStaff(s);
      if (s.length) setCohortId(s[0].cohort_id);
    });
  }, []);

  if (staff === null) return <p>Loading...</p>;
  if (staff.length === 0)
    return <p>You do not staff any cohort. This dashboard is for TAs and instructors.</p>;

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Cohort:{' '}
        <select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.cohort_id} value={s.cohort_id}>
              {s.cohort_name} ({s.role_in_cohort})
            </option>
          ))}
        </select>
      </label>
      {cohortId && <Panels cohortId={cohortId} />}
    </div>
  );
}
