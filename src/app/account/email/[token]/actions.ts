'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { confirmEmailChange } from '@/core/auth/link';
import { notRef, userAction } from '@/core/authz/action';

export const confirmEmail = userAction(z.object({ token: notRef(z.string()) }), async (s, { token }) => {
  if (!(await confirmEmailChange(s, token))) return { error: 'This link is not valid. It may have expired, been used, or belong to another account.' };
  redirect('/account/security?email=changed');
});
