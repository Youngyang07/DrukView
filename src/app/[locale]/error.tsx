'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap page">
      <div className="banner warn">
        <b>Something went wrong loading this page</b>
        If you run this site, check that <code>DATABASE_URL</code> is set and the database has been set up (see the README), then look at the server logs
        {error.digest ? <> for error digest <code>{error.digest}</code></> : null}. Otherwise, please try again in a moment.
      </div>
      <button type="button" onClick={reset}>Try again</button>
    </div>
  );
}
