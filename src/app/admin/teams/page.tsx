'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Loading, PageHeader, formatDate, label } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

export default function AdminTeamsPage() {
  const { data, error, loading, reload } = useApi('/api/admin/teams');
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function run(fn: () => Promise<any>, success: (r: any) => string) {
    setFlash(null);
    try {
      const r = await fn();
      setFlash({ kind: 'success', text: success(r) });
      await reload();
    } catch (err) {
      setFlash({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moderation"
        subtitle="Disband spam or duplicate team listings and refresh analytics"
        action={
          <Button variant="secondary" onClick={() => run(() => api('/api/admin/analytics/refresh', { method: 'POST' }),
            (r) => `mv_skill_demand refreshed (${r.skills} skills) at ${formatDate(r.refreshed_at, true)}.`)}>
            Refresh skill analytics
          </Button>
        }
      />
      {flash && <Alert kind={flash.kind}>{flash.text}</Alert>}
      {loading && !data && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && (
        <Card title={`${data.teams.length} teams`}>
          <table className="data">
            <thead><tr><th>Team</th><th>Event</th><th>Leader</th><th>Members</th><th>Pending</th><th>Created</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.teams.map((t: any) => (
                <tr key={t.team_id}>
                  <td><Link href={`/teams/${t.team_id}`} className="font-semibold text-ink hover:text-pine-700">{t.name}</Link><p className="text-xs text-slate-500">{label(t.category)}</p></td>
                  <td>{t.event_title}</td>
                  <td>{t.leader_name}</td>
                  <td>{t.member_count}/{t.max_members}</td>
                  <td>{t.pending_requests}</td>
                  <td className="text-xs">{formatDate(t.created_at)}</td>
                  <td><Badge>{t.status}</Badge></td>
                  <td>
                    {t.status !== 'DISBANDED' && (
                      <Button variant="danger" onClick={() => confirm(`Disband ${t.name}?`) &&
                        run(() => api(`/api/admin/teams/${t.team_id}`, { method: 'PATCH', body: { action: 'disband' } }),
                          (r) => `${t.name} disbanded; ${r.rejectedRequests} pending request(s) rejected.`)}>
                        Disband
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
