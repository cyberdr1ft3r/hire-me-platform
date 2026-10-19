import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Skeleton } from '../ui/index.js';
import type { InternalRoute } from './internal-navigation.js';

export function RouteModuleFallback() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" className="route-module-fallback">
      <Skeleton label={t('navigation.moduleLoading')} />
    </div>
  );
}

type BoundaryProps = {
  children: ReactNode;
  route?: InternalRoute;
};

type BoundaryState = {
  error: Error | null;
  attempt: number;
};

/** Catches dynamic import failures and offers a remount retry without reloading the shell. */
export class RouteChunkErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Route module failed to load', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState((current) => ({ error: null, attempt: current.attempt + 1 }));
  };

  override render(): ReactNode {
    if (this.state.error) {
      return <RouteChunkFailure onRetry={this.retry} />;
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

function RouteChunkFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <InlineMessage announce title={t('navigation.moduleLoadFailedTitle')} tone="danger">
      <p>{t('navigation.moduleLoadFailed')}</p>
      <Button onClick={onRetry} size="compact" variant="secondary">
        {t('navigation.moduleLoadRetry')}
      </Button>
    </InlineMessage>
  );
}

export function RouteModuleBoundary({ children, route }: BoundaryProps) {
  return (
    <RouteChunkErrorBoundary route={route}>
      <Suspense fallback={<RouteModuleFallback />}>{children}</Suspense>
    </RouteChunkErrorBoundary>
  );
}
