'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, label } from '@/components/ui';
import { useApi } from '@/lib/api-client';

/** Downloads rows as CSV (computed in the browser from the API response). */
function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name}.csv`;
  a.click();
}

function Report({ title, note, rows, columns, name }: {
  title: string; note: string; rows: any[]; name: string;
  columns: Array<[key: string, header: string, render?: (v: any, r: any) => React.ReactNode]>;
}) {
  return (
    <Card title={title} action={<Button variant="secondary" onClick={() => downloadCsv(name, rows)} disabled={!rows.length}>Download CSV</Button>}>
      <p className="-mt-2 mb-4 text-sm text-slate-600">{note}</p>
      {rows.length === 0 ? <Empty>No data yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr>{columns.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{columns.map(([k, , f]) => <td key={k} className="tabular">{f ? f(r[k], r) : r[k] ?? '—'}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const { data, error, loading } = useApi('/api/reports');
  const [student, setStudent] = useState('');
  const network = useApi(student ? `/api/reports/network?userId=${student}&depth=3` : null);

  if (loading) return <Loading rows={4} />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Live aggregates from PostgreSQL views (CTEs, window functions, correlated and recursive queries). Each table downloads as CSV." />

      <Report name="departments" title="Departments"
        note="Average skills and proficiency per student, and the share already in a team (CTE + correlated EXISTS, GROUP BY)."
        rows={data.departments}
        columns={[['department', 'Department'], ['students', 'Students'], ['avg_skills_per_student', 'Avg skills / student'],
          ['avg_proficiency', 'Avg proficiency (1–5)'], ['pct_in_team', 'In a team', (v) => `${v}%`]]} />

      <Report name="events" title="Events by participation"
        note="Average team size and fill per event, ranked with RANK() OVER (window function)."
        rows={data.events}
        columns={[['participation_rank', '#'], ['title', 'Event'], ['event_type', 'Type', (v) => label(v)], ['teams', 'Teams'],
          ['participants', 'People'], ['avg_team_size', 'Avg team size'], ['avg_fill_pct', 'Avg fill', (v) => (v == null ? '—' : `${v}%`)]]} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Report name="capstone-domains" title="Capstone domains"
          note="Approval rate and average review time per domain (FILTER aggregates, HAVING)."
          rows={data.capstoneDomains}
          columns={[['domain', 'Domain'], ['pitches', 'Pitches'], ['approved', 'Approved'],
            ['approval_rate_pct', 'Approval rate', (v) => (v == null ? '—' : `${v}%`)], ['avg_review_hours', 'Avg review (h)']]} />
        <Report name="match-quality" title="Does the match score predict decisions?"
          note="Average stored cosine score per request outcome, compared with the overall average (scalar subquery)."
          rows={data.matchQuality}
          columns={[['status', 'Outcome', (v) => <Badge>{v}</Badge>], ['requests', 'Requests'], ['avg_match_score', 'Avg score'],
            ['diff_from_overall', 'vs overall', (v) => (Number(v) > 0 ? `+${v}` : v)]]} />
      </div>

      <Report name="top-skills" title="Top 3 skills per category"
        note="Students holding each skill, ranked inside its category with ROW_NUMBER() OVER (PARTITION BY …)."
        rows={data.topSkills}
        columns={[['category', 'Category', (v) => label(v)], ['rank_in_category', 'Rank'], ['name', 'Skill'], ['students', 'Students'],
          ['avg_proficiency', 'Avg proficiency']]} />

      <Card title="Collaboration network (recursive query)">
        <p className="-mt-2 mb-4 text-sm text-slate-600">
          People connected to a student through shared teams: depth 1 are their teammates, depth 2 the teammates of
          those teammates, and so on (WITH RECURSIVE in fn_collaboration_network).
        </p>
        <select className="input w-auto min-w-72" aria-label="Student" value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">Choose a student…</option>
          {data.students.map((s: any) => <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.srn})</option>)}
        </select>
        {network.loading && <Loading rows={2} />}
        {network.data && (network.data.network.length === 0 ? <div className="mt-4"><Empty>Not in a team with anyone yet.</Empty></div> : (
          <table className="data mt-4">
            <thead><tr><th>Depth</th><th>Student</th><th>Reached through team</th></tr></thead>
            <tbody>
              {network.data.network.map((n: any) => (
                <tr key={n.user_id}><td className="tabular">{n.depth}</td><td>{n.full_name}</td><td>{n.via_team}</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </Card>
    </div>
  );
}
