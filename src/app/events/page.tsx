'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, formatDate, label } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api-client';

const TYPES = ['HACKATHON', 'COURSEWORK', 'CAPSTONE', 'COMPETITION', 'WORKSHOP'];

type Draft = Partial<{ title: string; description: string; startDate: string; endDate: string; registrationDeadline: string }>;

export default function EventsPage() {
  const me = useMe();
  const [type, setType] = useState('');
  const [phase, setPhase] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (phase) params.set('phase', phase);
  const { data, error, loading, reload } = useApi(`/api/events?${params}`);
  const canCreate = me?.role === 'FACULTY' || me?.role === 'ADMIN';

  function startFrom(d: Draft) {
    setDraft(d);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Events"
        subtitle="What is happening at PES University, and the hackathons, coursework and capstone cycles teams form for here."
        action={canCreate && <Button onClick={() => setDraft((v) => (v ? null : {}))}>{draft ? 'Close' : 'New event'}</Button>}
      />
      {draft && <EventForm key={JSON.stringify(draft)} initial={draft} onCreated={() => { setDraft(null); void reload(); }} />}

      <CampusEvents canRefresh={canCreate} onUse={canCreate ? startFrom : undefined} />

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display-soft text-3xl text-ink">Team events on PESU-Sync</h2>
          <div className="flex flex-wrap gap-3">
            <select className="input w-auto min-w-44" aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
            <select className="input w-auto min-w-44" aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="">Any phase</option>
              <option value="OPEN">Open for registration</option>
              <option value="REGISTRATION_CLOSED">Registration closed</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {loading && <Loading />}
        {error && <Alert>{error}</Alert>}
        {data && data.events.length === 0 && <Empty>No events match these filters. Clear one to see more.</Empty>}
        <div className="grid gap-4 md:grid-cols-2">
          {data?.events.map((e: any) => (
            <Link key={e.event_id} href={`/events/${e.event_id}`}
              className="group flex flex-col rounded-lg border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-ink">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-pine-700">{label(e.event_type)}</p>
                  <h3 className="display-soft mt-0.5 text-2xl text-ink">{e.title}</h3>
                </div>
                <Badge>{e.phase}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{e.description}</p>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Runs</dt>
                  <dd className="font-medium text-ink">{formatDate(e.start_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Register by</dt>
                  <dd className="font-medium text-ink">{formatDate(e.registration_deadline)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Team size</dt>
                  <dd className="tabular font-medium text-ink">{e.min_team_size}–{e.max_team_size}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                {e.total_teams} {e.total_teams === 1 ? 'team' : 'teams'}, {e.participants} people. Organised by {e.organizer_name}.
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Live events from the pes.edu website (cached by the API in PostgreSQL). */
function CampusEvents({ canRefresh, onUse }: { canRefresh: boolean; onUse?: (d: Draft) => void }) {
  const { data, error, loading, reload } = useApi('/api/campus-events');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await api('/api/campus-events', { method: 'POST' });
      await reload();
    } catch (err) {
      setRefreshError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const sync = data?.lastSync;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="display-soft text-2xl text-ink">Happening at PES University</h2>
          <p className="mt-1 text-sm text-slate-600">
            Live from the events calendar on{' '}
            <a href="https://pes.edu/events/" target="_blank" rel="noreferrer" className="font-medium text-pine-700 underline decoration-pine-200 underline-offset-4">
              pes.edu
            </a>
            {sync?.last_ok_at ? `, checked ${formatDate(sync.last_ok_at, true)}` : ''}.
          </p>
        </div>
        {canRefresh && (
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Checking pes.edu…' : 'Check pes.edu now'}
          </Button>
        )}
      </div>

      <div className="px-5 py-4">
        {loading && <Loading rows={2} />}
        {(error || refreshError) && <Alert>{error ?? refreshError}</Alert>}
        {sync && !sync.ok && <Alert kind="info">The last check failed ({sync.error}). Showing what was saved before.</Alert>}
        {data && data.events.length === 0 && (
          <p className="text-sm text-slate-600">
            pes.edu has no upcoming events listed right now. New ones appear here automatically, checked every 30 minutes.
          </p>
        )}
        {data && data.events.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {data.events.map((ev: any) => (
              <li key={ev.campus_event_id} className="flex flex-wrap items-start gap-x-5 gap-y-2 py-3">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-xs font-semibold text-brick-600">
                    {new Date(ev.starts_at).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}
                  </p>
                  <p className="display tabular text-3xl text-ink">
                    {new Date(ev.starts_at).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <a href={ev.url} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-pine-700">{ev.title}</a>
                  <p className="text-xs text-slate-500">
                    {ev.all_day ? 'All day' : new Date(ev.starts_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                    {ev.venue ? `, ${ev.venue}` : ''}
                  </p>
                  {ev.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{ev.summary}</p>}
                </div>
                {onUse && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      onUse({
                        title: ev.title.slice(0, 120),
                        description: `${ev.summary ?? ''}\n\nOn pes.edu: ${ev.url}`.trim(),
                        startDate: day(ev.starts_at),
                        endDate: day(ev.ends_at ?? ev.starts_at),
                        registrationDeadline: day(ev.starts_at),
                      })
                    }
                  >
                    Form teams for this
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EventForm({ initial, onCreated }: { initial: Draft; onCreated: () => void }) {
  const [f, setF] = useState({
    title: initial.title ?? '', eventType: 'HACKATHON', description: initial.description ?? '',
    startDate: initial.startDate ?? '', endDate: initial.endDate ?? '',
    registrationDeadline: initial.registrationDeadline ?? '', minTeamSize: '1', maxTeamSize: '4',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/events', { body: { ...f, minTeamSize: Number(f.minTeamSize), maxTeamSize: Number(f.maxTeamSize) } });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card title={initial.title ? 'Create a team event from pes.edu' : 'Create event'} className="anim-pop">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
        {error && <div className="md:col-span-3"><Alert>{error}</Alert></div>}
        <div className="md:col-span-2">
          <label className="label" htmlFor="ev-title">Title</label>
          <input id="ev-title" className="input" required value={f.title} onChange={set('title')} />
        </div>
        <div>
          <label className="label" htmlFor="ev-type">Type</label>
          <select id="ev-type" className="input" value={f.eventType} onChange={set('eventType')}>
            {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="label" htmlFor="ev-desc">Description</label>
          <textarea id="ev-desc" className="input" rows={3} value={f.description} onChange={set('description')} />
        </div>
        <div><label className="label" htmlFor="ev-start">Start date</label><input id="ev-start" className="input" type="date" required value={f.startDate} onChange={set('startDate')} /></div>
        <div><label className="label" htmlFor="ev-end">End date</label><input id="ev-end" className="input" type="date" required value={f.endDate} onChange={set('endDate')} /></div>
        <div><label className="label" htmlFor="ev-reg">Registration deadline</label><input id="ev-reg" className="input" type="date" required value={f.registrationDeadline} onChange={set('registrationDeadline')} /></div>
        <div><label className="label" htmlFor="ev-min">Min team size</label><input id="ev-min" className="input" type="number" min={1} max={10} value={f.minTeamSize} onChange={set('minTeamSize')} /></div>
        <div><label className="label" htmlFor="ev-max">Max team size</label><input id="ev-max" className="input" type="number" min={1} max={10} value={f.maxTeamSize} onChange={set('maxTeamSize')} /></div>
        <div className="flex items-end"><Button type="submit">Create event</Button></div>
      </form>
    </Card>
  );
}
