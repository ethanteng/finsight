'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ margin: '4rem auto', maxWidth: '36rem', padding: '0 1rem' }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page and try again.</p>
        </main>
      </body>
    </html>
  );
}
