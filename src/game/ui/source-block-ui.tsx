import { render } from 'preact';
import type { BlockUI } from '../../world';
import { MoleculePanel } from './molecule-panel';

/**
 * Builds the `BlockUI` for a chemical source block.
 *
 * The returned function creates a host element, renders the (Preact) panel
 * into it and hands the host back - the world engine only ever sees the DOM
 * element, never Preact. The molecule visualization itself comes later; for
 * now this shows the placeholder `MoleculePanel`.
 */
export function chemicalSourceUI(formula: string): BlockUI {
  return () => {
    const host = document.createElement('div');
    host.className = 'molecule-panel-host';
    render(<MoleculePanel formula={formula} />, host);
    return host;
  };
}