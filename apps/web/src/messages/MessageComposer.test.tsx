import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MessageComposer } from './MessageComposer.js';

afterEach(() => vi.restoreAllMocks());

describe('Message composer sizing', () => {
  it('grows for a longer draft and shrinks when the draft is cleared', () => {
    let contentHeight = 64;
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(
      () => contentHeight,
    );
    const view = (draft: string) => (
      <I18nProvider>
        <MessageComposer
          draft={draft}
          error={null}
          onChange={vi.fn()}
          onSend={vi.fn()}
          sending={false}
        />
      </I18nProvider>
    );
    const { rerender } = render(view('Short draft'));
    const input = screen.getByRole('textbox');
    expect(input.style.height).toBe('64px');
    contentHeight = 160;
    rerender(view('Longer draft\nWith another line'));
    expect(input.style.height).toBe('160px');
    contentHeight = 64;
    rerender(view(''));
    expect(input.style.height).toBe('64px');
  });
});
