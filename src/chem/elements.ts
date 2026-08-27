import type { ElementInfo, ElementSymbol } from './types';

/**
 * The four elements of the game, keyed by symbol.
 *
 * Names are invented (Cardinium, Habitium, Obligium, Naturium); the letters
 * are the real-world shorthand used in formulas and canonical names.
 */
export const ELEMENTS: Record<ElementSymbol, ElementInfo> = {
  C: { symbol: 'C', name: 'Cardinium', valence: 4, lonePairs: 0, electronegativity: 7.98 },
  H: { symbol: 'H', name: 'Habitium', valence: 1, lonePairs: 0, electronegativity: 7.17 },
  O: { symbol: 'O', name: 'Obligium', valence: 2, lonePairs: 2, electronegativity: 14.18 },
  N: { symbol: 'N', name: 'Naturium', valence: 3, lonePairs: 1, electronegativity: 11.54 },
};

/**
 * Greediness ladder, most greedy first: Obligium > Naturium > Cardinium ≈
 * Habitium. Used later for building inorganic compound names (*-ide endings).
 */
export const GREEDINESS_RANK: Record<ElementSymbol, number> = {
  O: 0,
  N: 1,
  C: 2,
  H: 3,
};

/** Narrowing type guard for element symbols. */
export function isElementSymbol(value: unknown): value is ElementSymbol {
  return value === 'C' || value === 'H' || value === 'O' || value === 'N';
}

export function elementInfo(symbol: ElementSymbol): ElementInfo {
  return ELEMENTS[symbol];
}
