import { describe, expect, it } from 'vitest';
import {
 consoleReducer, consoleUrlIntent, encodeConsoleHistoryState, initialConsoleState,
 recordTab, resolveConsoleHistoryTab, SOFT_TAB_LIMIT, HARD_TAB_LIMIT,
} from './console-state.js';

const ID = '4aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = '5aabbbaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const open = (route: 'clients' | 'candidates' | 'missions' | 'tasks') =>
  ({ type: 'openWorkspace' as const, route });
describe('Console Workspace B1 pure state', () => {
  it('keeps Overview permanent, opens/focuses primary tabs and deduplicates', () => {
    let state = initialConsoleState();
    state = consoleReducer(state, open('clients'));
    state = consoleReducer(state, open('clients'));
    expect(state.tabs.map(tab => tab.id)).toEqual(['ws:home', 'ws:clients']);
    expect(state.active).toBe('ws:clients');
    expect(consoleReducer(state, { type: 'close', id: 'ws:home' })).toBe(state);
  });
  it('deduplicates records across modules, keeps a flat parent, and closes children', () => {
    let state = consoleReducer(initialConsoleState(), { type: 'openRecord', kind: 'mission', recordId: ID, from: 'clients' });
    state = consoleReducer(state, { type: 'openRecord', kind: 'mission', recordId: ID.toUpperCase(), from: 'missions' });
    expect(state.tabs.filter(tab => tab.kind === 'record')).toHaveLength(1);
    expect(state.tabs.find(tab => tab.kind === 'record')).toMatchObject({ parent: 'ws:clients' });
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
    state = consoleReducer(state, { type: 'prune', permissions: ['clients:view'] });
    expect(state.tabs.map(tab => tab.id)).toEqual(['ws:home', 'ws:clients']);
    expect(state.active).toBe('ws:clients');
    expect(consoleReducer(state, { type: 'reset' })).toEqual(initialConsoleState());
  });
  it('has a hard cap and never replaces Overview or dirty tabs', () => {
    let state = initialConsoleState();
    for (const route of ['clients', 'candidates', 'missions', 'tasks'] as const) state = consoleReducer(state, open(route));
    for (let i = 0; i < 7; i++) {
      const id = `${(i+10).toString().padStart(8,'0')}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
      state = consoleReducer(state, { type: 'openRecord', kind: 'candidate', recordId: id, from: 'clients' });
    }
    expect(SOFT_TAB_LIMIT).toBe(8);
    expect(state.tabs).toHaveLength(HARD_TAB_LIMIT);
    const before = state;
    state = consoleReducer(state, { type: 'replaceLru', tab: recordTab('mission', OTHER, 'missions')!, dirty: state.tabs.filter(x => x.id !== 'ws:home').map(x => x.id) });
    expect(state).toBe(before);
  });
});
describe('Console Workspace URL / RV1 history', () => {
  it('validates URLs, duplicates and cross-module origin without changing paths', () => {
    expect(consoleUrlIntent('/clients', `?client=${ID}`)).toMatchObject({ route: 'clients', record: `rec:client:${ID}`, from: null });
    expect(consoleUrlIntent('/missions', `?mission=${ID}&in=clients`).from).toBe('clients');
    expect(consoleUrlIntent('/missions', `?mission=${ID}&in=clients&in=tasks`).from).toBeNull();
    expect(consoleUrlIntent('/clients', `?client=${ID}&client=${OTHER}`).record).toBeNull();
    expect(consoleUrlIntent('/clients', '?client=bad').record).toBeNull();
  });
  it('preserves router history index, honors current instance, and falls back on reload', () => {
    let state = consoleReducer(initialConsoleState(), open('clients'));
    state = consoleReducer(state, { type: 'openRecord', kind: 'client', recordId: ID, from: 'clients' });
    const tagged = encodeConsoleHistoryState({ hiremeHistoryIndex: 3 }, 'instance-A', `rec:client:${ID}`);
    expect(tagged.hiremeHistoryIndex).toBe(3);
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-A', '/clients', `?client=${ID}`)).toBe(`rec:client:${ID}`);
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-B', '/clients', `?client=${ID}`)).toBe(`rec:client:${ID}`);
    expect(resolveConsoleHistoryTab(state, tagged, 'instance-B', '/clients', '')).toBe('ws:clients');
    const closed = consoleReducer(state, { type: 'close', id: `rec:client:${ID}` });
    expect(resolveConsoleHistoryTab(closed, tagged, 'instance-A', '/clients', `?client=${ID}`)).toBe('ws:clients');
  });
});
