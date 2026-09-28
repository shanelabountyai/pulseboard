'use server';
// Control (FR-08): an id typed z.string(), so the harness cannot scope it.
import { z } from 'zod';
import { orgAction } from '@/core/authz/action';
import { db } from '@/core/db';

export const drop = orgAction('members.manage', z.object({ inviteId: z.string() }), async (_ctx, { inviteId }) => {
  await db.invite.delete({ where: { id: inviteId } });
});
