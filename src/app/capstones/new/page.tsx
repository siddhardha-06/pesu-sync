'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Meta, PageHeader, ScoreBar } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

// MiniLM cosine for two pitches on the same problem is typically 0.6-0.8
const DUPLICATE_THRESHOLD = 0.6;

export default function NewCapstonePage() {
  const router = useRouter();
  const myTeams = useApi('/api/teams?mine=1&status=');
  const faculty = useApi('/api/faculty');
  const [form, setForm] = useState({ title: '', abstract: '', domain: '', techStack: '', teamId: '', mentorId: '' });
  const [similar, setSimilar] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function checkSimilar() {
    setError(null);
    try {
      const q = `${form.title}. ${form.domain}. ${form.abstract}`.slice(0, 2000);
      const res = await api(`/api/search/semantic?type=capstones&limit=5&q=${encodeURIComponent(q)}`);
      setSimilar(res.results);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { capstone } = await api('/api/capstones', {
        body: {
          ...form,
          teamId: form.teamId ? Number(form.teamId) : null,
          mentorId: form.mentorId ? Number(form.mentorId) : null,
        },
      });
      router.push(`/capstones/${capstone.capstone_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const duplicates = similar?.filter((s) => s.score >= DUPLICATE_THRESHOLD) ?? [];

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader title="Pitch a capstone idea" subtitle="Faculty review every pitch. Check for similar ideas first — redundant pitches are a common reason for rejection." />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input className="input" required minLength={5} value={form.title} onChange={set('title')} />
          </div>
          <div>
            <label className="label">Domain</label>
            <input className="input" required value={form.domain} onChange={set('domain')} placeholder="Healthcare, FinTech, Agriculture…" />
          </div>
          <div className="md:col-span-3">
            <label className="label">Abstract (min 50 characters)</label>
            <textarea className="input" rows={6} required minLength={50} value={form.abstract} onChange={set('abstract')} />
          </div>
          <div>
            <label className="label">Tech stack</label>
            <input className="input" value={form.techStack} onChange={set('techStack')} placeholder="PyTorch, Next.js, PostgreSQL" />
          </div>
          <div>
            <label className="label">Team (optional)</label>
            <select className="input" value={form.teamId} onChange={set('teamId')}>
              <option value="">No team yet</option>
              {myTeams.data?.teams.map((t: any) => <option key={t.team_id} value={t.team_id}>{t.name} ({t.event_title})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Preferred mentor (optional)</label>
            <select className="input" value={form.mentorId} onChange={set('mentorId')}>
              <option value="">Let faculty decide</option>
              {faculty.data?.faculty.map((f: any) => (
                <option key={f.user_id} value={f.user_id}>{f.full_name} — {f.department} ({f.mentoring} mentored)</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card title="Similar existing pitches" action={
        <Button type="button" variant="secondary" disabled={form.abstract.trim().length < 20} onClick={checkSimilar}>
          Check for similar ideas
        </Button>
      }>
        {similar === null && <p className="text-sm text-slate-500">Compares your title and abstract with every existing pitch by meaning.</p>}
        {duplicates.length > 0 && (
          <div className="mb-3"><Alert>Very similar pitches already exist (cosine ≥ {DUPLICATE_THRESHOLD}). Consider differentiating your idea.</Alert></div>
        )}
        {similar?.length === 0 && <p className="text-sm text-slate-500">Nothing similar found. Your idea looks new.</p>}
        <ul className="divide-y divide-slate-100">
          {similar?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <Link href={`/capstones/${s.id}`} target="_blank" className="font-medium hover:underline">{s.title}</Link>
                <Meta className="text-xs" items={[s.domain, s.proposer_name]} />
              </div>
              <div className="flex items-center gap-3"><Badge>{s.status}</Badge><ScoreBar value={s.score} /></div>
            </li>
          ))}
        </ul>
      </Card>

      <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit pitch for review'}</Button>
    </form>
  );
}
