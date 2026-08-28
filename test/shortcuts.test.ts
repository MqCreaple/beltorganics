import { describe, expect, it, vi } from 'vitest';
import { allShortcuts, bindShortcut, getShortcut, registerShortcut } from '../src/game/shortcuts';

/** Minimal event target that records listeners and can dispatch fake keys. */
class FakeTarget {
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (callback === null) return;
    const set = this.listeners.get(type) ?? new Set();
    set.add(callback as (event: Event) => void);
    this.listeners.set(type, set);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | EventListenerOptions,
  ): void {
    if (callback === null) return;
    this.listeners.get(type)?.delete(callback as (event: Event) => void);
  }

  /** Dispatch a key event to all listeners of `type`; returns the event. */
  dispatch(type: 'keydown' | 'keyup', key: string): KeyboardEvent {
    const event = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
}

describe('keyboard shortcuts', () => {
  it('records and retrieves shortcut specs', () => {
    registerShortcut('test-move', { keys: ['w', 'W'], description: 'Pan up' });
    expect(getShortcut('test-move')).toEqual({ keys: ['w', 'W'], description: 'Pan up' });
    expect(allShortcuts().get('close-panel')?.keys).toContain('Escape');
    expect(getShortcut('does-not-exist')).toBeUndefined();
  });

  it('binds a key to a handler and unbinds on cleanup', () => {
    const target = new FakeTarget();
    const onClose = vi.fn();
    const cleanup = bindShortcut('close-panel', { onKeyDown: onClose }, target);

    target.dispatch('keydown', 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    // Unrelated keys do not trigger the shortcut.
    target.dispatch('keydown', 'a');
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    target.dispatch('keydown', 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('matching is case-insensitive', () => {
    registerShortcut('test-case', { keys: ['Escape'] });
    const target = new FakeTarget();
    const onKeyDown = vi.fn();
    bindShortcut('test-case', { onKeyDown }, target);
    target.dispatch('keydown', 'escape');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('fires onKeyUp handlers too', () => {
    const target = new FakeTarget();
    const onKeyUp = vi.fn();
    bindShortcut('close-panel', { onKeyUp }, target);
    target.dispatch('keyup', 'Escape');
    expect(onKeyUp).toHaveBeenCalledTimes(1);
  });

  it('throws when binding an unregistered shortcut', () => {
    expect(() => bindShortcut('missing-shortcut', {}, new FakeTarget())).toThrow(/no shortcut/);
  });
});