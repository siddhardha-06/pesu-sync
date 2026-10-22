'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Empty, Highlighted, LinkButton, Loading, Meta, PageHeader, ScoreBar, formatDate, label } from '@/components/ui';
import { useApi, useMe } from '@/lib/api-client';

const MODES = [
  { value: 'keyword', label: 'Keyword (PostgreSQL full-text)' },
  { value: 'semantic', label: 'Semantic (Qdrant vectors)' },
  { value: 'hybrid', label: 'Hybrid (rank fusion)' },
];

export default function CapstonesPage() {
  const me = useMe();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState({ q: '', mode: 'keyword', domain: '', status: '', mine: false });
  const params = new URLSearchParams();
  if (search.q) params.set('q', search.q);
  params.set('mode', search.mode);
  if (search.domain) params.set('domain', search.domain);
  if (search.status) params.set('status', search.status);
  if (search.mine) params.set('mine', '1');
  const { data, error, loading } = useApi(`/api/capstones?${params}`);

  function submit(e: FormEvent) {
    e.preventDefault();
    setSearch({ ...search, q: draft.trim() });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capstone marketplace"
        subtitle="Browse pitches, search by keyword or by meaning, and check for similar ideas before you pitch."
        action={me?.role === 'STUDENT' && <LinkButton href="/capstones/new">Pitch a capstone</LinkButton>}
      />

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input" aria-label="Search capstone pitches" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder='Try "machine learning healthcare" or "help farmers detect crop disease early"' />
          <div className="flex gap-2">
            <Button type="submit">Search</Button>
            {search.q && <Button type="button" variant="secondary" onClick={() => { setDraft(''); setSearch({ ...search, q: '' }); }}>Clear</Button>}
          </div>
        </div>
        <div role="radiogroup" aria-label="Search mode" className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-50 p-1 text-sm">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={search.mode === m.value}
              onClick={() => setSearch({ ...search, mode: m.value })}
              className={`rounded px-3 py-1.5 font-medium transition-colors duration-200 ${
                search.mode === m.value ? 'bg-ink text-paper' : 'text-slate-600 hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <select className="input w-auto min-w-44" value={search.domain} onChange={(e) => setSearch({ ...search, domain: e.target.value })}>
            <option value="">All domains</option>
            {data?.domains?.map((d: string) => <option key={d}>{d}</option>)}
          </select>
          <select className="input w-auto min-w-44" value={search.status} onChange={(e) => setSearch({ ...search, status: e.target.value })}>
            <option value="">Any status</option>
            {['SUBMITTED', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          {me?.role === 'STUDENT' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={search.mine} onChange={(e) => setSearch({ ...search, mine: e.target.checked })} /> Only my pitches
            </label>
          )}
        </div>
      </form>

      {loading && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && data.results.length === 0 && (
        <Empty>{search.q ? `No pitches match “${search.q}”. Try the semantic mode, which matches by meaning.` : 'No pitches yet.'}</Empty>
      )}
      <div className="space-y-3">
        {data?.results.map((c: any) => (
          <div key={c.capstone_id} className="rounded-lg border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-400">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/capstones/${c.capstone_id}`} className="display-soft text-xl text-ink hover:text-pine-700">{c.title}</Link>
                <Meta className="mt-0.5 text-xs" items={[
                  c.domain,
                  c.proposer_name,
                  c.team_name && `team ${c.team_name}`,
                  c.mentor_name && `mentor ${c.mentor_name}`,
                  formatDate(c.submitted_at),
                ]} />
                <p className="mt-2 text-sm text-slate-700">
                  {c.snippet ? <Highlighted text={c.snippet} /> : <span className="line-clamp-2">{c.abstract}</span>}
                </p>
                {c.tech_stack && <p className="mt-1 text-xs text-slate-500">Stack: {c.tech_stack}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge>{c.status}</Badge>
                {c.similarity !== undefined && <ScoreBar value={c.similarity} label="cosine similarity" />}
                {c.rank !== undefined && <span className="text-xs text-slate-500">ts_rank {Number(c.rank).toFixed(3)}</span>}
                {c.rrf !== undefined && <span className="text-xs text-slate-500">RRF {Number(c.rrf).toFixed(4)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
