import { requireUser } from '@/lib/auth';
import { getCampusEvents } from '@/lib/campus-events';
import { handler, ok } from '@/lib/http';

/** GET /api/campus-events — events listed on pes.edu (cached, refreshed every 30 minutes). */
export const GET = handler(async () => {
  await requireUser();
  return ok(await getCampusEvents());
});

/** POST /api/campus-events — faculty/admin force a refresh from pes.edu now. */
export const POST = handler(async () => {
  await requireUser('FACULTY', 'ADMIN');
  return ok(await getCampusEvents({ forceRefresh: true }));
});
