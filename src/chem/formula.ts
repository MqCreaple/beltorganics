import type { ElementSymbol } from './types';

/**
 * Molecular formula as an element -> count dictionary.
 *
 * Only elements actually present in the molecule are included (e.g.
 * `{ C: 2, H: 6, O: 1 }` for ethanol). Rendering decides how to lay the
 * counts out (Hill order, subscripts, ...) - see `formulaParts` and
 * `formulaToString`.
 */
export type MolecularFormula = Partial<Record<ElementSymbol, number>>;

/** Hill order: C, then H, then the remaining elements alphabetically (N, O).
 * With no carbon, H comes first, which yields `H2O` / `H3N` etc. */
const HILL_ORDER: readonly ElementSymbol[] = ['C', 'H', 'N', 'O'];

/** Formula entries in Hill order: `[element, count]` pairs, count > 0. */
export function formulaParts(formula: MolecularFormula): Array<readonly [ElementSymbol, number]> {
  const parts: Array<readonly [ElementSymbol, number]> = [];
  for (const symbol of HILL_ORDER) {
    const count = formula[symbol];
    if (count !== undefined && count > 0) parts.push([symbol, count]);
  }
  return parts;
}

/** Plain-text Hill formula, e.g. `C2H6O`, `H2O`, `H3N`. */
export function formulaToString(formula: MolecularFormula): string {
  return formulaParts(formula)
    .map(([symbol, count]) => (count === 1 ? symbol : `${symbol}${count}`))
    .join('');
}
