import { requireUser } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { ApiError, handler, idParam, ok, oneOf, readJson } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

/**
 * PATCH /api/admin/users/:id  { isActive?, role?, unlock? }
 * Users are never deleted (their audit history must survive) — they are deactivated.
 */
export const PATCH = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const admin = await requireUser('ADMIN');
  const id = idParam((await params).id);
  if (id === admin.id) throw new ApiError(400, 'You cannot change your own account here');
  const body = await readJson(req);

  const isActive = typeof body.isActive === 'boolean' ? body.isActive : null;
  const role = body.role ? oneOf(body.role, 'role', ['STUDENT', 'FACULTY', 'ADMIN'] as const) : null;
  const unlock = body.unlock === true;

  const user = await queryOne(
    `UPDATE users
        SET is_active     = COALESCE($2, is_active),
            role          = COALESCE($3, role),
            failed_logins = CASE WHEN $4 THEN 0 ELSE failed_logins END
      WHERE user_id = $1
      RETURNING user_id, full_name, role, is_active, failed_logins`,
    [id, isActive, role, unlock],
  );
  if (!user) throw new ApiError(404, 'User not found');

  // keep the vector index consistent: inactive/non-student profiles are removed from matching
  await syncVectorsSafe('profiles', [id]);
  return ok({ user });
});
