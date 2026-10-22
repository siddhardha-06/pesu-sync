import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, int, ok } from '@/lib/http';

/**
 * GET /api/reports/network?userId=&depth= — a student's collaboration network
 * (RECURSIVE CTE in fn_collaboration_network). Students may only ask about themselves.
 */
export const GET = handler(async (req) => {
  const me = await requireUser();
  const p = new URL(req.url).searchParams;
  const userId = me.role === 'STUDENT' ? me.id : int(p.get('userId') ?? me.id, 'userId', { min: 1 });
  const depth = int(p.get('depth') ?? 3, 'depth', { min: 1, max: 5 });
  const network = await query('SELECT * FROM fn_collaboration_network($1, $2) ORDER BY depth, full_name', [userId, depth]);
  return ok({ userId, depth, network });
});
