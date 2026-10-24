'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Loading, PageHeader, formatDate } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

export default function AdminUsersPage() {
  const [filters, setFilters] = useState({ role: '', active: '', q: '' });
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, error, loading, reload } = useApi(`/api/admin/users?${params}`);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function update(userId: number, body: Record<string, unknown>, success: string) {
    setFlash(null);
    try {
      await api(`/api/admin/users/${userId}`, { method: 'PATCH', body });
      setFlash({ kind: 'success', text: success });
      await reload();
    } catch (err) {
      setFlash({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="User management" subtitle="Deactivate, unlock or change roles. Users are never deleted, so the audit trail stays intact."
        action={<Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Close' : 'Create account'}</Button>} />
      {showCreate && <CreateUser onDone={() => { setShowCreate(false); void reload(); }} />}
      {flash && <Alert kind={flash.kind}>{flash.text}</Alert>}
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto min-w-40" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All roles</option>
          {['STUDENT', 'FACULTY', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="input w-auto min-w-40" value={filters.active} onChange={(e) => setFilters({ ...filters, active: e.target.value })}>
          <option value="">Active + inactive</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <input className="input w-auto min-w-44" placeholder="Name, email or SRN" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      </div>
      {loading && !data && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && (
        <Card title={`${data.users.length} users`}>
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Name</th><th>Role</th><th>Dept / SRN</th><th>Teams</th><th>Pitches</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.users.map((u: any) => (
                  <tr key={u.user_id} className={u.is_active ? '' : 'opacity-60'}>
                    <td>{u.full_name}<p className="text-xs text-slate-500">{u.email}</p></td>
                    <td><Badge>{u.role}</Badge></td>
                    <td className="text-xs">{u.department}{u.srn && <><br />{u.srn}, semester {u.semester}</>}</td>
                    <td>{u.teams}</td>
                    <td>{u.capstones}</td>
                    <td className="text-xs">{formatDate(u.last_login_at, true)}</td>
                    <td className="text-xs">
                      {u.is_active ? 'active' : 'inactive'}
                      {u.failed_logins >= 5 && <p className="font-semibold text-rose-700">locked ({u.failed_logins} fails)</p>}
                    </td>
                    <td className="space-x-2 whitespace-nowrap text-xs">
                      <button className="text-brand-700 hover:underline"
                        onClick={() => update(u.user_id, { isActive: !u.is_active }, `${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}.`)}>
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      {u.failed_logins > 0 && (
                        <button className="text-brand-700 hover:underline" onClick={() => update(u.user_id, { unlock: true }, 'Login unlocked.')}>Unlock</button>
                      )}
                      {u.role !== 'ADMIN' && u.role === 'FACULTY' && (
                        <button className="text-brand-700 hover:underline" onClick={() => update(u.user_id, { role: 'ADMIN' }, 'Promoted to admin.')}>Make admin</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', password: '', role: 'FACULTY', department: 'CSE', srn: '', semester: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/users', { body: { ...f, semester: f.semester ? Number(f.semester) : null, srn: f.srn || null } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card title="Create account">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        {error && <div className="md:col-span-4"><Alert>{error}</Alert></div>}
        <input className="input" placeholder="Full name" required value={f.fullName} onChange={set('fullName')} />
        <input className="input" placeholder="name@pes.edu" type="email" required value={f.email} onChange={set('email')} />
        <input className="input" placeholder="Temporary password" type="password" minLength={8} required value={f.password} onChange={set('password')} />
        <select className="input" value={f.role} onChange={set('role')}>
          {['FACULTY', 'ADMIN', 'STUDENT'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <input className="input" placeholder="Department" value={f.department} onChange={set('department')} />
        {f.role === 'STUDENT' && (
          <>
            <input className="input" placeholder="SRN" value={f.srn} onChange={set('srn')} />
            <input className="input" placeholder="Semester" type="number" min={1} max={8} value={f.semester} onChange={set('semester')} />
          </>
        )}
        <Button type="submit">Create</Button>
      </form>
    </Card>
  );
}
