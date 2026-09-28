'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { notRef, userAction } from '@/core/authz/action';
import { acceptInvite } from '@/core/tenancy/invites';
import { createOrg } from '@/core/tenancy/orgs';

export const startOrg = userAction(z.object({ name: z.string().trim().min(1, 'Give the org a name.').max(80) }), async (s, { name }) =>
  redirect(`/o/${await createOrg(s, name)}`),
);

export const joinOrg = userAction(z.object({ token: notRef(z.string()) }), async (s, { token }) => redirect(`/o/${await acceptInvite(s, token)}`));
