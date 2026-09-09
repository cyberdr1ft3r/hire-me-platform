import { useState } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import type { InternalRoute } from '../navigation/internal-navigation.js';
import { Button, PageHeader } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';

const syntheticUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000052',
  displayName: 'Amina Example',
  email: 'amina@example.test',
  permissions: [
    'users:view',
    'clients:view',
    'candidates:view',
    'missions:view',
    'tasks:view',
    'documents:view',
    'training_programs:view',
    'reporting:recruitment:view',
    'quotations:view',
    'payments:view',
  ],
};

export function AppShellPreview() {
  const [route, setRoute] = useState<InternalRoute>('home');

  return (
    <AppShell
      apiState={{ status: 'ready', message: 'hire-me-api is ok' }}
      currentRoute={route}
      onLogout={() => undefined}
      onNavigate={setRoute}
      onRefreshUser={() => undefined}
      user={syntheticUser}
    >
      <PageHeader
        description="A synthetic workspace specimen for reviewing hierarchy, navigation density, and responsive behavior."
        eyebrow="Internal workspace"
        metadata={<span>Preview route: {route}</span>}
        primaryAction={<Button>Create item</Button>}
        secondaryActions={<Button variant="secondary">Secondary action</Button>}
        title="AppShell review"
      />
      <section aria-labelledby="preview-workspace-title" className="app-shell-preview__workspace">
        <div>
          <p className="app-shell-preview__kicker">Neutral content region</p>
          <h2 id="preview-workspace-title">Operational content belongs directly in the page</h2>
          <p>
            This placeholder demonstrates spacing and hierarchy without reproducing a future module
            design or using real business data.
          </p>
        </div>
        <div aria-label="Synthetic data placeholder" className="app-shell-preview__data">
          <div>
            <strong>Reference</strong>
            <span>Status</span>
            <span>Owner</span>
          </div>
          <div>
            <strong>HM-SYNTHETIC</strong>
            <span>Example state</span>
            <span>Example team</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
