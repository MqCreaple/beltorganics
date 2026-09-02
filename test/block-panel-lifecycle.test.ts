import { describe, expect, it, vi } from 'vitest';
import { disposeBlockUIElement } from '../src/game/ui/block-panel';
import type { BlockUIElement } from '../src/world';

describe('block panel lifecycle', () => {
  it('disposes a nested UI root before detaching its host', () => {
    const order: string[] = [];
    const element = {
      dispose: vi.fn(() => order.push('dispose')),
      remove: vi.fn(() => order.push('remove')),
    } as unknown as BlockUIElement;

    disposeBlockUIElement(element);

    expect(element.dispose).toHaveBeenCalledOnce();
    expect(element.remove).toHaveBeenCalledOnce();
    expect(order).toEqual(['dispose', 'remove']);
  });
});
