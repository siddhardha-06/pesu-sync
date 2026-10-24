'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Alert, Badge, Card, Loading, PageHeader, formatDate, label } from '@/components/ui';
import { useApi } from '@/lib/api-client';

const ENTITIES = ['teams', 'team_members', 'join_requests', 'capstone_projects'];
const ACTIONS = ['CREATED', 'STATUS_CHANGE', 'DELETED'];

export default function AuditPage() {
  const [filters, setFilters] = useState({ entity: '', action: '', actor: '' });
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, error, loading } = useApi(`/api/admin/audit?${params}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" subtitle="Every request, acceptance, lock and review, written by database triggers. Nobody can edit or delete these rows." />
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto min-w-44" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })}>
          <option value="">Everything</option>
          {ENTITIES.map((x) => <option key={x} value={x}>{label(x.replace(/s$/, ''))}</option>)}
        </select>
        <select className="input w-auto min-w-44" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
          <option value="">All actions</option>
          {ACTIONS.map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <input className="input w-auto min-w-44" placeholder="Actor name" value={filters.actor} onChange={(e) => setFilters({ ...filters, actor: e.target.value })} />
      </div>
      {loading && !data && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="grid gap-6 md:grid-cols-4">
          <Card title="Summary">
            <table className="data">
              <tbody>
                {data.summary.map((s: any, i: number) => (
                  <tr key={i} className={s.action ? '' : 'font-semibold'}>
                    <td className={`text-xs ${s.action ? 'pl-5' : ''}`}>
                      {s.action ? label(s.action) : s.entity ? `${label(s.entity.replace(/s$/, ''))}, all` : 'Everything'}
                    </td>
                    <td className="tabular text-right">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title={`Latest ${data.logs.length} entries`} className="md:col-span-3">
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Change</th><th>Actor</th></tr></thead>
                <tbody>
                  {data.logs.map((l: any) => (
                    <tr key={l.log_id}>
                      <td className="whitespace-nowrap text-xs">{formatDate(l.created_at, true)}</td>
                      <td>{label(l.entity.replace(/s$/, ''))} #{l.entity_id}{l.details?.user_id ? <span className="text-xs text-slate-500"> (user #{l.details.user_id})</span> : null}</td>
                      <td className="text-xs">{label(l.action)}</td>
                      <td>
                        {l.old_value && <><Badge>{l.old_value}</Badge> → </>}
                        {l.new_value && <Badge>{l.new_value}</Badge>}
                      </td>
                      <td className="text-xs">{l.actor_name ?? 'system'}{l.actor_role ? ` (${l.actor_role})` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
