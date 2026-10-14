import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
import { MessagesPanel } from './MessagesPanel.js';
import {
  ACTOR_ID,
  apiError,
  createFakeMessaging,
  DIRECT_ID,
  FIXTURE_IDS,
  FOURTH_ID,
  GROUP_ID,
  MESSAGING_ACCESS,
  PEER_ID,
  setDocumentVisibility,
  syntheticMessage,
  THIRD_ID,
  VIEW_ONLY_ACCESS,
  type RecordedCall,
} from './messages-test-data.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
      Toggle locale
    </button>
  );
}

function Workspace({
  accessToken = 'token-a',
  initialConversationId = null,
  locale = 'en',
  onUnreadChanged = () => undefined,
  permissions = MESSAGING_ACCESS,
}: {
  accessToken?: string;
  initialConversationId?: string | null;
  locale?: Locale;
  onUnreadChanged?: () => void;
  permissions?: string[];
}) {
  return (
    <I18nProvider initialLocale={locale}>
      <LocaleToggle />
      <MessagesPanel
        accessToken={accessToken}
        actorUserId={ACTOR_ID}
        initialConversationId={initialConversationId}
        onUnreadChanged={onUnreadChanged}
        permissions={permissions}
      />
    </I18nProvider>
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function callsTo(calls: RecordedCall[], method: string, path: string): RecordedCall[] {
  return calls.filter((call) => call.method === method && call.path === `/v1/messages${path}`);
}

function listRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Conversations' });
}

async function openRow(name: RegExp): Promise<HTMLElement> {
  fireEvent.click(await within(listRegion()).findByRole('button', { name }));
  return screen.findByRole('log', { name: 'Message history' });
}

/** Hidden then visible: every visible-only poll runs once, immediately. */
async function pollNow(): Promise<void> {
  await act(async () => {
    setDocumentVisibility('hidden');
    setDocumentVisibility('visible');
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0));
  setDocumentVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Messages workspace', () => {
  it('opens a membership-scoped conversation from an exact deep link', async () => {
    const fake = createFakeMessaging();
    render(<Workspace initialConversationId={GROUP_ID} />);

    expect(await screen.findByRole('heading', { name: 'Synthetic sourcing circle' })).toBeVisible();
    expect(callsTo(fake.calls, 'GET', `/conversations/${GROUP_ID}`).length).toBeGreaterThan(0);
  });

  it('lists conversations from safe API fields only: no preview, no raw ids, no admin or notification APIs', async () => {
    const fake = createFakeMessaging();
    const { container } = render(<Workspace />);

    const direct = await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });
    expect(direct).toHaveTextContent('2 unread messages');
    const group = within(listRegion()).getByRole('button', { name: /Synthetic sourcing circle/ });
    expect(group).toHaveTextContent('4 members');
    expect(within(listRegion()).getByRole('button', { name: /Lina Fourth/ })).toHaveTextContent(
      'Inactive',
    );
    expect(within(direct).getByText('Nadia Peer')).toHaveAttribute('translate', 'no');

    expect(screen.queryByText(/Private body that must never be previewed/)).toBeNull();
    for (const id of FIXTURE_IDS) {
      expect(container.textContent).not.toContain(id);
    }
    const [list] = callsTo(fake.calls, 'GET', '/conversations');
    expect(list?.search.get('filter')).toBe('all');
    expect(list?.search.has('offset')).toBe(false);
    expect(fake.calls.every((call) => call.authorization === 'Bearer token-a')).toBe(true);
    expect(fake.calls.every((call) => call.path.startsWith('/v1/messages'))).toBe(true);
    expect(fake.calls.some((call) => /admin|notification/i.test(call.path))).toBe(false);
  });

  it('filters All / Unread / Archived and pages with the keyset cursor', async () => {
    const fake = createFakeMessaging();
    fake.setPageSize(1);
    render(<Workspace />);

    const first = await within(listRegion()).findAllByRole('button', { name: /Nadia Peer|circle/ });
    expect(first).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }));
    await waitFor(() => expect(within(listRegion()).getAllByRole('listitem')).toHaveLength(2));
    const paged = callsTo(fake.calls, 'GET', '/conversations').at(-1);
    expect(paged?.search.get('cursor')).toMatch(UUID);
    expect(paged?.search.get('filter')).toBe('all');

    fake.setPageSize(25);
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(callsTo(fake.calls, 'GET', '/conversations').at(-1)?.search.get('filter')).toBe(
        'unread',
      ),
    );
    expect(
      await within(listRegion()).findByRole('button', { name: /Nadia Peer/ }),
    ).toBeInTheDocument();
    expect(within(listRegion()).queryByRole('button', { name: /circle/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    const archived = await within(listRegion()).findByRole('button', {
      name: /Synthetic archived group/,
    });
    expect(archived).toHaveTextContent('Archived');
    expect(within(listRegion()).queryByRole('button', { name: /Nadia Peer/ })).toBeNull();
  });

  it('shows history in a non-announcing log, grouped by day, with tombstones and edited markers', async () => {
    createFakeMessaging();
    render(<Workspace />);

    const log = await openRow(/Nadia Peer/);
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(within(log).getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(within(log).getByText('Message withdrawn')).toBeInTheDocument();
    const body = within(log).getByText('Private body that must never be previewed');
    expect(body).toHaveAttribute('translate', 'no');
    expect(body).toHaveAttribute('lang', '');
    expect(within(log).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(within(listRegion()).getByRole('button', { name: /circle/ }));
    const groupLog = await screen.findByRole('log', { name: 'Message history' });
    await within(groupLog).findByText('Thanks, glad to be here');
    expect(within(groupLog).getByText('Edited')).toBeInTheDocument();
  });

  it('advances the read cursor only while the latest messages are visible in a visible tab', async () => {
    const fake = createFakeMessaging();
    const onUnreadChanged = vi.fn();
    setDocumentVisibility('hidden');
    render(<Workspace onUnreadChanged={onUnreadChanged} />);

    await openRow(/Nadia Peer/);
    await screen.findByText('Private body that must never be previewed');
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/read`)).toHaveLength(0);

    act(() => setDocumentVisibility('visible'));
    await waitFor(() =>
      expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/read`)).toHaveLength(1),
    );
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/read`)[0]?.body).toEqual({
      upToSequence: 3,
    });
    await waitFor(() => expect(onUnreadChanged).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        within(listRegion()).getByRole('button', { name: /Nadia Peer/ }),
      ).not.toHaveTextContent('unread'),
    );
  });

  it('does not mark read once the stacked layout returns to the list', async () => {
    const fake = createFakeMessaging();
    const conversation = fake.conversations.get(GROUP_ID);
    render(<Workspace />);
    await openRow(/circle/);
    await waitFor(() =>
      expect(callsTo(fake.calls, 'POST', `/conversations/${GROUP_ID}/read`)).toHaveLength(0),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(screen.queryByRole('log')).toBeNull();
    conversation?.messages.push(syntheticMessage(GROUP_ID, 3, PEER_ID, 'Arrives while away'));
    await pollNow();
    expect(callsTo(fake.calls, 'POST', `/conversations/${GROUP_ID}/read`)).toHaveLength(0);
  });

  it('loads earlier messages with a before cursor and keeps the newest page', async () => {
    const fake = createFakeMessaging();
    const group = fake.conversations.get(GROUP_ID);
    if (group) {
      group.messages = Array.from({ length: 35 }, (_, index) =>
        syntheticMessage(GROUP_ID, index + 1, PEER_ID, `Synthetic note ${index + 1}`),
      );
      group.lastReadSequence = 35;
    }
    render(<Workspace />);

    const log = await openRow(/circle/);
    await within(log).findByText('Synthetic note 35');
    expect(within(log).queryByText('Synthetic note 5')).toBeNull();
    const first = callsTo(fake.calls, 'GET', `/conversations/${GROUP_ID}/messages`)[0];
    expect(first?.search.get('limit')).toBe('30');
    expect(first?.search.has('before')).toBe(false);

    fireEvent.click(within(log).getByRole('button', { name: 'Load earlier messages' }));
    await within(log).findByText('Synthetic note 1');
    expect(
      callsTo(fake.calls, 'GET', `/conversations/${GROUP_ID}/messages`)
        .at(-1)
        ?.search.get('before'),
    ).toBe('6');
    expect(within(log).queryByRole('button', { name: 'Load earlier messages' })).toBeNull();
  });

  it('sends with Enter, keeps the client message id across a retry, and Shift+Enter adds a line', async () => {
    let failNext = true;
    const fake = createFakeMessaging({
      override: (call) => {
        if (call.method === 'POST' && call.path.endsWith(`${DIRECT_ID}/messages`) && failNext) {
          failNext = false;
          return apiError(503, 'SERVICE_UNAVAILABLE');
        }
        return undefined;
      },
    });
    render(<Workspace />);
    await openRow(/Nadia Peer/);

    const composer = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(composer, { target: { value: 'Line one' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/messages`)).toHaveLength(0);

    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(await screen.findByText('The request could not be completed. Try again.')).toBeVisible();
    fireEvent.keyDown(composer, { key: 'Enter' });
    const log = screen.getByRole('log', { name: 'Message history' });
    await within(log).findByText('Line one');

    const sends = callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/messages`);
    expect(sends).toHaveLength(2);
    expect(sends[0]?.body?.clientMessageId).toMatch(UUID);
    expect(sends[1]?.body?.clientMessageId).toBe(sends[0]?.body?.clientMessageId);
    expect(composer).toHaveValue('');

    fireEvent.change(composer, { target: { value: 'Second message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await within(log).findByText('Second message');
    const third = callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/messages`)[2];
    expect(third?.body?.clientMessageId).not.toBe(sends[0]?.body?.clientMessageId);
  });

  it('keeps Enter as a newline on touch devices', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    );
    const fake = createFakeMessaging();
    render(<Workspace />);
    await openRow(/Nadia Peer/);
    const composer = screen.getByRole('textbox', { name: 'Message' });
    expect(screen.getByText(/Use the Send button to send/)).toBeInTheDocument();
    fireEvent.change(composer, { target: { value: 'Typed on a phone' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/messages`)).toHaveLength(0);
  });

  it('warns past 3500 characters and refuses more than 4000', async () => {
    const fake = createFakeMessaging();
    render(<Workspace />);
    await openRow(/Nadia Peer/);
    const composer = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(composer, { target: { value: 'a'.repeat(3400) } });
    expect(screen.queryByText(/of 4,000 characters/)).toBeNull();
    fireEvent.change(composer, { target: { value: 'a'.repeat(3600) } });
    expect(screen.getByText(/3,600 of 4,000 characters/)).toBeInTheDocument();
    fireEvent.change(composer, { target: { value: 'a'.repeat(4001) } });
    expect(screen.getByText('A message can be at most 4,000 characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/messages`)).toHaveLength(0);
  });

  it('explains read-only conversations: archived group, inactive counterpart, and a 409 on send', async () => {
    createFakeMessaging({
      override: (call) =>
        call.method === 'POST' && call.path.endsWith(`${DIRECT_ID}/messages`)
          ? apiError(409, 'CONVERSATION_RECIPIENT_INACTIVE')
          : undefined,
    });
    render(<Workspace />);

    await openRow(/Lina Fourth/);
    expect(await screen.findByText('This person can no longer receive messages')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    await openRow(/Nadia Peer/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Are you there?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This person can no longer receive messages')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    const log = await openRow(/Synthetic archived group/);
    await within(log).findByText('Archived history stays readable');
    expect(screen.getByText('This group is archived')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(within(log).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('gives a view-only account history and hide, but no create, send, edit, or people search', async () => {
    const fake = createFakeMessaging();
    render(<Workspace permissions={VIEW_ONLY_ACCESS} />);

    expect(await screen.findByText('Read-only access')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();
    const log = await openRow(/Nadia Peer/);
    await within(log).findByText('Private body that must never be previewed');
    expect(screen.getByText('Your account cannot send messages.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(within(log).queryByRole('button', { name: /Edit|Withdraw/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeEnabled();
    expect(fake.calls.some((call) => call.path.endsWith('/user-options'))).toBe(false);
  });

  it('lets the author edit a recent message and withdraw one after confirmation', async () => {
    const fake = createFakeMessaging();
    const confirm = vi.spyOn(window, 'confirm');
    render(<Workspace />);
    const log = await openRow(/Nadia Peer/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Draft to fix' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const sent = (await within(log).findByText('Draft to fix')).closest('li');
    if (!sent) throw new Error('Sent message row missing');
    const older = within(log).getByText('Hello Nadia, are you free later?').closest('li');
    if (!older) throw new Error('Older message row missing');
    expect(within(older).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(older).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    const theirs = within(log).getByText('Private body that must never be previewed').closest('li');
    if (!theirs) throw new Error('Peer message row missing');
    expect(within(theirs).queryByRole('button')).toBeNull();

    fireEvent.click(within(sent).getByRole('button', { name: 'Edit' }));
    const editor = within(sent).getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(editor, { target: { value: 'Draft fixed' } });
    fireEvent.click(within(sent).getByRole('button', { name: 'Save' }));
    await within(log).findByText('Draft fixed');
    expect(within(sent).getByText('Edited')).toBeInTheDocument();
    const patch = fake.calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ body: 'Draft fixed' });

    confirm.mockReturnValueOnce(false);
    fireEvent.click(within(sent).getByRole('button', { name: 'Withdraw' }));
    expect(fake.calls.some((call) => call.path.endsWith('/withdraw'))).toBe(false);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(within(sent).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(within(log).queryByText('Draft fixed')).toBeNull());
    expect(within(sent).getByText('Message withdrawn')).toBeInTheDocument();
    expect(within(sent).queryByText('Edited')).toBeNull();
  });

  it('opens a direct conversation through the bounded people picker and find-or-create', async () => {
    const fake = createFakeMessaging();
    render(<Workspace />);
    await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });

    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    const picker = screen.getByRole('combobox', { name: /Colleague/ });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'N' } });
    await new Promise((done) => setTimeout(done, 400));
    expect(fake.calls.some((call) => call.path.endsWith('/user-options'))).toBe(false);

    fireEvent.change(picker, { target: { value: 'Na' } });
    fireEvent.click(await screen.findByRole('option', { name: /Nadia Peer/ }));
    const search = fake.calls.find((call) => call.path.endsWith('/user-options'));
    expect(search?.search.get('purpose')).toBe('direct');
    expect(search?.search.get('search')).toBe('Na');
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));

    await screen.findByRole('log', { name: 'Message history' });
    expect(callsTo(fake.calls, 'POST', '/conversations/direct')[0]?.body).toEqual({
      userId: PEER_ID,
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Nadia Peer' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(listRegion()).getAllByRole('button', { name: /Nadia Peer/ })).toHaveLength(1),
    );
    expect(fake.calls.some((call) => /admin/.test(call.path))).toBe(false);
  });

  it('creates a group with a title and at least two colleagues, explaining later-member history', async () => {
    const fake = createFakeMessaging();
    render(<Workspace />);
    await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });
    fireEvent.click(screen.getByRole('button', { name: 'New group' }));

    expect(
      screen.getByText(
        'People added after the group is created only see messages sent after they join.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('Enter a group name.')).toBeVisible();
    expect(screen.getByText('Add at least 2 colleagues.')).toBeVisible();
    expect(callsTo(fake.calls, 'POST', '/conversations/groups')).toHaveLength(0);

    fireEvent.change(screen.getByRole('textbox', { name: /Group name/ }), {
      target: { value: 'Synthetic launch crew' },
    });
    const picker = screen.getByRole('combobox', { name: /Colleague to add/ });
    for (const [term, name] of [
      ['Om', /Omar Third/],
      ['Li', /Lina Fourth/],
    ] as const) {
      fireEvent.focus(picker);
      fireEvent.change(picker, { target: { value: term } });
      fireEvent.click(await screen.findByRole('option', { name }));
    }
    expect(screen.getByText('2 colleagues selected')).toBeVisible();
    expect(
      fake.calls
        .filter((call) => call.path.endsWith('/user-options'))
        .every((call) => call.search.get('purpose') === 'group-create'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await screen.findByRole('log', { name: 'Message history' });
    expect(callsTo(fake.calls, 'POST', '/conversations/groups')[0]?.body).toEqual({
      memberUserIds: [THIRD_ID, FOURTH_ID],
      title: 'Synthetic launch crew',
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic launch crew' })).toBeVisible();
  });

  it('lets an owner manage members but never remove or demote another owner, and surfaces GROUP_LAST_OWNER', async () => {
    const fake = createFakeMessaging({
      override: (call) =>
        call.path.endsWith(`/groups/${GROUP_ID}/leave`)
          ? apiError(409, 'GROUP_LAST_OWNER')
          : undefined,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Workspace />);
    await openRow(/circle/);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));

    const members = await screen.findByRole('region', { name: 'Members' });
    const owner = within(members).getByText('Karim Owner').closest('li');
    const peer = within(members).getByText('Nadia Peer').closest('li');
    const me = within(members).getByText('Synthetic Actor').closest('li');
    if (!owner || !peer || !me) throw new Error('Member rows missing');
    expect(within(owner).getByText('Owner')).toBeInTheDocument();
    expect(within(owner).queryByRole('button')).toBeNull();
    expect(within(me).getByText('You')).toBeInTheDocument();
    expect(within(me).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /demote/i })).toBeNull();

    fireEvent.click(within(peer).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Member removed.')).toBeVisible();
    expect(within(members).queryByText('Nadia Peer')).toBeNull();
    expect(
      callsTo(fake.calls, 'POST', `/groups/${GROUP_ID}/members/${PEER_ID}/remove`),
    ).toHaveLength(1);

    const third = within(members).getByText('Omar Third').closest('li');
    if (!third) throw new Error('Member row missing');
    fireEvent.click(within(third).getByRole('button', { name: 'Make owner' }));
    expect(await screen.findByText('The member is now an owner.')).toBeVisible();
    expect(within(third).getByText('Owner')).toBeInTheDocument();
    expect(within(third).queryByRole('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(
      await screen.findByText('Make another member an owner before leaving this group.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Synthetic sourcing circle' }),
    ).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: /Group name/ }), {
      target: { value: 'Renamed synthetic circle' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText('Group renamed.')).toBeVisible();
    await waitFor(() =>
      expect(
        within(listRegion()).getByRole('button', { name: /Renamed synthetic circle/ }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive group' }));
    expect(await screen.findByText('Group archived.')).toBeVisible();
    expect(screen.getByText('This group is archived and read-only.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Group name/ })).toBeNull();
  });

  it('gives a plain member only Leave, and leaving closes the group after the API confirms', async () => {
    const fake = createFakeMessaging();
    const group = fake.conversations.get(GROUP_ID);
    const mine = group?.members.find((entry) => entry.user.id === ACTOR_ID);
    if (mine) mine.role = 'MEMBER';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Workspace />);
    await openRow(/circle/);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));

    const members = await screen.findByRole('region', { name: 'Members' });
    expect(within(members).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive group' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(await screen.findByText('You left the group.')).toBeVisible();
    expect(within(listRegion()).queryByRole('button', { name: /circle/ })).toBeNull();
  });

  it('hides a PRIVATE conversation only after the API confirms, and a new message brings it back', async () => {
    let failHide = true;
    const fake = createFakeMessaging({
      override: (call) => {
        if (call.path.endsWith('/hide') && failHide) {
          failHide = false;
          return apiError(500, 'INTERNAL');
        }
        return undefined;
      },
    });
    const onUnreadChanged = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Workspace onUnreadChanged={onUnreadChanged} />);

    await openRow(/circle/);
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();

    await openRow(/Nadia Peer/);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(await screen.findByText('The request could not be completed. Try again.')).toBeVisible();
    expect(within(listRegion()).getByRole('button', { name: /Nadia Peer/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(
      await screen.findByText('Conversation hidden. It comes back when a new message arrives.'),
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledWith(
      'Hide this conversation? It comes back when a new message arrives.',
    );
    expect(within(listRegion()).queryByRole('button', { name: /Nadia Peer/ })).toBeNull();
    expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/hide`)).toHaveLength(2);
    expect(onUnreadChanged).toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);

    await pollNow();
    expect(within(listRegion()).queryByRole('button', { name: /Nadia Peer/ })).toBeNull();

    fake.incoming(DIRECT_ID, PEER_ID, 'Back again');
    await pollNow();
    expect(
      await within(listRegion()).findByRole('button', { name: /Nadia Peer/ }),
    ).toBeInTheDocument();
  });

  it('announces only newly polled messages from others, never the initial history', async () => {
    const fake = createFakeMessaging();
    render(<Workspace />);
    const log = await openRow(/Nadia Peer/);
    const pane = log.closest('section');
    if (!pane) throw new Error('Conversation pane missing');
    const status = within(pane).getByRole('status');
    expect(status).toHaveTextContent('');

    fake.incoming(DIRECT_ID, PEER_ID, 'Fresh synthetic news');
    await pollNow();
    await within(log).findByText('Fresh synthetic news');
    expect(status).toHaveTextContent('1 new message');
  });

  it('drops late responses from a previous conversation or a previous token', async () => {
    const slowDirect = deferred<Response>();
    const slowList = deferred<Response>();
    let delayDirect = true;
    const fake = createFakeMessaging({
      override: (call) => {
        if (call.path.endsWith(`${DIRECT_ID}/messages`) && call.method === 'GET' && delayDirect) {
          delayDirect = false;
          return slowDirect.promise;
        }
        if (call.authorization === 'Bearer token-a' && call.path === '/v1/messages/conversations') {
          return slowList.promise;
        }
        return undefined;
      },
    });
    const { rerender } = render(<Workspace />);
    rerender(<Workspace accessToken="token-b" />);
    await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });
    await act(async () => {
      slowList.resolve(
        new Response(
          JSON.stringify({
            conversations: [
              {
                activeMemberCount: 3,
                counterpart: null,
                createdAt: '2026-10-13T08:00:00.000Z',
                id: GROUP_ID,
                lastMessageAt: null,
                lastMessageSequence: 0,
                lastReadSequence: 0,
                myRole: 'MEMBER',
                status: 'ACTIVE',
                title: 'Stale token row',
                type: 'GROUP',
                unreadCount: 0,
              },
            ],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale token row')).toBeNull();

    fireEvent.click(within(listRegion()).getByRole('button', { name: /Nadia Peer/ }));
    fireEvent.click(within(listRegion()).getByRole('button', { name: /circle/ }));
    await screen.findByText('Welcome to the synthetic group');
    await act(async () => {
      slowDirect.resolve(
        new Response(
          JSON.stringify({
            hasMore: false,
            messages: [syntheticMessage(DIRECT_ID, 9, PEER_ID, 'Late direct body')],
          }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });
    expect(screen.queryByText('Late direct body')).toBeNull();
    expect(
      fake.calls.filter((call) => call.authorization === 'Bearer token-b').length,
    ).toBeGreaterThan(0);
  });

  it('shows generic not-found copy for a missing or no-longer-accessible conversation', async () => {
    createFakeMessaging({
      override: (call) =>
        call.path === `/v1/messages/conversations/${DIRECT_ID}`
          ? apiError(404, 'CONVERSATION_NOT_FOUND')
          : undefined,
    });
    render(<Workspace />);
    fireEvent.click(await within(listRegion()).findByRole('button', { name: /Nadia Peer/ }));
    expect(
      await screen.findByText('This conversation was not found or is no longer available to you.'),
    ).toBeVisible();
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.queryByText(/Private body/)).toBeNull();
  });

  it('renders French copy, and a locale switch only re-renders text without refetching', async () => {
    const fake = createFakeMessaging();
    render(<Workspace locale="fr" />);

    const list = await screen.findByRole('region', { name: 'Conversations' });
    expect(screen.getByRole('button', { name: 'Nouveau message' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Non lues' })).toBeVisible();
    expect(within(list).getByRole('button', { name: /circle/ })).toHaveTextContent('4 membres');
    fireEvent.click(within(list).getByRole('button', { name: /Nadia Peer/ }));
    const log = await screen.findByRole('log', { name: 'Historique des messages' });
    expect(within(log).getByText('Message retiré')).toBeInTheDocument();
    expect(within(log).getByRole('heading', { name: 'Aujourd’hui' })).toBeInTheDocument();
    await waitFor(() =>
      expect(callsTo(fake.calls, 'POST', `/conversations/${DIRECT_ID}/read`)).toHaveLength(1),
    );

    const before = fake.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));
    expect(await screen.findByRole('log', { name: 'Message history' })).toBeInTheDocument();
    expect(screen.getByText('Private body that must never be previewed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New message' })).toBeVisible();
    expect(fake.calls.length).toBe(before);
  });

  it('anchors the composer after the scrolling log inside the thread pane', async () => {
    createFakeMessaging();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    render(<Workspace />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Messages' }).closest('header'),
    ).toHaveClass('ui-page-header--compact');
    fireEvent.click(await within(listRegion()).findByRole('button', { name: /Nadia Peer/ }));
    const log = await screen.findByRole('log', { name: 'Message history' });
    const thread = log.parentElement as HTMLElement;
    const children = Array.from(thread.children).filter(
      (child) => !child.classList.contains('sr-only'),
    );
    expect(children.indexOf(log)).toBeGreaterThan(0);
    expect(children.at(-1)).toContainElement(screen.getByRole('textbox', { name: 'Message' }));
    expect(thread.closest('[data-pane="detail"]')).not.toBeNull();
    // Side by side, the page keeps its description.
    expect(screen.getByText(/Private conversations/)).toBeVisible();
  });

  it('gives a stacked thread the page description space and restores it on the inbox', async () => {
    createFakeMessaging();
    render(<Workspace />);
    expect(screen.getByText(/Private conversations/)).toBeVisible();
    fireEvent.click(await within(listRegion()).findByRole('button', { name: /Nadia Peer/ }));
    await screen.findByRole('log', { name: 'Message history' });
    expect(screen.queryByText(/Private conversations/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(screen.getByText(/Private conversations/)).toBeVisible();
  });

  it('shows one pane at a time when narrow and both side by side when wide', async () => {
    createFakeMessaging();
    const { container, unmount } = render(<Workspace />);
    const layout = container.querySelector('.ui-workspace__layout');
    expect(layout).toHaveAttribute('data-view', 'list');

    const row = await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });
    fireEvent.click(row);
    await screen.findByRole('log', { name: 'Message history' });
    expect(layout).toHaveAttribute('data-view', 'detail');
    expect(screen.getByRole('heading', { level: 2, name: 'Nadia Peer' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(layout).toHaveAttribute('data-view', 'list');
    await waitFor(() =>
      expect(within(listRegion()).getByRole('button', { name: /Nadia Peer/ })).toHaveFocus(),
    );
    unmount();

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    render(<Workspace />);
    const wideRow = await within(listRegion()).findByRole('button', { name: /circle/ });
    wideRow.focus();
    fireEvent.click(wideRow);
    await screen.findByRole('log', { name: 'Message history' });
    expect(wideRow).toHaveFocus();
    expect(wideRow).toHaveAttribute('aria-current', 'true');
  });

  it('removes a read conversation from the Unread filter', async () => {
    createFakeMessaging();
    render(<Workspace />);
    await openRow(/Nadia Peer/);
    await screen.findByText('Private body that must never be previewed');
    act(() => setDocumentVisibility('visible'));
    await waitFor(() =>
      expect(
        within(listRegion()).getByRole('button', { name: /Nadia Peer/ }),
      ).not.toHaveTextContent('unread'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(within(listRegion()).queryByRole('button', { name: /Nadia Peer/ })).toBeNull();
  });

  it('removes an archived group from All and lists it only under Archived', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    createFakeMessaging();
    render(<Workspace />);
    await openRow(/circle/);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive group' }));
    expect(await screen.findByText('Group archived.')).toBeVisible();
    await waitFor(() =>
      expect(within(listRegion()).queryByRole('button', { name: /circle/ })).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(
      await within(listRegion()).findByRole('button', { name: /Synthetic sourcing circle/ }),
    ).toHaveTextContent('Archived');
  });

  it('keeps hide and leave rows removed after a polled list refresh', async () => {
    const fake = createFakeMessaging();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Workspace />);

    await openRow(/Nadia Peer/);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(
      await screen.findByText('Conversation hidden. It comes back when a new message arrives.'),
    ).toBeVisible();
    await pollNow();
    expect(within(listRegion()).queryByRole('button', { name: /Nadia Peer/ })).toBeNull();

    const group = fake.conversations.get(GROUP_ID);
    const mine = group?.members.find((entry) => entry.user.id === ACTOR_ID);
    if (mine) mine.role = 'MEMBER';
    await openRow(/circle/);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(await screen.findByText('You left the group.')).toBeVisible();
    await pollNow();
    expect(within(listRegion()).queryByRole('button', { name: /circle/ })).toBeNull();
  });

  it('deduplicates keyset-loaded rows after a polled first-page refresh', async () => {
    const fake = createFakeMessaging();
    fake.setPageSize(1);
    render(<Workspace />);
    await within(listRegion()).findByRole('button', { name: /Nadia Peer|circle/ });
    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }));
    await waitFor(() => expect(within(listRegion()).getAllByRole('listitem')).toHaveLength(2));

    await pollNow();
    const ids = within(listRegion())
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(ids).toHaveLength(new Set(ids).size);
    expect(within(listRegion()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows empty and error states with a retry', async () => {
    let failList = true;
    const fake = createFakeMessaging({
      override: (call) => {
        if (call.path === '/v1/messages/conversations' && failList) {
          failList = false;
          return apiError(429, 'MESSAGING_RATE_LIMITED');
        }
        return undefined;
      },
    });
    render(<Workspace />);
    expect(await screen.findByText('Conversations could not be loaded.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await within(listRegion()).findByRole('button', { name: /Nadia Peer/ });
    expect(screen.getByText('No conversation selected')).toBeVisible();

    fake.conversations.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('No unread conversations')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(await screen.findByText('No archived groups')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('No conversations yet')).toBeVisible();
  });
});
