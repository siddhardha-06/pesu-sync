'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Chips, Empty, LinkButton, Loading, Meta, PageHeader, ScoreBar, Slots, formatDate, label } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

export default function MatchesPage() {
  const { data, error, loading, reload } = useApi('/api/matches');
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function request(teamId: number) {
    setFlash(null);
    try {
      await api(`/api/teams/${teamId}/join`, { body: { message: 'Found you through PESU-Sync match suggestions.' } });
      setFlash({ kind: 'success', text: 'Join request sent.' });
      await reload();
    } catch (err) {
      setFlash({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Match suggestions"
        subtitle="Teams ranked for you: three parts how closely your profile matches the listing, one part how many of their required skills you already have."
        action={<LinkButton href="/profile" variant="secondary">Improve my profile</LinkButton>}
      />
      {flash && <Alert key={flash.text} kind={flash.kind}>{flash.text}</Alert>}
      {loading && <Loading rows={4} />}
      {error && <Alert>{error}</Alert>}
      {data?.hint && <Alert kind="info">{data.hint}</Alert>}
      {data && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-ink">Matching on your skills</span>
          <Chips items={data.mySkills} />
        </div>
      )}
      {data && data.suggestions.length === 0 && !data.hint && <Empty>No open teams fit right now. New listings appear here as soon as they are posted.</Empty>}
      <ol className="space-y-3">
        {data?.suggestions.map((t: any, i: number) => (
          <li key={t.team_id} className="grid grid-cols-[auto_1fr] gap-x-5 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-[auto_1fr_auto]">
            <span className="display tabular row-span-2 w-10 text-5xl text-slate-300" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
            <div className="min-w-0">
              <Link href={`/teams/${t.team_id}`} className="display-soft text-2xl text-ink hover:text-pine-700">{t.name}</Link>
              <Meta className="mt-0.5 text-xs" items={[t.event_title, label(t.category), `led by ${t.leader_name}`, `register by ${formatDate(t.registration_deadline)}`]} />
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.description}</p>
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">You bring</span><Chips items={t.matchedSkills} highlight={t.matchedSkills} /></div>
                <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">You would learn</span><Chips items={t.missingSkills} /></div>
              </div>
            </div>
            <div className="col-start-2 mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 md:col-start-3 md:row-start-1 md:mt-0 md:w-48 md:flex-col md:items-start">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Match</p>
                <ScoreBar value={t.score} label={`semantic ${t.cosine.toFixed(2)}, skills ${(t.overlap * 100).toFixed(0)}%`} />
              </div>
              <Slots filled={t.member_count} total={t.max_members} size={12} />
              {t.requested ? <Badge>PENDING</Badge> : <Button onClick={() => request(t.team_id)}>Request to join</Button>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
