import type { AuthenticatedUser } from '@hire-me/contracts';

import { PageHeader } from '../PageHeader.js';

export function InternalHome({ user }: { user: AuthenticatedUser }) {
  return (
    <div className="app-home">
      <PageHeader
        description="Move between recruitment, operations, and business work from one consistent workspace."
        eyebrow="Workspace"
        metadata={<span>Signed in as {user.email}</span>}
        title="Overview"
      />
      <section aria-labelledby="app-home-start" className="app-home__intro">
        <h2 id="app-home-start">Your HireMe workspace</h2>
        <p>
          Choose an available destination from the navigation. What appears there reflects the
          permissions attached to this account.
        </p>
      </section>
    </div>
  );
}
