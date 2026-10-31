'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { Alert, Badge, Card, Chips, Empty, LinkButton, Loading, Meta, PageHeader, ScoreBar, Slots, Stat, formatDate, label } from '@/components/ui';
import { useApi } from '@/lib/api-client';

export default function DashboardPage() {
  const { data, error, loading } = useApi('/api/dashboard');
  const denied = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('denied');

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${data.user.name}`} subtitle={`${label(data.role)} dashboard`} />
      {denied && <Alert kind="info">That page is not available for your role.</Alert>}
      {data.role === 'STUDENT' && <StudentView d={data} />}
      {data.role === 'FACULTY' && <FacultyView d={data} />}
      {data.role === 'ADMIN' && <AdminView d={data} />}
    </div>
  );
}

function StudentView({ d }: { d: any }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="My teams" value={d.stats.my_teams} />
        <Stat label="My pending requests" value={d.stats.my_pending} />
        <Stat label="Requests to review" value={d.stats.to_review} hint="as team leader" />
        <Stat label="My capstone pitches" value={d.stats.my_capstones} />
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/matches">See my match suggestions</LinkButton>
        <LinkButton href="/teams/new" variant="secondary">Create a team</LinkButton>
        <LinkButton href="/capstones/new" variant="secondary">Pitch a capstone</LinkButton>
      </div>

      {d.incoming.length > 0 && (
        <Card title="Join requests waiting for you (team leader)">
          <table className="data">
            <thead><tr><th>Student</th><th>Team</th><th>Skills</th><th>Match</th><th></th></tr></thead>
            <tbody>
              {d.incoming.map((r: any) => (
                <tr key={r.request_id}>
                  <td>{r.student_name}</td>
                  <td>{r.team_name}</td>
                  <td><Chips items={r.student_skills.slice(0, 5)} /></td>
                  <td>{r.match_score !== null ? <ScoreBar value={Number(r.match_score)} /> : '—'}</td>
                  <td><Link className="text-brand-700 hover:underline" href={`/teams/${r.team_id}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="My teams">
          {d.myTeams.length === 0 ? <Empty>You are not in a team yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.myTeams.map((t: any) => (
                <li key={t.team_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/teams/${t.team_id}`} className="font-semibold text-ink hover:text-pine-700">{t.name}</Link>
                    <Meta className="mt-0.5 text-xs" items={[t.event_title, label(t.member_role)]} />
                    <div className="mt-1.5"><Slots filled={t.member_count} total={t.max_members} size={11} /></div>
                  </div>
                  <Badge>{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My join requests">
          {d.myRequests.length === 0 ? <Empty>No requests yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.myRequests.map((r: any) => (
                <li key={r.request_id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/teams/${r.team_id}`} className="font-semibold text-ink hover:text-pine-700">{r.team_name}</Link>
                    <Meta className="mt-0.5 text-xs" items={[r.event_title, `sent ${formatDate(r.created_at)}`]} />
                  </div>
                  <Badge>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Open events you have not joined">
          {d.openEvents.length === 0 ? <Empty>You are in a team for every open event.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.openEvents.map((e: any) => (
                <li key={e.event_id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/events/${e.event_id}`} className="font-semibold text-ink hover:text-pine-700">{e.title}</Link>
                  <span className="shrink-0 text-xs text-slate-500">
                    {e.recruiting_teams} recruiting, closes {formatDate(e.registration_deadline)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My capstone pitches">
          {d.myCapstones.length === 0 ? <Empty>No pitches yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.myCapstones.map((c: any) => (
                <li key={c.capstone_id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/capstones/${c.capstone_id}`} className="font-semibold text-ink hover:text-pine-700">{c.title}</Link>
                  <Badge>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function FacultyView({ d }: { d: any }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Pitches awaiting review" value={d.stats.pending_reviews} />
        <Stat label="Projects I mentor" value={d.stats.mentees} />
        <Stat label="Events I organise" value={d.stats.my_events} />
        <Stat label="Avg review time" value={d.stats.avg_review_hours ? `${d.stats.avg_review_hours} h` : '—'} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Capstone pitches awaiting review">
          {d.pendingReviews.length === 0 ? <Empty>Nothing to review.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.pendingReviews.map((c: any) => (
                <li key={c.capstone_id} className="py-2 text-sm">
                  <Link href={`/capstones/${c.capstone_id}`} className="font-semibold text-ink hover:text-pine-700">{c.title}</Link>
                  <Meta className="mt-0.5 text-xs" items={[c.domain, c.proposer_name, formatDate(c.submitted_at)]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Projects I mentor">
          {d.mentees.length === 0 ? <Empty>None yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {d.mentees.map((c: any) => (
                <li key={c.capstone_id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/capstones/${c.capstone_id}`} className="hover:underline">{c.title}</Link>
                  <Badge>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Events I organise" action={<LinkButton href="/events" variant="secondary">Manage events</LinkButton>}>
        {d.myEvents.length === 0 ? <Empty>No events yet.</Empty> : (
          <table className="data">
            <thead><tr><th>Event</th><th>Phase</th><th>Teams</th><th>Locked</th><th>Participants</th><th>Avg fill</th></tr></thead>
            <tbody>
              {d.myEvents.map((e: any) => (
                <tr key={e.event_id}>
                  <td><Link href={`/events/${e.event_id}`} className="text-brand-700 hover:underline">{e.title}</Link></td>
                  <td><Badge>{e.phase}</Badge></td>
                  <td>{e.total_teams}</td><td>{e.locked_teams}</td><td>{e.participants}</td>
                  <td>{e.avg_fill_pct ?? '—'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <SkillGapCard rows={d.skillGaps} />
    </>
  );
}

function SkillGapCard({ rows }: { rows: any[] }) {
  return (
    <Card title="Skill gaps (needed by recruiting teams, scarce among students)">
      {rows.length === 0 ? <Empty>No gaps right now.</Empty> : (
        <table className="data">
          <thead><tr><th>Skill</th><th>Teams needing</th><th>Students with skill</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{r.teams_needing}</td><td>{r.students_with}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Bars({ rows, label }: { rows: { status?: string; role?: string; total: number }[]; label: 'status' | 'role' }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const key = (r[label] ?? '') as string;
        return (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0"><Badge>{key}</Badge></span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="anim-grow h-full rounded-full bg-pine-600" style={{ width: `${(r.total / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums">{r.total}</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminView({ d }: { d: any }) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Users by role"><Bars rows={d.usersByRole} label="role" /></Card>
        <Card title="Teams by status"><Bars rows={d.teamsByStatus} label="status" /></Card>
        <Card title="Capstones by status"><Bars rows={d.capstonesByStatus} label="status" /></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Most active events">
          <table className="data">
            <thead><tr><th>Event</th><th>Phase</th><th>Teams</th><th>People</th><th>Fill</th></tr></thead>
            <tbody>
              {d.topEvents.map((e: any) => (
                <tr key={e.event_id}>
                  <td><Link href={`/events/${e.event_id}`} className="text-brand-700 hover:underline">{e.title}</Link></td>
                  <td><Badge>{e.phase}</Badge></td><td>{e.total_teams}</td><td>{e.participants}</td>
                  <td>{e.avg_fill_pct ?? '—'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Departments ranked by team participation">
          <table className="data">
            <thead><tr><th>#</th><th>Department</th><th>Students</th><th>In a team</th></tr></thead>
            <tbody>
              {d.departments.map((r: any) => (
                <tr key={r.department}>
                  <td>{r.rank}</td><td>{r.department}</td><td>{r.students}</td>
                  <td>{r.in_teams} ({r.pct_in_teams ?? 0}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="Skill demand vs supply (materialized view)"
        action={<span className="text-xs text-slate-500">refreshed {formatDate(d.skillDemand[0]?.refreshed_at, true)}</span>}>
        <table className="data">
          <thead><tr><th>Skill</th><th>Category</th><th>Open demand</th><th>Total demand</th><th>Supply</th></tr></thead>
          <tbody>
            {d.skillDemand.map((s: any) => (
              <tr key={s.name}>
                <td>{s.name}</td><td>{label(s.category)}</td><td>{s.open_demand}</td><td>{s.total_demand}</td><td>{s.supply}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Recent audit trail" action={<LinkButton href="/admin/audit" variant="secondary">Full log</LinkButton>}>
        <table className="data">
          <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Change</th><th>By</th></tr></thead>
          <tbody>
            {d.recentAudit.map((a: any) => (
              <tr key={a.log_id}>
                <td className="whitespace-nowrap">{formatDate(a.created_at, true)}</td>
                <td>{label(a.entity.replace(/s$/, ''))} #{a.entity_id}</td>
                <td>{label(a.action)}</td>
                <td>{a.old_value ? `${label(a.old_value)} → ` : ''}{label(a.new_value)}</td>
                <td>{a.actor_name ?? 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
