// public: renders a button, spends nothing (INV-17)
export const metadata = { title: 'Sign in', robots: { index: false } };

// GET renders a button and spends nothing, so a mail scanner that follows the link cannot
// use it up (INV-17). The button POSTs the token to /login/redeem.
export default async function Redeem({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main>
      <h1>Sign in</h1>
      <form method="post" action="/login/redeem">
        <input type="hidden" name="token" value={token} />
        <button type="submit">Continue</button>
      </form>
    </main>
  );
}
