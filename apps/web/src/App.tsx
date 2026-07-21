import { useEffect, useState } from 'react';

import { fetchHealthStatus } from './api.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    fetchHealthStatus()
      .then((health) => {
        if (isMounted) {
          setApiState({
            status: 'ready',
            message: `${health.service} is ${health.status}`,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setApiState({
            status: 'error',
            message: 'API health status is unavailable',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Hire Me Platform</p>
        <h1 id="page-title">Recruitment operations workspace</h1>
        <p>The monorepo foundation is ready for product modules after the next approved tasks.</p>
      </section>

      <section className="status-panel" aria-live="polite" aria-label="API status">
        <span className={`status-dot status-dot--${apiState.status}`} />
        <div>
          <h2>API health</h2>
          <p>
            {apiState.status === 'loading' ? 'Checking API health status...' : apiState.message}
          </p>
        </div>
      </section>
    </main>
  );
}
