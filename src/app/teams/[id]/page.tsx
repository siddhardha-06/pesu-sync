'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Chips, Empty, Loading, Meta, PageHeader, ScoreBar, Slots, formatDate, label } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api-client';

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data, error, loading, reload } = useApi(`/api/teams/${id}`);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [joinMessage, setJoinMessage] = useState('');

  async function act(fn: () => Promise<unknown>, success: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ kind: 'success', text: success });
      await reload();
    } catch (err) {
      setFlash({ kind: 'error', text: (err as Error).message });
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const { team, members, requests, myRequest, viewer, history, capstone } = data;
  const isOpen = team.status === 'RECRUITING' || team.status === 'FULL';
  const canRequest = viewer.role === 'STUDENT' && !viewer.isMember && team.status === 'RECRUITING' && myRequest?.status !== 'PENDING';

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.name}
        subtitle={<Meta items={[
          <Link key="e" href={`/events/${team.event_id}`} className="font-medium text-pine-700 hover:underline">{team.event_title}</Link>,
          label(team.category),
          `led by ${team.leader_name}`,
        ]} />}
        action={<Badge>{team.status}</Badge>}
      />
      {flash && <Alert key={flash.text} kind={flash.kind}>{flash.text}</Alert>}

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="About" className="md:col-span-2">
          <p className="whitespace-pre-line text-slate-700">{team.description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-100 pt-4">
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Seats</p>
              <Slots filled={team.member_count} total={team.max_members} size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Recruiting until</p>
              <p className="font-semibold text-ink">{formatDate(team.deadline ?? team.registration_deadline)}</p>
            </div>
            {team.locked_at && (
              <div>
                <p className="text-xs text-slate-500">Roster locked</p>
                <p className="font-semibold text-ink">{formatDate(team.locked_at)}</p>
              </div>
            )}
          </div>
          <div className="mt-4"><p className="mb-1.5 text-xs text-slate-500">Looking for</p><Chips items={team.required_skills} /></div>
          {capstone && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              Capstone pitch:
              <Link href={`/capstones/${capstone.capstone_id}`} className="font-semibold text-pine-700 hover:underline">{capstone.title}</Link>
              <Badge>{capstone.status}</Badge>
            </p>
          )}
        </Card>

        <Card title="Actions">
          <div className="space-y-3">
            {canRequest && (
              <div className="space-y-2">
                <textarea className="input" rows={3} placeholder="Why do you want to join? (optional)"
                  value={joinMessage} onChange={(e) => setJoinMessage(e.target.value)} />
                <Button className="w-full" onClick={() => act(() => api(`/api/teams/${id}/join`, { body: { message: joinMessage } }), 'Request sent to the team leader.')}>
                  Request to join
                </Button>
              </div>
            )}
            {myRequest?.status === 'PENDING' && (
              <>
                <Alert kind="info">Your request is pending since {formatDate(myRequest.created_at)}.</Alert>
                <Button variant="secondary" className="w-full" onClick={() => act(() => api(`/api/teams/${id}/join`, { method: 'DELETE' }), 'Request withdrawn.')}>
                  Withdraw request
                </Button>
              </>
            )}
            {myRequest && myRequest.status !== 'PENDING' && !viewer.isMember && (
              <p className="text-sm text-slate-600">Your last request was <Badge>{myRequest.status}</Badge></p>
            )}
            {viewer.isMember && !viewer.isLeader && isOpen && me && (
              <Button variant="danger" className="w-full" onClick={() => confirm('Leave this team?') &&
                act(() => api(`/api/teams/${id}/members/${me.id}`, { method: 'DELETE' }), 'You left the team.')}>
                Leave team
              </Button>
            )}
            {viewer.canManage && isOpen && (
              <Button variant="success" className="w-full" onClick={() => confirm('Lock the roster? Pending requests will be rejected.') &&
                act(() => api(`/api/teams/${id}/lock`, { method: 'POST' }), 'Team locked. Roster is final.')}>
                Lock the roster
              </Button>
            )}
            {!canRequest && !viewer.isMember && !viewer.canManage && !myRequest && (
              <p className="text-sm text-slate-500">This team is not accepting requests.</p>
            )}
          </div>
        </Card>
      </div>

      <Card title={`Members (${members.length})`}>
        <table className="data">
          <thead><tr><th>Name</th><th>SRN</th><th>Role</th><th>Skills</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {members.map((m: any) => (
              <tr key={m.user_id}>
                <td>
                  <span className="font-semibold text-ink">{m.full_name}</span>
                  {m.pesu_verified && (
                    <span className="ml-1.5 inline-block align-middle text-pine-600" title="Verified with PESU Academy">
                      <svg aria-label="Verified with PESU Academy" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.7 5.9-4.2 4.6a.8.8 0 0 1-1.2 0L4.3 8.4a.8.8 0 1 1 1.2-1.1l1.4 1.5 3.6-4a.8.8 0 0 1 1.2 1.1Z" /></svg>
                    </span>
                  )}
                  <p className="text-xs text-slate-500">{m.email}</p>
                </td>
                <td className="tabular">{m.srn}</td>
                <td><Badge>{m.member_role}</Badge></td>
                <td><Chips items={m.skills.slice(0, 6)} highlight={team.required_skills} /></td>
                <td>{formatDate(m.joined_at)}</td>
                <td>
                  {viewer.canManage && m.member_role === 'MEMBER' && isOpen && (
                    <button className="text-xs text-rose-700 hover:underline" onClick={() => confirm(`Remove ${m.full_name}?`) &&
                      act(() => api(`/api/teams/${id}/members/${m.user_id}`, { method: 'DELETE' }), 'Member removed.')}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {viewer.canManage && (
        <Card title={`Pending join requests (${requests.length})`}>
          {requests.length === 0 ? <Empty>No requests waiting. Invite someone from the list below.</Empty> : (
            <table className="data">
              <thead><tr><th>Student</th><th>Skills</th><th>Message</th><th>Semantic fit</th><th></th></tr></thead>
              <tbody>
                {requests.map((r: any) => (
                  <tr key={r.request_id}>
                    <td><span className="font-semibold text-ink">{r.student_name}</span><p className="text-xs text-slate-500">{r.srn}, semester {r.semester}</p></td>
                    <td><Chips items={r.student_skills} highlight={team.required_skills} /></td>
                    <td className="max-w-xs text-xs text-slate-600">{r.message ?? '—'}</td>
                    <td>{r.match_score !== null ? <ScoreBar value={Number(r.match_score)} /> : '—'}</td>
                    <td className="whitespace-nowrap">
                      <Button variant="success" className="mr-2" onClick={() =>
                        act(() => api(`/api/join-requests/${r.request_id}`, { method: 'PATCH', body: { action: 'accept' } }), `${r.student_name} added to the team.`)}>
                        Accept
                      </Button>
                      <Button variant="secondary" onClick={() =>
                        act(() => api(`/api/join-requests/${r.request_id}`, { method: 'PATCH', body: { action: 'reject' } }), 'Request rejected.')}>
                        Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {viewer.canManage && team.status === 'RECRUITING' && <Suggestions teamId={id} required={team.required_skills} />}

      {(viewer.isMember || viewer.role !== 'STUDENT') && <Messages teamId={id} canPost={viewer.isMember} />}

      {history.length > 0 && (
        <Card title="Audit trail (written by database triggers)">
          <table className="data">
            <thead><tr><th>When</th><th>What</th><th>Change</th><th>By</th></tr></thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.log_id}>
                  <td className="whitespace-nowrap">{formatDate(h.created_at, true)}</td>
                  <td>{h.entity === 'teams' ? 'Team' : 'Membership'}: {label(h.action).toLowerCase()}</td>
                  <td>{h.old_value ? `${label(h.old_value)} → ` : ''}{label(h.new_value)}{h.details?.user_id ? ` (user #${h.details.user_id})` : ''}</td>
                  <td>{h.actor_name ?? 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Suggestions({ teamId, required }: { teamId: string; required: string[] }) {
  const { data, error, loading } = useApi(`/api/teams/${teamId}/suggestions`);
  return (
    <Card title="Students who fit this team">
      <p className="-mt-2 mb-4 text-sm text-slate-600">Ranked by how closely their profile matches your listing, plus how many of your required skills they have.</p>
      {loading && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && data.suggestions.length === 0 && <Empty>Everyone who fits is already in a team for this event.</Empty>}
      {data && data.suggestions.length > 0 && (
        <table className="data">
          <thead><tr><th>Student</th><th>Skills</th><th>Bio</th><th>Score</th></tr></thead>
          <tbody>
            {data.suggestions.map((s: any) => (
              <tr key={s.user_id}>
                <td><span className="font-semibold text-ink">{s.full_name}</span><p className="text-xs text-slate-500">{s.email}, semester {s.semester}</p></td>
                <td><Chips items={s.skills.slice(0, 6)} highlight={required} /></td>
                <td className="max-w-sm text-xs text-slate-600">{s.bio}</td>
                <td><ScoreBar value={s.score} label={`cosine ${s.cosine}, skill overlap ${s.overlap}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Messages({ teamId, canPost }: { teamId: string; canPost: boolean }) {
  const { data, error, reload } = useApi(`/api/teams/${teamId}/messages`);
  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSendError(null);
    try {
      await api(`/api/teams/${teamId}/messages`, { body: { body } });
      setBody('');
      await reload();
    } catch (err) {
      setSendError((err as Error).message);
    }
  }

  return (
    <Card title="Team messages">
      {error && <Alert>{error}</Alert>}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {data?.messages.length === 0 && <Empty>No messages yet. Say hello to your team.</Empty>}
        {data?.messages.map((m: any) => (
          <div key={m.message_id} className="anim-pop rounded-md bg-slate-50 px-3 py-2 text-sm">
            <p className="flex justify-between gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{m.sender_name}</span>
              <span>{formatDate(m.sent_at, true)}</span>
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </div>
        ))}
      </div>
      {canPost && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message your team…" maxLength={1000} />
          <Button type="submit" disabled={!body.trim()}>Send</Button>
        </form>
      )}
      {sendError && <div className="mt-2"><Alert>{sendError}</Alert></div>}
    </Card>
  );
}
