import { requireUser } from '@/lib/auth';
import { handler, ok } from '@/lib/http';

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ user });
});
