'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Chips, Empty, LinkButton, Loading, Meta, PageHeader, ScoreBar, Slots, label } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api-client';
import { TEAM_CATEGORIES, TEAM_STATUSES } from '@/lib/constants';

export default function TeamsPage() {
  const me = useMe();
  const events = useApi('/api/events');
  const skills = useApi('/api/skills');
  const [filters, setFilters] = useState({ eventId: '', category: '', skillId: '', status: 'RECRUITING', q: '', mine: false });
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semantic, setSemantic] = useState<any>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (k === 'mine') {
      if (v) params.set('mine', '1');
    } else if (v) params.set(k, String(v));
  });
  const list = useApi(`/api/teams?${params}`);
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters({ ...filters, [k]: e.target.value });

  async function runSemantic(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSemanticError(null);
    try {
      setSemantic(await api(`/api/search/semantic?type=teams&onlyRecruiting=1&q=${encodeURIComponent(semanticQuery)}`));
    } catch (err) {
      setSemanticError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        subtitle="Filter the listings, or describe what you want to build and search by meaning."
        action={me?.role === 'STUDENT' && <LinkButton href="/teams/new">Create a team</LinkButton>}
      />

      <form onSubmit={runSemantic} className="rounded-lg border border-pine-100 bg-pine-50 p-5">
        <label className="label" htmlFor="semantic-q">Describe the team you want to join</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="semantic-q" className="input" value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)}
            placeholder="e.g. building hardware with sensors to save electricity" />
          <div className="flex gap-2">
            <Button type="submit" disabled={searching || semanticQuery.trim().length < 3}>{searching ? 'Searching…' : 'Search by meaning'}</Button>
            {semantic && <Button type="button" variant="secondary" onClick={() => setSemantic(null)}>Back to all teams</Button>}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-600">Matches your words against every listing with vector search (Qdrant, cosine similarity), not exact keywords.</p>
        {semanticError && <div className="mt-3"><Alert>{semanticError}</Alert></div>}
      </form>

      {semantic ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Recruiting teams closest to “{semantic.query}”</p>
          {semantic.results.length === 0 && <Empty>No recruiting team is close to that. Try describing the project instead of a skill.</Empty>}
          {semantic.results.map((t: any) => (
            <div key={t.id} className="anim-pop flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <div className="min-w-0">
                <Link href={`/teams/${t.id}`} className="display-soft text-xl text-ink hover:text-pine-700">{t.title}</Link>
                <Meta className="mt-0.5 text-xs" items={[t.event_title, label(t.category)]} />
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <Slots filled={t.member_count} total={t.max_members} size={12} />
                  <Chips items={t.required_skills} />
                </div>
              </div>
              <ScoreBar value={t.score} label="cosine similarity" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-6">
            <select className="input" value={filters.eventId} onChange={set('eventId')}>
              <option value="">All events</option>
              {events.data?.events.map((e: any) => <option key={e.event_id} value={e.event_id}>{e.title}</option>)}
            </select>
            <select className="input" value={filters.category} onChange={set('category')}>
              <option value="">Any category</option>
              {TEAM_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
            <select className="input" value={filters.skillId} onChange={set('skillId')}>
              <option value="">Needs any skill</option>
              {skills.data?.skills.map((s: any) => <option key={s.skill_id} value={s.skill_id}>{s.name}</option>)}
            </select>
            <select className="input" value={filters.status} onChange={set('status')}>
              <option value="">Any status</option>
              {TEAM_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <input className="input" placeholder="Keyword" value={filters.q} onChange={set('q')} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} />
              Only my teams
            </label>
          </div>

          {list.loading && <Loading />}
          {list.error && <Alert>{list.error}</Alert>}
          {list.data && (
            <>
              <p className="text-sm text-slate-600">
                {list.data.total} {list.data.total === 1 ? 'team' : 'teams'}
              </p>
              {list.data.teams.length === 0 ? <Empty>No teams match these filters. Clear one, or search by meaning above.</Empty> : (
                <div className="grid gap-4 md:grid-cols-2">
                  {list.data.teams.map((t: any) => (
                    <Link key={t.team_id} href={`/teams/${t.team_id}`}
                      className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-ink">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="display-soft text-xl text-ink">{t.name}</h2>
                          <Meta className="mt-0.5 text-xs" items={[t.event_title, label(t.category), `led by ${t.leader_name}`]} />
                        </div>
                        <Badge>{t.status}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.description}</p>
                      <div className="mt-auto space-y-2.5 pt-4">
                        <Slots filled={t.member_count} total={t.max_members} />
                        <Chips items={t.required_skills} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
