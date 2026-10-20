import { canAccessInternalRoute, routeToPath, type InternalRoute } from '../navigation/internal-navigation.js';
import { recordNavigationIntent } from '../navigation/record-deep-links.js';

export type RecordKind = 'client' | 'candidate' | 'mission';
export type TabId = `ws:${InternalRoute}` | `rec:${RecordKind}:${string}`;
export type ConsoleTab =
  | { id: `ws:${InternalRoute}`; kind: 'workspace'; route: InternalRoute }
  | { id: `rec:${RecordKind}:${string}`; kind: 'record'; route: InternalRoute; recordId: string; recordKind: RecordKind; parent: `ws:${InternalRoute}` };
export interface ConsoleState {
  tabs: readonly ConsoleTab[];
  active: TabId;
  /** Most recently focused first; used only for deterministic fallback and replacement. */
  recent: readonly TabId[];
}
export type ConsoleAction =
  | { type: 'openWorkspace'; route: InternalRoute }
  | { type: 'openRecord'; kind: RecordKind; recordId: string; from: InternalRoute }
  | { type: 'activate'; id: TabId }
  | { type: 'close'; id: TabId }
  | { type: 'replaceLru'; tab: ConsoleTab; dirty: readonly TabId[] }
  | { type: 'prune'; permissions: readonly string[] }
  | { type: 'reset' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recordRoutes: Record<RecordKind, InternalRoute> = {
  client: 'clients', candidate: 'candidates', mission: 'missions',
};
const excluded = new Set<InternalRoute>(['agenda', 'meetings']);
export const SOFT_TAB_LIMIT = 8;
export const HARD_TAB_LIMIT = 10;
export const overview: ConsoleTab = { id: 'ws:home', kind: 'workspace', route: 'home' };
export const initialConsoleState = (): ConsoleState => ({
  tabs: [overview], active: overview.id, recent: [overview.id],
});
export function workspaceTab(route: InternalRoute): ConsoleTab | null {
  return excluded.has(route) ? null : { kind: 'workspace', id: `ws:${route}`, route };
}
export function recordTab(kind: RecordKind, recordId: string, from: InternalRoute): ConsoleTab | null {
  if (!uuid.test(recordId)) return null;
  const owner = recordRoutes[kind];
  const parent = workspaceTab(from);
  if (!parent || parent.kind !== 'workspace') return null;
  return {
    kind: 'record', id: `rec:${kind}:${recordId.toLowerCase()}`,
    recordId: recordId.toLowerCase(), recordKind: kind, route: owner, parent: parent.id,
  };
}
function focus(state: ConsoleState, id: TabId): ConsoleState {
  if (!state.tabs.some(tab => tab.id === id)) return state;
  return { ...state, active: id, recent: [id, ...state.recent.filter(item => item !== id)] };
}
function add(state: ConsoleState, tab: ConsoleTab): ConsoleState {
  if (state.tabs.some(item => item.id === tab.id)) return focus(state, tab.id);
  if (state.tabs.length >= HARD_TAB_LIMIT) return state;
  const parent = tab.kind === 'record' ? workspaceTab(tab.parent.slice(3) as InternalRoute) : null;
  const missingParent = parent && !state.tabs.some(item => item.id === parent.id) ? [parent] : [];
  if (state.tabs.length + missingParent.length + 1 > HARD_TAB_LIMIT) return state;
  return focus({ ...state, tabs: [...state.tabs, ...missingParent, tab] }, tab.id);
}
function remove(state: ConsoleState, id: TabId): ConsoleState {
  if (id === overview.id || !state.tabs.some(tab => tab.id === id)) return state;
  const removed = new Set<TabId>([id]);
  for (const tab of state.tabs) {
    if (tab.kind === 'record' && tab.parent === id) removed.add(tab.id);
  }
  const tabs = state.tabs.filter(tab => !removed.has(tab.id));
  const recent = state.recent.filter(item => !removed.has(item));
  if (!removed.has(state.active)) return { ...state, tabs, recent };
  const closed = state.tabs.find(tab => tab.id === id);
  const group = closed?.kind === 'record' ? closed.parent : id;
  const next = recent.find(item => tabs.some(tab => tab.id === item && (tab.id === group || (tab.kind === 'record' && tab.parent === group))))
    ?? (tabs.some(tab => tab.id === group) ? group : null)
    ?? recent.find(item => tabs.some(tab => tab.id === item))
    ?? overview.id;
  return focus({ tabs, recent, active: overview.id }, next);
}
export function consoleReducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case 'reset': return initialConsoleState();
    case 'openWorkspace': {
      const tab = workspaceTab(action.route);
      return tab ? add(state, tab) : state;
    }
    case 'openRecord': {
      const tab = recordTab(action.kind, action.recordId, action.from);
      return tab ? add(state, tab) : state;
    }
    case 'activate': return focus(state, action.id);
    case 'close': return remove(state, action.id);
    case 'prune': {
      const allowed = state.tabs.filter(tab =>
        tab.id === overview.id || (canAccessInternalRoute(tab.route, action.permissions)
          && (tab.kind !== 'record' || canAccessInternalRoute(tab.parent.slice(3) as InternalRoute, action.permissions))));
      const ids = new Set(allowed.map(tab => tab.id));
      const recent = state.recent.filter(id => ids.has(id));
      if (ids.has(state.active)) return { ...state, tabs: allowed, recent };
      return focus({ tabs: allowed, recent, active: overview.id }, recent[0] ?? overview.id);
    }
    case 'replaceLru': {
      if (state.tabs.some(tab => tab.id === action.tab.id)) return focus(state, action.tab.id);
      if (state.tabs.length < HARD_TAB_LIMIT) return add(state, action.tab);
      const protectedIds = new Set(action.dirty);
      const replace = [...state.recent].reverse().find(id =>
        id !== overview.id && id !== state.active && !protectedIds.has(id)
        && !state.tabs.some(tab => tab.kind === 'record' && tab.parent === id && protectedIds.has(tab.id)));
      if (!replace) return state;
      return add(remove(state, replace), action.tab);
    }
  }
}

/** URL-only navigation intent. Record views keep their existing query parameter. */
export function consoleUrlIntent(pathname: string, search: string): { route: InternalRoute; record: TabId | null; from: InternalRoute | null } {
  const known = (['home', 'admin', 'agenda', 'meetings', 'messages', 'clients', 'candidates', 'missions', 'tasks', 'documents', 'training', 'reporting', 'commercial', 'accounting'] as InternalRoute[]);
  const route = known.find(value => routeToPath(value) === pathname) ?? 'home';
  const intent = recordNavigationIntent(route, search);
  const kind: RecordKind | null = route === 'clients' ? 'client' : route === 'candidates' ? 'candidate' : route === 'missions' ? 'mission' : null;
  const id = kind === 'client' ? intent.clientId : kind === 'candidate' ? intent.candidateId : kind === 'mission' ? intent.missionId : null;
  const params = new URLSearchParams(search);
  const origins = params.getAll('in');
  const from = origins.length === 1 && kind && ['clients', 'candidates', 'missions'].includes(origins[0] ?? '')
    && origins[0] !== route ? origins[0] as InternalRoute : null;
  return { route, record: kind && id ? `rec:${kind}:${id.toLowerCase()}` : null, from };
}

const HISTORY_TAB_KEY = 'hiremeConsoleTab';
export function encodeConsoleHistoryState(state: unknown, consoleId: string, tab: TabId): Record<string, unknown> {
  const base = state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {};
  return { ...base, [HISTORY_TAB_KEY]: { console: consoleId, tab } };
}
/** Never trust a persisted history entry as an authorization decision. */
export function resolveConsoleHistoryTab(state: ConsoleState, historyState: unknown, consoleId: string, pathname: string, search: string): TabId {
  const view = consoleUrlIntent(pathname, search);
  const hint = historyState && typeof historyState === 'object'
    ? (historyState as Record<string, unknown>)[HISTORY_TAB_KEY] : null;
  if (hint && typeof hint === 'object') {
    const value = hint as Record<string, unknown>;
    const tab = state.tabs.find(item => item.id === value.tab);
    if (value.console === consoleId && tab && tab.route === view.route
      && (tab.kind === 'workspace' || tab.id === view.record)) return tab.id;
  }
  if (view.record && state.tabs.some(tab => tab.id === view.record)) return view.record;
  return workspaceTab(view.route)?.id ?? overview.id;
}
