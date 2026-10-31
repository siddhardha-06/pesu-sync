'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import SkillPicker from '@/components/SkillPicker';
import { Alert, Button, Card, PageHeader, label } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';
import { TEAM_CATEGORIES } from '@/lib/constants';

export default function NewTeamPage() {
  const router = useRouter();
  const events = useApi('/api/events?phase=OPEN');
  const [form, setForm] = useState({ eventId: '', name: '', category: 'WEB', description: '', maxMembers: '4', deadline: '' });
  const [skills, setSkills] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get('eventId');
    if (eventId) setForm((f) => ({ ...f, eventId }));
  }, []);

  const selectedEvent = events.data?.events.find((e: any) => String(e.event_id) === form.eventId);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { team } = await api('/api/teams', {
        body: {
          ...form,
          eventId: Number(form.eventId),
          maxMembers: Number(form.maxMembers),
          requiredSkillIds: Object.keys(skills).map(Number),
        },
      });
      router.push(`/teams/${team.team_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader title="Create a team listing" subtitle="You become the team leader. Required skills and the description drive match suggestions." />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Event (open for registration)</label>
            <select className="input" required value={form.eventId} onChange={set('eventId')}>
              <option value="">Select an event…</option>
              {events.data?.events.map((ev: any) => (
                <option key={ev.event_id} value={ev.event_id}>{ev.title} ({label(ev.event_type)})</option>
              ))}
            </select>
            {selectedEvent && (
              <p className="mt-1 text-xs text-slate-500">
                Team size {selectedEvent.min_team_size}–{selectedEvent.max_team_size}, registration closes {selectedEvent.registration_deadline?.slice(0, 10)}
              </p>
            )}
          </div>
          <div>
            <label className="label">Max members</label>
            <input className="input" type="number" min={2} max={selectedEvent?.max_team_size ?? 10} required
              value={form.maxMembers} onChange={set('maxMembers')} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Team name</label>
            <input className="input" required value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={set('category')}>
              {TEAM_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label">What are you building and who do you need? (min 20 chars)</label>
            <textarea className="input" rows={4} required minLength={20} value={form.description} onChange={set('description')} />
          </div>
          <div>
            <label className="label">Recruiting deadline (optional)</label>
            <input className="input" type="date" value={form.deadline} onChange={set('deadline')} />
          </div>
        </div>
      </Card>
      <Card title="Skills you are looking for">
        <SkillPicker value={skills} onChange={setSkills} withProficiency={false} />
      </Card>
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create team'}</Button>
    </form>
  );
}
