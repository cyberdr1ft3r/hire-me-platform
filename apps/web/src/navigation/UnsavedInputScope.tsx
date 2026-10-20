import { useRef, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { useRecordLeaveGuard } from './use-record-leave-guard.js';

/**
 * Asks before leaving while a form inside holds genuinely unsaved input (see
 * `useRecordLeaveGuard`). Renders a `display: contents` boundary, so layout, scroll
 * owners and focus order are unchanged.
 */
export function UnsavedInputScope({
  children,
  failureSignal,
  savedSignal,
  writePending,
}: {
  children: ReactNode;
  /** Changes when a write in this area fails. */
  failureSignal?: unknown;
  /** Changes when a write in this area succeeds; edit forms that stay open count as saved. */
  savedSignal?: unknown;
  /** True while a write is in flight; its input is not at risk meanwhile. */
  writePending: boolean;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  useRecordLeaveGuard(containerRef, t('navigation.unsavedInputPrompt'), writePending, {
    failureSignal,
    savedSignal,
  });
  return (
    <div className="unsaved-input-scope" ref={containerRef}>
      {children}
    </div>
  );
}
