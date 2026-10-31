'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, PageHeader, label } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

interface Skill {
  skill_id: number;
  name: string;
  category: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { data } = useApi<{ skills: Skill[] }>('/api/skills');
  const [form, setForm] = useState({
    fullName: '',
    password: '',
    srn: '',
    semester: '5',
    department: 'CSE',
    bio: '',
  });
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  // Student accounts are always <srn>@stu.pes.edu (also enforced by chk_users_email_campus)
  const studentEmail = form.srn.trim() ? `${form.srn.trim().toLowerCase()}@stu.pes.edu` : '';

  function toggle(id: number) {
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = 3;
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/register', {
        body: {
          ...form,
          email: studentEmail,
          semester: Number(form.semester),
          skills: Object.entries(picked).map(([skillId, proficiency]) => ({ skillId: Number(skillId), proficiency })),
        },
      });
      router.push('/profile?welcome=1');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const byCategory = (data?.skills ?? []).reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Create a student account"
        subtitle={
          <>
            Your bio and skills decide which teams you are matched with. Already on PESU Academy?{' '}
            <Link href="/login" className="font-semibold text-pine-700 underline decoration-pine-200 underline-offset-4">
              Log in with PESU Academy
            </Link>{' '}
            instead, no separate password needed.
          </>
        }
      />
      <Card>
        <form onSubmit={submit} className="space-y-5">
          {error && <Alert>{error}</Alert>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input className="input" required value={form.fullName} onChange={set('fullName')} />
            </div>
            <div>
              <label className="label">Campus email (from your SRN)</label>
              <input className="input bg-slate-50 text-slate-600" readOnly tabIndex={-1}
                value={studentEmail} placeholder="<srn>@stu.pes.edu" />
            </div>
            <div>
              <label className="label">Password (min 8 chars)</label>
              <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} />
            </div>
            <div>
              <label className="label">SRN</label>
              <input className="input" required value={form.srn} onChange={set('srn')} placeholder="PES1UG24AM186" />
            </div>
            <div>
              <label className="label">Semester</label>
              <select className="input" value={form.semester} onChange={set('semester')}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.department} onChange={set('department')}>
                {['CSE', 'CSE (AI & ML)', 'ECE', 'EEE', 'ME', 'BT'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Short bio (used for semantic matching)</label>
            <textarea className="input" rows={3} value={form.bio} onChange={set('bio')}
              placeholder="What do you like building? What role do you usually take in a team?" />
          </div>
          <div>
            <p className="label">Skills <span className="font-normal text-slate-500">(click to add, then set proficiency 1–5)</span></p>
            <div className="space-y-3">
              {Object.entries(byCategory).map(([cat, skills]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">{label(cat)}</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span key={s.skill_id} className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => toggle(s.skill_id)} aria-pressed={Boolean(picked[s.skill_id])}
                          className={`rounded-full border px-2.5 py-1 text-xs transition duration-150 active:scale-95 ${picked[s.skill_id]
                            ? 'border-pine-600 bg-pine-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-ink'}`}>
                          {s.name}
                        </button>
                        {picked[s.skill_id] && (
                          <select aria-label={`${s.name} proficiency`} className="anim-pop rounded border border-slate-300 bg-white text-xs" value={picked[s.skill_id]}
                            onChange={(e) => setPicked({ ...picked, [s.skill_id]: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                          </select>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
          <p className="text-xs text-slate-500">
            Faculty and admin accounts are created by an administrator. Already registered?{' '}
            <Link href="/login" className="font-semibold text-pine-700 underline decoration-pine-200 underline-offset-4">Log in</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
