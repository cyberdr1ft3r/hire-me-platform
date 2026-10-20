import { describe, expect, it } from 'vitest';
import { canAccessInternalRoute } from '../navigation/internal-navigation.js';
import {
  type ConsoleTab,
  consoleReducer,
  consoleUrlIntent,
  encodeConsoleHistoryState,
  initialConsoleState,
  recordTab,
  resolveConsoleHistoryTab,
  SOFT_TAB_LIMIT,
  HARD_TAB_LIMIT,
  type TabId,
} from './console-state.js';

const ID = '4aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = '5aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const open = (route: 'clients' | 'candidates' | 'missions' | 'tasks') => ({
  type: 'openWorkspace' as const,
  route,
});
function stateWithClientRecord() {
  let state = consoleReducer(initialConsoleState(), open('clients'));
  state = consoleReducer(state, {
    type: 'openRecord',
    kind: 'client',
    recordId: ID,
    from: 'clients',
  });
  return state;
}

describe('Console Workspace B1 pure state', () => {
  it('keeps Overview permanent, opens/focuses primary tabs and deduplicates', () => {
    let state = initialConsoleState();
    state = consoleReducer(state, open('clients'));
    state = consoleReducer(state, open('clients'));
    expect(state.tabs.map((tab) => tab.id)).toEqual(['ws:home', 'ws:clients']);
    expect(state.active).toBe('ws:clients');
    expect(consoleReducer(state, { type: 'close', id: 'ws:home' })).toBe(state);
  });
  it('deduplicates records across modules, keeps a flat parent, and closes children', () => {
    let state = consoleReducer(initialConsoleState(), {
      type: 'openRecord',
      kind: 'mission',
      recordId: ID,
      from: 'clients',
    });
    state = consoleReducer(state, {
      type: 'openRecord',
      kind: 'mission',
      recordId: ID.toUpperCase(),
      from: 'missions',
    });
    expect(state.tabs.filter((tab) => tab.kind === 'record')).toHaveLength(1);
    expect(state.tabs.find((tab) => tab.kind === 'record')).toMatchObject({ parent: 'ws:clients' });
    state = consoleReducer(state, { type: 'close', id: 'ws:clients' });
    expect(state.tabs).toEqual([{ id: 'ws:home', kind: 'workspace', route: 'home' }]);
  });
  it('does not admit malformed record IDs and excludes utilities', () => {
    expect(recordTab('client', 'invalid', 'clients')).toBeNull();
    const state = consoleReducer(initialConsoleState(), { type: 'openWorkspace', route: 'agenda' });
    expect(state.tabs).toHaveLength(1);
    const messages = consoleReducer(initialConsoleState(), {
      type: 'openWorkspace',
      route: 'messages',
    });
    expect(messages.tabs.map((tab) => tab.id)).toEqual(['ws:home', 'ws:messages']);
  });
  it('prunes denied tabs and retains allowed context', () => {
    let state = consoleReducer(initialConsoleState(), open('clients'));
    state = consoleReducer(state, open('tasks'));
    state = consoleReducer(state, { type: 'activate', id: 'ws:clients' });
    state = consoleReducer(state, { type: 'prune', permissions: ['clients:view'] });
    expect(state.tabs.map((tab) => tab.id)).toEqual(['ws:home', 'ws:clients']);
    expect(state.active).toBe('ws:clients');
    expect(consoleReducer(state, { type: 'reset' })).toEqual(initialConsoleState());
  });
  it('keeps a revoked active tab available for the permission-denied close state', () => {
    let state = consoleReducer(initialConsoleState(), open('clients'));
    state = consoleReducer(state, open('tasks'));
    state = consoleReducer(state, { type: 'prune', permissions: ['clients:view'] });
    expect(state.tabs.map((tab) => tab.id)).toEqual(['ws:home', 'ws:clients', 'ws:tasks']);
    expect(state.active).toBe('ws:tasks');
    state = consoleReducer(state, { type: 'close', id: 'ws:tasks' });
    expect(state.active).toBe('ws:clients');
  });
  it('has a hard cap and never replaces Overview or dirty tabs', () => {
    let state = initialConsoleState();
    for (const route of ['clients', 'candidates', 'missions', 'tasks'] as const)
      state = consoleReducer(state, open(route));
    for (let i = 0; i < 7; i++) {
      const id = `${(i + 10).toString().padStart(8, '0')}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
      state = consoleReducer(state, {
        type: 'openRecord',
        kind: 'candidate',
        recordId: id,
        from: 'clients',
      });
    }
    expect(SOFT_TAB_LIMIT).toBe(8);
    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
    const before = state;
    state = consoleReducer(state, {
      type: 'replaceLru',
      tab: recordTab('mission', OTHER, 'missions')!,
      dirty: state.tabs.filter((x) => x.id !== 'ws:home').map((x) => x.id),
    });
    expect(state).toBe(before);
  });
  it('replaces the least-recent clean tab without removing the active record group', () => {
    let state = initialConsoleState();
    for (const route of ['clients', 'candidates', 'missions', 'tasks'] as const) {
      state = consoleReducer(state, open(route));
    }
    const records: TabId[] = [];
    for (let i = 10; i < 15; i += 1) {
      const id = `${i.toString().padStart(8, '0')}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
      records.push(`rec:candidate:${id}`);
      state = consoleReducer(state, {
        type: 'openRecord',
        kind: 'candidate',
        recordId: id,
        from: 'clients',
      });
    }
    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
    const activeRecord = state.active;

    state = consoleReducer(state, {
      type: 'replaceLru',
      tab: { id: 'ws:documents', kind: 'workspace', route: 'documents' },
      dirty: [],
    });

    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
    expect(state.tabs.map((tab) => tab.id)).toContain('ws:documents');
    expect(state.tabs.map((tab) => tab.id)).not.toContain('ws:candidates');
    expect(state.tabs.map((tab) => tab.id)).toContain(activeRecord);
    expect(records.every((id) => state.tabs.some((tab) => tab.id === id))).toBe(true);
    expect(state.active).toBe('ws:documents');
  });
  it('does not evict any sibling when the active workspace record group fills the limit', () => {
    let state = consoleReducer(initialConsoleState(), open('clients'));
    const records: TabId[] = [];
    for (let i = 10; i < 18; i += 1) {
      const id = `${i.toString().padStart(8, '0')}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
      records.push(`rec:candidate:${id}`);
      state = consoleReducer(state, {
        type: 'openRecord',
        kind: 'candidate',
        recordId: id,
        from: 'clients',
      });
    }
    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
    expect(state.active).toBe(records.at(-1));
    const fullState = state;

    state = consoleReducer(state, {
      type: 'replaceLru',
      tab: { id: 'ws:documents', kind: 'workspace', route: 'documents' },
      dirty: [],
    });

    expect(state).toBe(fullState);
    expect(state.tabs.map((tab) => tab.id)).not.toContain('ws:documents');
    expect(records.every((id) => state.tabs.some((tab) => tab.id === id))).toBe(true);
  });
  it('never evicts a dirty record sibling or its parent workspace', () => {
    let state = initialConsoleState();
    for (const route of ['clients', 'candidates', 'missions', 'tasks'] as const) {
      state = consoleReducer(state, open(route));
    }
    const records: TabId[] = [];
    for (let i = 10; i < 15; i += 1) {
      const id = `${i.toString().padStart(8, '0')}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
      records.push(`rec:candidate:${id}`);
      state = consoleReducer(state, {
        type: 'openRecord',
        kind: 'candidate',
        recordId: id,
        from: 'clients',
      });
    }
    const dirtySibling = records[0]!;
    state = consoleReducer(state, { type: 'activate', id: 'ws:tasks' });

    state = consoleReducer(state, {
      type: 'replaceLru',
      tab: { id: 'ws:documents', kind: 'workspace', route: 'documents' },
      dirty: [dirtySibling],
    });

    expect(state.tabs.map((tab) => tab.id)).toContain('ws:clients');
    expect(state.tabs.map((tab) => tab.id)).toContain(dirtySibling);
    expect(state.active).toBe('ws:documents');
    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
  });
  it('rejects invalid descriptors rather than admitting them through LRU replacement', () => {
    const state = initialConsoleState();
    const invalid: unknown[] = [
      { id: 'ws:clients', kind: 'workspace', route: 'tasks' },
      { id: 'ws:agenda', kind: 'workspace', route: 'agenda' },
      { id: 'ws:unknown', kind: 'workspace', route: 'unknown' },
      {
        id: `rec:client:${ID}`,
        kind: 'record',
        recordId: ID,
        recordKind: 'candidate',
        route: 'clients',
        parent: 'ws:clients',
      },
      {
        id: 'rec:client:not-a-uuid',
        kind: 'record',
        recordId: 'not-a-uuid',
        recordKind: 'client',
        route: 'clients',
        parent: 'ws:clients',
      },
      {
        id: `rec:client:${ID}`,
        kind: 'record',
        recordId: ID,
        recordKind: 'client',
        route: 'clients',
        parent: 'ws:agenda',
      },
      null,
      [],
    ];

    for (const tab of invalid) {
      expect(
        consoleReducer(state, {
          type: 'replaceLru',
          tab: tab as ConsoleTab,
          dirty: [],
        }),
      ).toBe(state);
    }
  });
});
describe('Console Workspace URL / RV1 history', () => {
  it('validates URLs, duplicates and cross-module origin without changing paths', () => {
    expect(consoleUrlIntent('/clients', `?client=${ID}`)).toMatchObject({
      route: 'clients',
      record: `rec:client:${ID}`,
      from: null,
    });
    expect(consoleUrlIntent('/missions', `?mission=${ID}&in=clients`).from).toBe('clients');
    expect(consoleUrlIntent('/missions', `?mission=${ID}&in=clients&in=tasks`).from).toBeNull();
    expect(consoleUrlIntent('/clients', `?client=${ID}&client=${OTHER}`).record).toBeNull();
    expect(consoleUrlIntent('/clients', '?client=bad').record).toBeNull();
    expect(consoleUrlIntent('/meetings', `?meeting=${ID}`)).toMatchObject({
      route: 'meetings',
      record: null,
      from: null,
    });
  });
  it('preserves router history index, honors current instance, and falls back on reload', () => {
    let state = consoleReducer(initialConsoleState(), open('clients'));
    state = consoleReducer(state, {
      type: 'openRecord',
      kind: 'client',
      recordId: ID,
      from: 'clients',
    });
    const tagged = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 3 },
      'instance-A',
      `rec:client:${ID}`,
    );
    expect(tagged.hiremeHistoryIndex).toBe(3);
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-A', '/clients', `?client=${ID}`)).toBe(
      `rec:client:${ID}`,
    );
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-B', '/clients', `?client=${ID}`)).toBe(
      `rec:client:${ID}`,
    );
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-B', '/clients', '')).toBe(
      'ws:clients',
    );
    const closed = consoleReducer(state, { type: 'close', id: `rec:client:${ID}` });
    expect(
      resolveConsoleHistoryTab(closed, tagged, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe('ws:clients');
  });
  it('prefers a compatible current-instance tab before the canonical open record tab', () => {
    const state = stateWithClientRecord();
    const history = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 4 },
      'instance-A',
      'ws:clients',
    );

    expect(
      resolveConsoleHistoryTab(state, history, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe('ws:clients');
  });
  it.each([
    ['missing history state', undefined],
    ['null history state', null],
    ['primitive history state', 'invalid'],
    ['array history state', []],
    ['missing console hint', { hiremeHistoryIndex: 2 }],
    ['null console hint', { hiremeConsoleTab: null }],
    ['array console hint', { hiremeConsoleTab: [] }],
    ['missing tab id', { hiremeConsoleTab: { console: 'instance-A' } }],
    ['non-string tab id', { hiremeConsoleTab: { console: 'instance-A', tab: 3 } }],
    ['non-string console id', { hiremeConsoleTab: { console: 3, tab: `rec:client:${ID}` } }],
  ])('falls back safely for %s', (_caseName, historyState) => {
    const state = stateWithClientRecord();

    expect(
      resolveConsoleHistoryTab(state, historyState, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe(`rec:client:${ID}`);
  });
  it('rejects an empty console instance id even when the history hint matches', () => {
    const state = stateWithClientRecord();
    const malformed = encodeConsoleHistoryState({ hiremeHistoryIndex: 11 }, '', `rec:client:${ID}`);

    expect(resolveConsoleHistoryTab(state, malformed, '', '/clients', `?client=${ID}`)).toBe(
      `rec:client:${ID}`,
    );
  });
  it('does not resolve a tab id that is absent from the current console state', () => {
    const cleanSession = initialConsoleState();
    const unknownTab = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 12 },
      'instance-A',
      'ws:tasks',
    );

    expect(resolveConsoleHistoryTab(cleanSession, unknownTab, 'instance-A', '/tasks', '')).toBe(
      'ws:tasks',
    );
    expect(cleanSession.tabs.map((tab) => tab.id)).toEqual(['ws:home']);
  });
  it('ignores stale instances and incompatible open-tab hints', () => {
    let state = stateWithClientRecord();
    state = consoleReducer(state, open('tasks'));
    const staleInstance = {
      hiremeHistoryIndex: 7,
      hiremeConsoleTab: { console: 'previous-instance', tab: `rec:client:${ID}` },
    };
    const incompatibleUrl = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 8 },
      'instance-A',
      'ws:tasks',
    );

    expect(
      resolveConsoleHistoryTab(state, staleInstance, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe(`rec:client:${ID}`);
    expect(
      resolveConsoleHistoryTab(state, incompatibleUrl, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe(`rec:client:${ID}`);

    state = consoleReducer(state, {
      type: 'openRecord',
      kind: 'client',
      recordId: OTHER,
      from: 'clients',
    });
    const incompatibleRecordUrl = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 10 },
      'instance-A',
      `rec:client:${OTHER}`,
    );
    expect(
      resolveConsoleHistoryTab(
        state,
        incompatibleRecordUrl,
        'instance-A',
        '/clients',
        `?client=${ID}`,
      ),
    ).toBe(`rec:client:${ID}`);
  });
  it('falls from a closed tab hint to the URL workspace without resurrecting the tab', () => {
    const openState = stateWithClientRecord();
    const history = encodeConsoleHistoryState(
      { hiremeHistoryIndex: 9 },
      'instance-A',
      `rec:client:${ID}`,
    );
    const closedState = consoleReducer(openState, {
      type: 'close',
      id: `rec:client:${ID}`,
    });

    expect(
      resolveConsoleHistoryTab(closedState, history, 'instance-A', '/clients', `?client=${ID}`),
    ).toBe('ws:clients');
    expect(closedState.tabs.map((tab) => tab.id)).not.toContain(`rec:client:${ID}`);
  });
  it('uses URL-only workspace fallback for unindexed clean-session reload', () => {
    const cleanSession = initialConsoleState();

    expect(
      resolveConsoleHistoryTab(
        cleanSession,
        { hiremeHistoryIndex: 0 },
        'new-instance',
        '/clients',
        `?client=${ID}`,
      ),
    ).toBe('ws:clients');
    expect(cleanSession.tabs).toEqual([{ id: 'ws:home', kind: 'workspace', route: 'home' }]);
  });
  it('keeps a revoked active record descriptor only for its denied-and-close state', () => {
    let state = stateWithClientRecord();
    state = consoleReducer(state, { type: 'prune', permissions: [] });

    expect(state.active).toBe(`rec:client:${ID}`);
    expect(state.tabs.map((tab) => tab.id)).toEqual(['ws:home', `rec:client:${ID}`]);
    expect(canAccessInternalRoute('clients', [])).toBe(false);

    state = consoleReducer(state, { type: 'close', id: `rec:client:${ID}` });
    expect(state.active).toBe('ws:home');
  });
});
