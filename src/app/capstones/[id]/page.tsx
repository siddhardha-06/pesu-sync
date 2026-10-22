'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Loading, Meta, PageHeader, ScoreBar, formatDate, label } from '@/components/ui';
import { api, useApi } from '@/lib/api-client';

export default function CapstoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(`/api/capstones/${id}`);
  const faculty = useApi('/api/faculty');
  const [feedback, setFeedback] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [abstract, setAbstract] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function act(body: Record<string, unknown>, success: string) {
    setFlash(null);
    try {
      await api(`/api/capstones/${id}`, { method: 'PATCH', body });
      setFlash({ kind: 'success', text: success });
      setAbstract(null);
      await reload();
    } catch (err) {
      setFlash({ kind: 'error', text: (err as Error).message });
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const { capstone: c, similar, history, viewer } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.title}
        subtitle={<Meta items={[
          c.domain,
          `proposed by ${c.proposer_name} (${c.proposer_srn})`,
          c.team_name && <Link key="t" className="font-medium text-pine-700 hover:underline" href={`/teams/${c.team_id}`}>team {c.team_name}</Link>,
        ]} />}
        action={<Badge>{c.status}</Badge>}
      />
      {flash && <Alert key={flash.text} kind={flash.kind}>{flash.text}</Alert>}

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Abstract" className="md:col-span-2">
          <p className="whitespace-pre-line text-slate-700">{c.abstract}</p>
          {c.tech_stack && <p className="mt-3 text-sm"><span className="text-slate-500">Tech stack:</span> {c.tech_stack}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><p className="text-xs text-slate-500">Submitted</p><p>{formatDate(c.submitted_at)}</p></div>
            <div><p className="text-xs text-slate-500">Reviewed</p><p>{formatDate(c.reviewed_at)}</p></div>
            <div><p className="text-xs text-slate-500">Reviewer</p><p>{c.reviewer_name ?? '—'}</p></div>
            <div><p className="text-xs text-slate-500">Mentor</p><p>{c.mentor_name ?? '—'}</p></div>
          </div>
          {c.feedback && (
            <div className="mt-4"><Alert kind={c.status === 'REJECTED' ? 'error' : 'info'}><b>Faculty feedback:</b> {c.feedback}</Alert></div>
          )}
        </Card>

        <Card title="Similar pitches">
          {similar.length === 0 ? <Empty>No similar pitches. This idea looks new.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {similar.map((s: any) => (
                <li key={s.capstone_id} className="py-3 text-sm first:pt-0">
                  <Link href={`/capstones/${s.capstone_id}`} className="font-semibold text-ink hover:text-pine-700">{s.title}</Link>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs text-slate-500">{s.domain} <Badge>{s.status}</Badge></span>
                    <ScoreBar value={s.similarity} label="cosine similarity" />
                  </div>
                  {s.similarity >= 0.6 && <p className="mt-1 text-xs font-semibold text-brick-700">Possible duplicate idea</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {viewer.canReview && c.status === 'SUBMITTED' && (
        <Card title="Faculty review">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="label">Feedback (required to reject)</label>
              <textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </div>
            <div>
              <label className="label">Assign mentor</label>
              <select className="input" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
                <option value="">Me / keep requested</option>
                {faculty.data?.faculty.map((f: any) => <option key={f.user_id} value={f.user_id}>{f.full_name} ({f.mentoring})</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="success" onClick={() => act({ action: 'approve', feedback, mentorId: mentorId ? Number(mentorId) : null }, 'Pitch approved.')}>Approve</Button>
            <Button variant="danger" onClick={() => act({ action: 'reject', feedback }, 'Pitch rejected with feedback.')}>Reject</Button>
          </div>
        </Card>
      )}

      {viewer.isOwner && c.status === 'REJECTED' && (
        <Card title="Revise and resubmit">
          <textarea className="input" rows={6} value={abstract ?? c.abstract} onChange={(e) => setAbstract(e.target.value)} />
          <Button className="mt-3" onClick={() => act({ action: 'resubmit', abstract: abstract ?? c.abstract }, 'Resubmitted for review.')}>Resubmit</Button>
        </Card>
      )}

      <Card title="Review history (audit trail)">
        <table className="data">
          <thead><tr><th>When</th><th>Action</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {history.map((h: any) => (
              <tr key={h.log_id}>
                <td>{formatDate(h.created_at, true)}</td>
                <td>{label(h.action)}</td>
                <td>{h.old_value ? `${label(h.old_value)} → ` : ''}{label(h.new_value)}</td>
                <td>{h.actor_name ?? 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
