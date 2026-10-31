import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

/** GET /api/reports — the report views from db/schema/07_reports.sql (faculty + admin). */
export const GET = handler(async () => {
  await requireUser('FACULTY', 'ADMIN');
  const [departments, events, capstoneDomains, topSkills, matchQuality, students] = await Promise.all([
    query('SELECT * FROM v_report_department'),
    query('SELECT * FROM v_report_event_teams ORDER BY participation_rank, title'),
    query('SELECT * FROM v_report_capstone_domains'),
    query('SELECT * FROM v_report_top_skills'),
    query('SELECT * FROM v_report_match_quality'),
    query(`SELECT user_id, full_name, srn FROM users WHERE role = 'STUDENT' AND is_active ORDER BY full_name`),
  ]);
  return ok({ departments, events, capstoneDomains, topSkills, matchQuality, students });
});
