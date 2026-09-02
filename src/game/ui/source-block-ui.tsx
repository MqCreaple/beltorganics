import { render } from 'preact';
import type { BlockUI, BlockUIElement } from '../../world';
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
    const host = document.createElement('div') as BlockUIElement;
    host.className = 'molecule-panel-host';
    render(<MoleculePanel formula={formula} registry={moleculeRegistry} />, host);
    // Removing a Preact root from the DOM does not unmount it. Give the outer
    // block-panel lifecycle an explicit hook so viewer effects cancel their
    // animation frame and release the WebGL context on every close.
    host.dispose = () => render(null, host);
    return host;
  };
}
