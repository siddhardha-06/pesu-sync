'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Chips, Empty, LinkButton, Loading, Meta, PageHeader, Slots, Stat, formatDate, label } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api-client';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const { data, error, loading } = useApi(`/api/events/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const e = data.event;
  const canManage = me && (me.role === 'ADMIN' || (me.role === 'FACULTY' && me.id === e.organizer_id));

  async function remove() {
    if (!confirm('Delete this event? Only possible while it has no teams.')) return;
    try {
      await api(`/api/events/${id}`, { method: 'DELETE' });
      router.push('/events');
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={e.title}
        subtitle={<Meta items={[label(e.event_type), `Organised by ${e.organizer_name}`, <Badge key="p">{e.phase}</Badge>]} />}
        action={
          <div className="flex gap-2">
            {me?.role === 'STUDENT' && e.phase === 'OPEN' && (
              <LinkButton href={`/teams/new?eventId=${e.event_id}`}>Create a team here</LinkButton>
            )}
            {canManage && <Button variant="danger" onClick={remove}>Delete event</Button>}
          </div>
        }
      />
      {actionError && <Alert>{actionError}</Alert>}
      <p className="max-w-3xl text-slate-700">{e.description}</p>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Runs" value={<span className="text-2xl">{formatDate(e.start_date)}</span>} hint={`until ${formatDate(e.end_date)}`} />
        <Stat label="Registration closes" value={<span className="text-2xl">{formatDate(e.registration_deadline)}</span>} />
        <Stat label="Teams" value={e.total_teams} hint={`${e.recruiting_teams} recruiting, ${e.locked_teams} locked`} />
        <Stat label="Participants" value={e.participants} hint={`Teams are ${e.avg_fill_pct ?? 0}% full on average, size ${e.min_team_size}–${e.max_team_size}`} />
      </div>
      <Card title="Teams in this event">
        {data.teams.length === 0 ? <Empty>No teams yet. Students can create the first one from this page.</Empty> : (
          <table className="data">
            <thead><tr><th>Team</th><th>Category</th><th>Leader</th><th>Members</th><th>Looking for</th><th>Status</th></tr></thead>
            <tbody>
              {data.teams.map((t: any) => (
                <tr key={t.team_id}>
                  <td><Link href={`/teams/${t.team_id}`} className="font-semibold text-ink hover:text-pine-700">{t.name}</Link></td>
                  <td>{label(t.category)}</td>
                  <td>{t.leader_name}</td>
                  <td><Slots filled={t.member_count} total={t.max_members} size={11} /></td>
                  <td><Chips items={t.required_skills} /></td>
                  <td><Badge>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
