// Control (FR-06): GET is guarded, POST is not.
import { requireUser } from '@/core/auth/session';

export async function GET() {
  await requireUser();
  return Response.json({ ok: true });
}

export const POST = async (req: Request) => Response.json(await req.json());
