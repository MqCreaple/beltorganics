import type { AtomId, Molecule } from './molecule';
import { hasConjugableLonePair, hybridizationOf } from './hybridization';

/**
 * Conjugated π system perception (v2).
 *
 * Model: every π bond is a *unit* (a double bond contributes 1 unit, a triple
 * bond 2), and a lone pair / empty p orbital that makes an atom sp2 by
 * conjugation (amide N, furan O, carboxylate O-, allyl anion, carbocation,
 * ...) is also a unit. Two units belong to the same conjugated system when a
 * single (σ) bond links an atom of one unit to an atom of the other: the σ
 * single bond between two sp2/sp atoms is what carries conjugation (e.g.
 * butadiene's central bond, or the C-C bond joining an enyne's C=C and C≡C).
 *
 * Triple bonds: the two π bonds of a triple bond are mutually perpendicular
 * (exactly like allene), so they never conjugate with each other. Which one
 * is "chain-active" toward neighbouring π units is a conformational choice;
 * the game assumes the planar, maximally conjugated conformer, so in an enyne
 * the C=C lines up with ONE alkyne π bond and the other stays localized as a
 * 2-atom, 2-electron system. In H2C=CH-C≡C-CH=CH2 both double bonds therefore
 * conjugate with the SAME alkyne π bond, giving one extended 6-centre,
 * 6-electron system plus one localized 2-electron system. This is a
 * simplification: the vinyl groups of real divinylacetylene rotate almost
 * freely (torsional barrier ~0.5 kcal/mol) and the 90°-twisted conformer
 * would instead give two separate 4-electron systems, one per alkyne π bond
 * (docs/research-chemistry.md §8).
 *
 * The same perpendicular rule keeps the two π bonds of an allene or of CO2 in
 * two separate 2-electron systems, since conjugation never "passes through" a
 * π bond itself.
 *
 * Known simplifications (documented in docs/research-chemistry.md §8): cross-conjugation
 * and non-planar twisted geometries are not modelled; conformational
 * flexibility is not modelled (the planar, maximally conjugated conformer is
 * assumed); aromaticity is still read from kekulé double bonds; a lone
 * carbocation (e.g. CH3+) forms a 1-atom, 0-electron system.
 */
export interface ConjugatedPiSystem {
  /** Atom ids in the system (deterministic but not canonical). */
  atoms: AtomId[];
  /** Total number of π electrons delocalized over the system. */
  electronCount: number;
}

/** One π bond, or one conjugated lone pair / empty p orbital. */
interface PiUnit {
  id: string;
  atoms: AtomId[];
  electrons: number;
  /** True for the second (perpendicular) π bond of a triple bond. */
  localized: boolean;
}

function hasPiBonds(molecule: Molecule, atom: AtomId): boolean {
  for (const bond of molecule.bondsOf(atom)) {
    if (molecule.getBond(bond).order > 1) return true;
  }
  return false;
}

function buildUnits(molecule: Molecule): PiUnit[] {
  const units: PiUnit[] = [];
  let seq = 0;
  for (const bond of molecule.bonds()) {
    const view = molecule.getBond(bond);
    const piBonds = view.order - 1;
    for (let i = 0; i < piBonds; i++) {
      units.push({
        id: `u${seq++}`,
        atoms: [view.source, view.target],
        electrons: 2,
        localized: view.order === 3 && i === 1,
      });
    }
  }
  for (const atom of molecule.atoms()) {
    const view = molecule.getAtom(atom);
    if (hasPiBonds(molecule, atom)) continue;
    if (hybridizationOf(molecule, atom) !== 'sp2') continue;
    // sp2 with no π bond of its own: either a conjugated lone pair (2 e-) or
    // an empty p orbital on a carbocation (0 e-).
    units.push({
      id: `u${seq++}`,
      atoms: [atom],
      electrons: hasConjugableLonePair(view.element, view.formalCharge) ? 2 : 0,
      localized: false,
    });
  }
  return units;
}

/**
 * Two units conjugate when a *single* σ bond connects an atom of one unit to
 * an atom of the other (distinct atoms). Localized triple-bond π bonds never
 * conjugate, and π bonds sharing both atoms (the two halves of a triple bond)
 * are never joined through the π bond itself.
 */
function areAdjacent(molecule: Molecule, a: PiUnit, b: PiUnit): boolean {
  if (a.localized || b.localized) return false;
  for (const u of a.atoms) {
    for (const v of b.atoms) {
      if (u === v) continue;
      const bond = molecule.bondBetween(u, v);
      if (bond !== undefined && molecule.getBond(bond).order === 1) return true;
    }
  }
  return false;
}

function toSystem(units: PiUnit[]): ConjugatedPiSystem {
  const atoms: AtomId[] = [];
  const seen = new Set<AtomId>();
  let electronCount = 0;
  for (const unit of units) {
    electronCount += unit.electrons;
    for (const atom of unit.atoms) {
      if (!seen.has(atom)) {
        seen.add(atom);
        atoms.push(atom);
      }
    }
  }
  return { atoms, electronCount };
}

/** All maximal conjugated π systems of the molecule, in unit-insertion order. */
export function conjugatedPiSystems(molecule: Molecule): ConjugatedPiSystem[] {
  const units = buildUnits(molecule);
  const visited = new Set<PiUnit>();
  const systems: ConjugatedPiSystem[] = [];
  for (const unit of units) {
    if (visited.has(unit)) continue;
    const component: PiUnit[] = [];
    const queue: PiUnit[] = [unit];
    visited.add(unit);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const other of units) {
        if (!visited.has(other) && areAdjacent(molecule, current, other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    systems.push(toSystem(component));
  }
  return systems;
}

/**
 * The conjugated π system containing `atom`, or undefined when the atom is
 * not π-participating (sp3).
 */
export function conjugatedPiSystemOf(
  molecule: Molecule,
  atom: AtomId,
): ConjugatedPiSystem | undefined {
  return conjugatedPiSystems(molecule).find((system) => system.atoms.includes(atom));
}
