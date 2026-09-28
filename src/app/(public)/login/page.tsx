// public: the sign-in form
export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string }> }) {
  const { sent, expired } = await searchParams;
  return (
    <main>
      <h1>Sign in</h1>
      {sent && <p role="status">Check your email for a link. It expires in 15 minutes.</p>}
      {expired && <p role="alert">That link has expired or was already used. Ask for a new one.</p>}
      <form method="post" action="/login/request">
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <button type="submit">Email me a link</button>
      </form>
    </main>
  );
}
