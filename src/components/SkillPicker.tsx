'use client';

import { label } from '@/components/ui';
import { useApi } from '@/lib/api-client';

interface Skill {
  skill_id: number;
  name: string;
  category: string;
}

/**
 * Skill selector grouped by category. `value` maps skill_id -> proficiency (1-5);
 * with `withProficiency={false}` the number is ignored (team required skills).
 */
export default function SkillPicker({
  value,
  onChange,
  withProficiency = true,
}: {
  value: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  withProficiency?: boolean;
}) {
  const { data } = useApi<{ skills: Skill[] }>('/api/skills');
  const groups = (data?.skills ?? []).reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  function toggle(id: number) {
    const next = { ...value };
    if (next[id]) delete next[id];
    else next[id] = 3;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([category, skills]) => (
        <div key={category}>
          <p className="mb-1.5 text-xs font-semibold text-slate-500">{label(category)}</p>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s.skill_id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggle(s.skill_id)}
                  aria-pressed={Boolean(value[s.skill_id])}
                  className={`rounded-full border px-2.5 py-1 text-xs transition duration-150 active:scale-95 ${
                    value[s.skill_id]
                      ? 'border-pine-600 bg-pine-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-ink'
                  }`}
                >
                  {s.name}
                </button>
                {withProficiency && value[s.skill_id] && (
                  <select
                    aria-label={`${s.name} proficiency`}
                    className="anim-pop rounded border border-slate-300 bg-white text-xs"
                    value={value[s.skill_id]}
                    onChange={(e) => onChange({ ...value, [s.skill_id]: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
