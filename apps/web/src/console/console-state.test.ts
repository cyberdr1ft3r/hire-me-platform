import { describe, expect, it } from 'vitest';
import {
  consoleReducer,
  consoleUrlIntent,
  encodeConsoleHistoryState,
  initialConsoleState,
  recordTab,
  resolveConsoleHistoryTab,
  SOFT_TAB_LIMIT,
  HARD_TAB_LIMIT,
} from './console-state.js';

const ID = '4aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = '5aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const open = (route: 'clients' | 'candidates' | 'missions' | 'tasks') => ({
  type: 'openWorkspace' as const,
  route,
});
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
    const records: string[] = [];
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
});
