import { useEffect, useRef } from 'preact/hooks';
import { render } from 'preact';
import { bindShortcut } from '../shortcuts';
import type { Block, BlockUIElement } from '../../world';

/** Unmount framework resources before removing a block UI host. */
export function disposeBlockUIElement(element: BlockUIElement): void {
  element.dispose?.();
  element.remove();
}

/**
 * HUD panel shown when the player activates a block that carries a `BlockUI`.
 *
 * Behaviour (as designed in docs/game-world.md):
 * - centered on the screen, never full-screen;
 * - a full-screen backdrop sits behind it: clicking outside the panel (or the
 *   close button, or pressing Escape) dismisses it, clicks inside the panel
 *   do not propagate;
 * - the block's `ui()` function is mounted into the panel body on open.
 */
export interface BlockPanelProps {
  block: Block;
  onClose: () => void;
}

export function BlockPanel({ block, onClose }: BlockPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = contentRef.current;
    if (host === null || block.ui === undefined) return;
    const element = block.ui();
    host.append(element);
    return () => {
      disposeBlockUIElement(element);
    };
  }, [block]);

  // While the panel is open, Escape closes it (shortcut recorded in
  // src/game/shortcuts.ts and bound here; the Phaser scene below does not
  // handle Escape, so there is no conflict).
  useEffect(() => {
    return bindShortcut('close-panel', {
      onKeyDown: (event) => {
        event.preventDefault();
        onClose();
      },
    });
  }, [onClose]);

  return (
    <div className="block-panel-backdrop" onClick={onClose}>
      <div
        className="block-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="block-panel-header">
          <span className="block-panel-title">{block.title}</span>
          <button className="block-panel-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="block-panel-content" ref={contentRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay lifecycle (a single panel at a time, mounted above the canvas)
// ---------------------------------------------------------------------------

let root: HTMLElement | null = null;

/** Mounts the block's UI panel (idempotent while one is already open). */
export function openBlockPanel(block: Block, onClose: () => void): void {
  if (root === null) {
    root = document.createElement('div');
    root.id = 'block-panel-root';
    document.body.append(root);
  }
  render(<BlockPanel block={block} onClose={onClose} />, root);
}

/** Unmounts the panel, if one is open. */
export function closeBlockPanel(): void {
  if (root === null) return;
  render(null, root);
}
