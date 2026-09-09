import type { ReactNode } from 'react';

type MessageTone = 'info' | 'success' | 'warning' | 'danger';

export function InlineMessage({
  announce = false,
  children,
  title,
  tone = 'info',
}: {
  announce?: boolean;
  children: ReactNode;
  title: string;
  tone?: MessageTone;
}) {
  const role = announce ? (tone === 'danger' ? 'alert' : 'status') : undefined;

  return (
    <div
      aria-atomic={announce ? 'true' : undefined}
      className={`ui-message ui-message--${tone}`}
      role={role}
    >
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
