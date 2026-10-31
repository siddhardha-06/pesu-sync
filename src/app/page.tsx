import Link from 'next/link';
import type { CSSProperties } from 'react';

// Timeline of the hero sequence (ms): candidates appear, seats fill, the team locks.
const CANDIDATES = [
  { initials: 'AS', name: 'Aarav Sharma', skills: ['PostgreSQL', 'Node.js'], score: 92, appear: 600, join: 1250 },
  { initials: 'DM', name: 'Diya Menon', skills: ['Next.js', 'Figma'], score: 86, appear: 1400, join: 2050 },
  { initials: 'NB', name: 'Nikhil Bhat', skills: ['SQL', 'Data analysis'], score: 79, appear: 2200, join: 2850 },
];
const FULL_AT = 3100;
const LOCK_AT = 3900;

const STEPS = [
  { title: 'Post a listing', body: 'Say what you are building and which skills you still need.' },
  { title: 'Get matched', body: 'Profiles are compared with your listing by meaning, not only by keywords.' },
  { title: 'Request to join', body: 'Students send a short note. The leader sees how well each one fits.' },
  { title: 'Verify', body: 'The leader or a faculty member accepts, and a seat fills.' },
  { title: 'Lock the roster', body: 'The final team is recorded, with a history of every step.' },
];

const d = (ms: number, out?: number) => ({ '--d': `${ms}ms`, ...(out ? { '--o': `${out}ms` } : {}) }) as CSSProperties;

function RosterDemo() {
  const seats = ['AR', ...CANDIDATES.map((c) => c.initials)];
  const counts = [1, 2, 3, 4];
  const countTimes = [0, ...CANDIDATES.map((c) => c.join)];

  return (
    <div className="hero-line overflow-hidden rounded-xl border border-slate-200 bg-white" style={d(200)} aria-label="Example: a team filling its seats">
      <div className="flex items-start justify-between gap-4 bg-ink px-5 py-4 text-paper">
        <div>
          <p className="display-soft text-2xl">CampusEats AI</p>
          <p className="mt-0.5 text-sm text-paper/70">PESU Hackathon 2026, AI &amp; ML team</p>
        </div>
        <div className="relative h-6 w-24 shrink-0">
          <span className="roster-swap absolute right-0 rounded-full bg-pine-500 px-2.5 py-0.5 text-xs font-semibold text-white" style={d(0, FULL_AT)}>
            Recruiting
          </span>
          <span className="roster-swap absolute right-0 rounded-full bg-marigold-500 px-2.5 py-0.5 text-xs font-semibold text-ink" style={d(FULL_AT, LOCK_AT)}>
            Full
          </span>
          <span className="roster-show absolute right-0 rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink" style={d(LOCK_AT)}>
            Locked
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
        <div className="flex gap-2">
          {seats.map((s, i) => (
            <span key={s} className="relative grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-marigold-500">
              <span
                className={`absolute -inset-0.5 grid place-items-center rounded-full text-xs font-bold text-white ${i === 0 ? 'bg-ink' : 'roster-seat bg-pine-600'}`}
                style={i === 0 ? undefined : d(CANDIDATES[i - 1].join)}
              >
                {s}
              </span>
            </span>
          ))}
        </div>
        <div className="relative h-5 flex-1 text-sm text-slate-600">
          {counts.map((n, i) => (
            <span key={n} className={`${i === counts.length - 1 ? 'roster-show' : 'roster-swap'} tabular absolute left-0`} style={d(countTimes[i], countTimes[i + 1])}>
              {n} of 4 seats filled
            </span>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-slate-100 px-5">
        {CANDIDATES.map((c) => (
          <li key={c.name} className="roster-row flex items-center gap-3 py-3" style={d(c.appear)}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{c.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{c.name}</span>
              <span className="mt-0.5 flex gap-1">
                {c.skills.map((s) => (
                  <span key={s} className="rounded bg-marigold-200 px-1.5 py-0.5 text-xs text-ink">{s}</span>
                ))}
              </span>
            </span>
            <span className="hidden w-28 items-center gap-2 sm:flex">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span className="roster-bar block h-full rounded-full bg-marigold-500" style={{ ...d(c.appear + 150), width: `${c.score}%` }} />
              </span>
              <span className="tabular text-xs font-semibold text-slate-700">{c.score}%</span>
            </span>
            <span className="relative h-5 w-16 shrink-0 text-right text-xs font-semibold">
              <span className="roster-swap absolute right-0 text-marigold-700" style={d(c.appear, c.join)}>Requested</span>
              <span className="roster-show absolute right-0 text-pine-700" style={d(c.join)}>Joined</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="roster-show border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600" style={d(LOCK_AT + 100)}>
        Roster locked by the team leader. Remaining requests were closed automatically.
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-12 pt-2 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <h1 className="hero-line display text-[clamp(3.2rem,7.4vw,6rem)] text-ink">Your team is already on campus.</h1>
          <p className="hero-line mt-6 max-w-xl text-lg text-slate-600" style={d(120)}>
            Post what you are building, get matched with students whose skills fit, and lock in a roster your faculty
            can see. For hackathons, coursework and capstones at PES University.
          </p>
          <div className="hero-line mt-8 flex flex-wrap gap-3" style={d(220)}>
            <Link
              href="/register"
              className="rounded-md bg-pine-600 px-5 py-3 font-semibold text-white transition hover:bg-pine-700 active:scale-[0.97]"
            >
              Create student account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 bg-white px-5 py-3 font-semibold text-ink transition hover:border-ink active:scale-[0.97]"
            >
              Log in
            </Link>
          </div>
        </div>
        <RosterDemo />
      </section>

      <section>
        <h2 className="display-soft text-3xl text-ink">How a team comes together</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-5 md:gap-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative md:pt-12">
              <span className="absolute left-0 top-4 hidden h-0.5 w-full bg-slate-200 md:block" aria-hidden />
              <span className="relative mb-3 grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-bold text-paper md:absolute md:top-0">
                {i + 1}
              </span>
              <h3 className="font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 border-t border-slate-200 pt-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-slate-200">
        <div className="md:pr-8">
          <h3 className="display-soft text-xl text-ink">Capstone pitches</h3>
          <p className="mt-2 text-sm text-slate-600">
            Search ideas by keyword or by meaning, see near-duplicates before you pitch, and get approval with
            written feedback from faculty.
          </p>
        </div>
        <div className="md:px-8">
          <h3 className="display-soft text-xl text-ink">Campus accounts only</h3>
          <p className="mt-2 text-sm text-slate-600">
            Students sign in with their SRN email, like pes1ug24am186@stu.pes.edu. Faculty and admins use their
            @pes.edu address.
          </p>
        </div>
        <div className="md:pl-8">
          <h3 className="display-soft text-xl text-ink">A record of every step</h3>
          <p className="mt-2 text-sm text-slate-600">
            Every request, acceptance, approval and lock is written to an audit log that nobody can edit.
          </p>
        </div>
      </section>
    </div>
  );
}
