import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';

import { canAccessInternalRoute, type InternalRoute } from '../navigation/internal-navigation.js';
import {
  consoleReducer,
  initialConsoleState,
  workspaceTab,
  type ConsoleState,
} from './console-state.js';
import type { ConsoleAction } from './console-state.js';

interface ConsoleContextValue {
  consoleId: string;
  dispatch: (action: ConsoleAction) => void;
  permissions: readonly string[];
  state: ConsoleState;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

interface ConsoleProviderProps {
  children: ReactNode;
  initialRoute: InternalRoute;
  permissions: readonly string[];
}

function initialState(route: InternalRoute, permissions: readonly string[]): ConsoleState {
  const initial = initialConsoleState();
  return workspaceTab(route) && canAccessInternalRoute(route, permissions)
    ? consoleReducer(initial, { type: 'openWorkspace', route })
    : initial;
}

function newConsoleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Session-local console descriptors. This provider deliberately stores no module
 * data, drafts, snapshots, or response cache; only the active route module is mounted.
 */
export function ConsoleProvider({ children, initialRoute, permissions }: ConsoleProviderProps) {
  const [state, dispatch] = useReducer(
    consoleReducer,
    { route: initialRoute, permissions },
    ({ route, permissions: granted }) => initialState(route, granted),
  );
  const consoleIdRef = useRef<string | null>(null);
  if (consoleIdRef.current === null) consoleIdRef.current = newConsoleId();

  useEffect(() => {
    dispatch({ type: 'prune', permissions });
  }, [permissions]);

  const value = useMemo(
    () => ({ consoleId: consoleIdRef.current!, dispatch, permissions, state }),
    [dispatch, permissions, state],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole must be used inside a <ConsoleProvider>.');
  return value;
}
