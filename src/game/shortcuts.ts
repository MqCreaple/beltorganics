/**
 * Keyboard shortcut registry (src/game/shortcuts.ts).
 *
 * Shortcuts are *recorded* here as named specs (keys + optional description)
 * and *loaded* (bound) by UI code that needs them. A single table means a key
 * press means the same thing everywhere: the block panel binds
 * 'close-panel' (Escape), the scene could bind pan keys, and the HUD can
 * render the descriptions. The module is framework-free (no Phaser/Preact
 * imports) so it is unit-testable in Node.
 */

/** The key(s) that trigger a shortcut (KeyboardEvent.key values). */
export interface ShortcutSpec {
  keys: readonly string[];
  /** Short human-readable description (shown in the HUD / docs). */
  description?: string;
}

/** A named shortcut (e.g. 'close-panel'). */
export type ShortcutName = string;

/** Optional handlers for a bound shortcut. */
export interface ShortcutHandlers {
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
}

/** The subset of EventTarget the shortcut binder needs (window qualifies). */
export interface ShortcutTarget {
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

const SHORTCUTS = new Map<ShortcutName, ShortcutSpec>();

/** Record a shortcut spec (replaces any existing spec with the same name). */
export function registerShortcut(name: ShortcutName, spec: ShortcutSpec): void {
  SHORTCUTS.set(name, { ...spec, keys: [...spec.keys] });
}

/** The recorded spec for a shortcut, if any. */
export function getShortcut(name: ShortcutName): ShortcutSpec | undefined {
  const spec = SHORTCUTS.get(name);
  return spec === undefined ? undefined : { ...spec, keys: [...spec.keys] };
}

/** All recorded shortcuts (a snapshot; safe to iterate). */
export function allShortcuts(): ReadonlyMap<ShortcutName, ShortcutSpec> {
  return new Map(
    [...SHORTCUTS.entries()].map(([name, spec]) => [name, { ...spec, keys: [...spec.keys] }]),
  );
}

/**
 * Load (bind) a recorded shortcut's keys onto a target (default window),
 * calling the matching handlers on keydown/keyup. Returns a cleanup function
 * that unbinds the listeners. Matching is case-insensitive.
 */
export function bindShortcut(
  name: ShortcutName,
  handlers: ShortcutHandlers,
  target: ShortcutTarget = typeof window !== 'undefined' ? window : new EventTarget(),
): () => void {
  const spec = SHORTCUTS.get(name);
  if (spec === undefined) {
    throw new Error(`bindShortcut: no shortcut registered as "${name}"`);
  }
  const keys = new Set(spec.keys.map((key) => key.toLowerCase()));
  const onKeyDown = (event: Event): void => {
    const keyboard = event as KeyboardEvent;
    if (!keys.has(keyboard.key.toLowerCase())) return;
    handlers.onKeyDown?.(keyboard);
  };
  const onKeyUp = (event: Event): void => {
    const keyboard = event as KeyboardEvent;
    if (!keys.has(keyboard.key.toLowerCase())) return;
    handlers.onKeyUp?.(keyboard);
  };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}

// ---------------------------------------------------------------------------
// Default shortcuts (the single source of truth for the game's key bindings).
// ---------------------------------------------------------------------------

registerShortcut('close-panel', {
  keys: ['Escape'],
  description: 'Close the open panel',
});
