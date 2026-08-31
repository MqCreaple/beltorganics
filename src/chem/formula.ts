import { ELEMENT_SYMBOLS } from './elements';
import type { ElementSymbol } from './types';

/** Molecular formula as an element -> count dictionary. */
export type MolecularFormula = Partial<Record<ElementSymbol, number>>;

/** Project formula order: C, H, then all remaining elements alphabetically. */
const FORMULA_ORDER: readonly ElementSymbol[] = [
  'C',
  'H',
  ...ELEMENT_SYMBOLS.filter((symbol) => symbol !== 'C' && symbol !== 'H').sort(),
];

/** Formula entries in project order: `[element, count]` pairs, count > 0. */
export function formulaParts(formula: MolecularFormula): Array<readonly [ElementSymbol, number]> {
  const parts: Array<readonly [ElementSymbol, number]> = [];
  for (const symbol of FORMULA_ORDER) {
    const count = formula[symbol];
    if (count !== undefined && count > 0) parts.push([symbol, count]);
  }
  return parts;
}

/** Plain-text molecular formula, e.g. `C2H6O`, `CH3Cl`, `H2O`. */
export function formulaToString(formula: MolecularFormula): string {
  return formulaParts(formula)
    .map(([symbol, count]) => (count === 1 ? symbol : `${symbol}${count}`))
    .join('');
}
