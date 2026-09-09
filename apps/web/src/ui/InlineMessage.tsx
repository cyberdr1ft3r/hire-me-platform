import type { ReactNode } from 'react';

type MessageTone = 'info' | 'success' | 'warning' | 'danger';

export function InlineMessage({
  children,
  title,
  tone = 'info',
}: {
  children: ReactNode;
  title: string;
  tone?: MessageTone;
}) {
  return (
    <div className={`ui-message ui-message--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
