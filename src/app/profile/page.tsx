'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type FormEvent } from 'react';
import SkillPicker from '@/components/SkillPicker';
import { Alert, Button, Card, Loading, Meta, PageHeader } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

interface ProjectForm {
  title: string;
  description: string;
  projectUrl: string;
  year: string;
}

export default function ProfilePage() {
  const { data, error, loading } = useApi('/api/profile');
  const [bio, setBio] = useState('');
  const [semester, setSemester] = useState('5');
  const [skills, setSkills] = useState<Record<number, number>>({});
  const [projects, setProjects] = useState<ProjectForm[]>([]);
  const [indexed, setIndexed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const welcome = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('welcome');

  function hydrate(d: any) {
    setBio(d.user.bio ?? '');
    setSemester(String(d.user.semester ?? 5));
    setSkills(Object.fromEntries(d.skills.map((s: any) => [s.skill_id, s.proficiency])));
    setProjects(
      d.projects.map((p: any) => ({
        title: p.title,
        description: p.description ?? '',
        projectUrl: p.project_url ?? '',
        year: p.year ? String(p.year) : '',
      })),
    );
    setIndexed(d.vectorIndexed);
  }

  useEffect(() => {
    if (data) hydrate(data);
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const d = await api('/api/profile', {
        method: 'PUT',
        body: {
          bio,
          semester: Number(semester),
          skills: Object.entries(skills).map(([skillId, proficiency]) => ({ skillId: Number(skillId), proficiency })),
          projects: projects.filter((p) => p.title.trim()).map((p) => ({ ...p, year: p.year ? Number(p.year) : null })),
        },
      });
      hydrate(d);
      setMessage({ kind: 'success', text: 'Profile saved and re-embedded for matching.' });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  return (
    <form onSubmit={save} className="space-y-6">
      <PageHeader
        title="My profile"
        subtitle={<Meta items={[
          data.user.full_name,
          data.user.srn,
          data.user.department,
          data.user.email,
          data.user.pesu_verified_at && (
            <span key="v" className="inline-flex items-center gap-1 font-semibold text-pine-700" title={`Last confirmed by PESU Academy on ${new Date(data.user.pesu_verified_at).toLocaleDateString('en-IN')}`}>
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.7 5.9-4.2 4.6a.8.8 0 0 1-1.2 0L4.3 8.4a.8.8 0 1 1 1.2-1.1l1.4 1.5 3.6-4a.8.8 0 0 1 1.2 1.1Z" /></svg>
              Verified with PESU Academy
            </span>
          ),
        ]} />}
        action={
          <span
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
            title="Your profile is stored as a 384-dimension vector in Qdrant"
          >
            <span className={`h-2 w-2 rounded-full ${indexed ? 'bg-pine-600' : indexed === null ? 'bg-brick-600' : 'bg-marigold-500'}`} />
            {indexed === null ? 'Matching service offline' : indexed ? 'In matching' : 'Save to join matching'}
          </span>
        }
      />
      {welcome && <Alert kind="info">Welcome! Add a bio, skills and past projects — they drive your match suggestions.</Alert>}
      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <Card title="About you">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-3">
            <label className="label">Bio</label>
            <textarea className="input" rows={4} value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Backend developer who enjoys designing databases and REST APIs" />
          </div>
          <div>
            <label className="label">Semester</label>
            <select className="input" value={semester} onChange={(e) => setSemester(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card title="Skills (proficiency 1–5)">
        <SkillPicker value={skills} onChange={setSkills} />
      </Card>

      <Card title="Past projects" action={
        <Button type="button" variant="secondary"
          onClick={() => setProjects([...projects, { title: '', description: '', projectUrl: '', year: '' }])}>
          Add project
        </Button>
      }>
        <div className="space-y-4">
          {projects.length === 0 && <p className="text-sm text-slate-500">No projects added.</p>}
          {projects.map((p, i) => {
            const update = (k: keyof ProjectForm, v: string) =>
              setProjects(projects.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-6">
                <input className="input md:col-span-3" placeholder="Title" value={p.title} onChange={(e) => update('title', e.target.value)} />
                <input className="input md:col-span-2" placeholder="https://github.com/..." value={p.projectUrl} onChange={(e) => update('projectUrl', e.target.value)} />
                <input className="input" placeholder="Year" value={p.year} onChange={(e) => update('year', e.target.value)} />
                <textarea className="input md:col-span-5" rows={2} placeholder="What did you build?" value={p.description}
                  onChange={(e) => update('description', e.target.value)} />
                <Button type="button" variant="danger" onClick={() => setProjects(projects.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
    </form>
  );
}
