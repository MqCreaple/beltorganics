import { render } from 'preact';
import type { BlockUI } from '../../world';
import { moleculeRegistry } from '../../chem';
import { MoleculePanel } from './molecule-panel';

/**
 * Builds the `BlockUI` for a chemical source block.
 *
 * The returned function creates a host element, renders the (Preact) panel
 * into it and hands the host back - the world engine only ever sees the DOM
 * element, never Preact. The panel receives the global molecule registry for
 * its cached graph, substance metadata and interactive 3D property viewer.
 */
export function chemicalSourceUI(formula: string): BlockUI {
  return () => {
    const host = document.createElement('div');
    host.className = 'molecule-panel-host';
    render(<MoleculePanel formula={formula} registry={moleculeRegistry} />, host);
    return host;
  };
}
