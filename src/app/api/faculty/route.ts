import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

// Faculty list for choosing a capstone mentor, with their current mentoring load
export const GET = handler(async () => {
  await requireUser();
  const faculty = await query(
    `SELECT u.user_id, u.full_name, u.department, COUNT(c.capstone_id)::INT AS mentoring
       FROM users u
       LEFT JOIN capstone_projects c ON c.mentor_id = u.user_id AND c.status = 'APPROVED'
      WHERE u.role = 'FACULTY' AND u.is_active
      GROUP BY u.user_id
      ORDER BY mentoring, u.full_name`,
  );
  return ok({ faculty });
});
