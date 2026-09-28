import { redirect } from 'next/navigation';
import { requireUser } from '@/core/auth/session';
import { ActionForm } from '@/core/ui/action-form';
import { signOutPending, submitRecoveryCode, submitTotp } from './actions';

export const metadata = { title: 'Two-factor sign-in' };

export default async function Mfa({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requireUser({ allowPendingMfa: true });
  if (!s.totpEnrolled || s.mfaAt) redirect('/onboarding');
  const { error } = await searchParams;
  return (
    <main>
      <h1>Two-factor sign-in</h1>
      {error && <p role="alert">That code did not work. Try the next one from your app.</p>}
      <ActionForm action={submitTotp}>
        <label>
          Code from your authenticator app <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
        </label>
        <button type="submit">Verify</button>
      </ActionForm>
      <details>
        <summary>Lost your device?</summary>
        <ActionForm action={submitRecoveryCode}>
          <label>
            Recovery code <input name="code" autoComplete="off" required />
          </label>
          <button type="submit">Use recovery code</button>
        </ActionForm>
      </details>
      <ActionForm action={signOutPending}>
        <button type="submit">Sign out</button>
      </ActionForm>
    </main>
  );
}
