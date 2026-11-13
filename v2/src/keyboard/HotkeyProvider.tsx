import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { alwaysActive, isTyping, normalizeKey, type Hotkey, type Scope } from './hotkeys';

interface HotkeyCtx {
  register: (h: Hotkey) => () => void;
  pushScope: (s: Scope) => () => void;
  activeScopes: Scope[];
}

const Ctx = createContext<HotkeyCtx | null>(null);

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const hotkeys = useRef<Hotkey[]>([]);
  const [scopeStack, setScopeStack] = useState<Scope[]>(['global']);

  const register = useMemo(
    () => (h: Hotkey) => {
      hotkeys.current.push(h);
      return () => {
        hotkeys.current = hotkeys.current.filter((x) => x !== h);
      };
    },
    [],
  );

  const pushScope = useMemo(
    () => (s: Scope) => {
      setScopeStack((prev) => [...prev, s]);
      return () => setScopeStack((prev) => prev.filter((x) => x !== s || prev.indexOf(x) !== prev.lastIndexOf(x)));
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const combo = normalizeKey(e);
      const typing = isTyping(e.target);
      // Search the deepest active scope first, then outward to 'global'.
      const order = [...scopeStack].reverse();
      for (const scope of order) {
        const hit = hotkeys.current.find((h) => h.scope === scope && h.combo === combo);
        if (hit) {
          if (typing && !hit.whenTyping && !alwaysActive(combo)) continue;
          e.preventDefault();
          hit.run();
          return;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scopeStack]);

  const value = useMemo(() => ({ register, pushScope, activeScopes: scopeStack }), [register, pushScope, scopeStack]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHotkeyCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHotkey must be used within HotkeyProvider');
  return c;
}

/** Register one hotkey for the lifetime of a component. */
export function useHotkey(combo: string, label: string, run: () => void, opts: { scope?: Scope; whenTyping?: boolean } = {}) {
  const { register } = useHotkeyCtx();
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    return register({ combo, label, scope: opts.scope ?? 'global', run: () => runRef.current(), whenTyping: opts.whenTyping });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo, label, opts.scope, opts.whenTyping]);
}

/** Activate a scope while a screen is mounted. */
export function useScope(scope: Scope) {
  const { pushScope } = useHotkeyCtx();
  useEffect(() => pushScope(scope), [pushScope, scope]);
}
