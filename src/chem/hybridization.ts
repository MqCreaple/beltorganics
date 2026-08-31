import type { AtomId, Molecule } from './molecule';
import type { ElementSymbol } from './types';

/**
 * Hybridization of the heavy atoms in a molecule.
 *
 * Labeling rules (v1, no aromaticity perception yet; see docs/research-chemistry.md §8):
 *
 * 1. A triple bond anywhere on the atom -> sp (alkynes, nitriles).
 * 2. Two double bonds on the same atom -> sp (allenes, CO2, ketenes).
 * 3. One double bond -> sp2 (alkenes, carbonyls, imines, ...).
 * 4. A carbocation (C with positive formal charge, e.g. CH3+) -> sp2: it has
 *    three sigma bonds but an empty p orbital (trigonal planar), not the sp3
 *    that VSEPR counting would suggest.
 * 5. Otherwise the atom is sp3, except a lone-pair atom bonded directly to an
 *    sp/sp2 atom is sp2, because its lone pair conjugates into the
 *    neighbouring pi system. This reproduces the non-VSEPR cases: amide
 *    nitrogen (peptide bonds), furan's oxygen, the single-bonded oxygen of a
 *    carboxylate, and *conjugated* carbanions (allyl/benzyl anion, enolates).
 *
 * Carbanions: a simple alkyl carbanion (e.g. CH3-) is sp3 and pyramidal (lone
 * pair in an sp3 orbital), which aligns with VSEPR; only when the lone pair
 * sits next to a pi system (conjugated carbanion) is it sp2.
 *
 * Simplifications (documented in docs/research-chemistry.md §8):
 * - Aromaticity is not perceived yet: benzene is labeled from its kekulé
 *   double bonds, and a lone-pair heteroatom adjacent to an aromatic carbon
 *   (e.g. aniline's N) is labeled sp2 even though real aniline is ~sp3.
 * - The lone-pair conjugation test only looks at direct multiple-bond
 *   neighbours, not at chains of conjugated heteroatoms.
 * - Positively charged N/O (ammonium, oxonium, protonated amide) have no lone
 *   pair left to donate and are labeled sp3 (unless they also carry a double
 *   bond, e.g. pyridinium).
 */
export type Hybridization = 'sp' | 'sp2' | 'sp3';

/** Label derived purely from multiple bonds, or null when there are none. */
function labelFromMultipleBonds(molecule: Molecule, atom: AtomId): Hybridization | null {
  let doubles = 0;
  let triples = 0;
  for (const bond of molecule.bondsOf(atom)) {
    const order = molecule.getBond(bond).order;
    if (order === 2) doubles += 1;
    else if (order === 3) triples += 1;
  }
  if (triples > 0) return 'sp';
  if (doubles >= 2) return 'sp';
  if (doubles === 1) return 'sp2';
  return null;
}

/**
 * Does this atom carry a lone pair that can conjugate into a neighbouring pi
 * system?
 *
 * - Anionic carbon (a carbanion C-) has one; neutral carbon never does.
 * - Neutral or anionic N/O have one; cations (ammonium, oxonium, protonated
 *   amide) have none.
 */
export function hasConjugableLonePair(element: ElementSymbol, formalCharge: number): boolean {
  if (element === 'C') return formalCharge < 0;
  return (element === 'N' || element === 'O' || element === 'P' || element === 'S'
    || element === 'F' || element === 'Cl' || element === 'Br' || element === 'I')
    && formalCharge <= 0;
}

/**
 * Hybridization of one atom; `undefined` for hydrogens (the game only labels
 * non-hydrogen elements, matching the design docs).
 */
export function hybridizationOf(molecule: Molecule, atom: AtomId): Hybridization | undefined {
  const view = molecule.getAtom(atom);
  if (view.element === 'H' || view.element === 'Li' || view.element === 'Mg') return undefined;

  const fromMultipleBonds = labelFromMultipleBonds(molecule, atom);
  if (fromMultipleBonds !== null) return fromMultipleBonds;

  // Carbocation: trivalent carbon with an empty p orbital (CH3+, R3C+).
  // Three sigma bonds but no lone pair -> planar sp2, not VSEPR sp3.
  if (view.element === 'C' && view.formalCharge > 0) return 'sp2';
  // Neutral three-coordinate boron has an empty p orbital.
  if (view.element === 'B' && view.formalCharge === 0) return 'sp2';

  if (hasConjugableLonePair(view.element, view.formalCharge)) {
    for (const neighbor of molecule.neighbors(atom)) {
      const neighborLabel = labelFromMultipleBonds(molecule, neighbor);
      if (neighborLabel === 'sp' || neighborLabel === 'sp2') return 'sp2';
    }
  }
  return 'sp3';
}

/** Hybridization of every non-hydrogen atom, keyed by atom id. */
export function hybridizations(molecule: Molecule): Map<AtomId, Hybridization> {
  const result = new Map<AtomId, Hybridization>();
  for (const atom of molecule.atoms()) {
    const label = hybridizationOf(molecule, atom);
    if (label !== undefined) result.set(atom, label);
  }
  return result;
}
