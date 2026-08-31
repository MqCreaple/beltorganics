import { symmetricEigenDecomposition } from "../math";
import { conjugatedPiSystems } from "./conjugation";
import { ELEMENTS } from "./elements";
import { displayedLonePairCount } from "./geometry";
import { partialCharges } from "./partial-charges";
import type { AtomId, Molecule } from "./molecule";

export type OrbitalKind = "sigma" | "pi" | "lone-pair";

export interface MolecularOrbital {
  id: string;
  kind: OrbitalKind;
  /** Relative game energy; lower values are more stable. */
  energy: number;
  electrons: 0 | 1 | 2;
  /** Signed normalized atomic-orbital coefficients. */
  coefficients: Map<AtomId, number>;
  /** Conjugated-system index for pi orbitals. */
  piSystem?: number;
}

export interface MolecularOrbitalResult {
  orbitals: MolecularOrbital[];
  occupied: MolecularOrbital[];
  unoccupied: MolecularOrbital[];
  homo?: MolecularOrbital;
  lumo?: MolecularOrbital;
  gap?: number;
}

const PI_COUPLING = -1;
const PARTIAL_CHARGE_SHIFT = -0.35;

function coefficients(
  atoms: readonly AtomId[],
  vector: readonly number[],
): Map<AtomId, number> {
  return new Map(atoms.map((atom, index) => [atom, vector[index]!]));
}

function piOrbitalsWithCharges(
  molecule: Molecule,
  charges: ReadonlyMap<AtomId, number>,
): MolecularOrbital[] {
  return conjugatedPiSystems(molecule).flatMap((system, systemIndex) => {
    const hamiltonian = system.atoms.map((atom, row) =>
      system.atoms.map((other, column) => {
        if (row === column) {
          const view = molecule.getAtom(atom);
          return (
            ELEMENTS[view.element].huckelCoulomb +
            PARTIAL_CHARGE_SHIFT * (charges.get(atom) ?? view.formalCharge)
          );
        }
        const bond = molecule.bondBetween(atom, other);
        return bond === undefined ? 0 : PI_COUPLING;
      }),
    );
    const solved = symmetricEigenDecomposition(hamiltonian);
    let electronsLeft = Math.max(
      0,
      Math.min(system.electronCount, system.atoms.length * 2),
    );
    return solved.values.map((energy, orbitalIndex): MolecularOrbital => {
      const electrons = Math.min(2, electronsLeft) as 0 | 1 | 2;
      electronsLeft -= electrons;
      return {
        id: `pi${systemIndex + 1}.${orbitalIndex + 1}`,
        kind: "pi",
        energy,
        electrons,
        coefficients: coefficients(system.atoms, solved.vectors[orbitalIndex]!),
        piSystem: systemIndex,
      };
    });
  });
}

/** Hückel molecular orbitals for every perceived conjugated pi system. */
export function piMolecularOrbitals(molecule: Molecule): MolecularOrbital[] {
  return piOrbitalsWithCharges(molecule, partialCharges(molecule));
}

/** Two-center sigma bonding and antibonding orbitals for each graph bond. */
function sigmaOrbitals(
  molecule: Molecule,
  charges: ReadonlyMap<AtomId, number>,
): MolecularOrbital[] {
  return molecule.bonds().flatMap((bondId, bondIndex) => {
    const bond = molecule.getBond(bondId);
    const atoms = [bond.source, bond.target] as const;
    const diagonal = atoms.map((atom) => {
      const view = molecule.getAtom(atom);
      return (
        -3 +
        0.15 * ELEMENTS[view.element].huckelCoulomb +
        PARTIAL_CHARGE_SHIFT * (charges.get(atom) ?? view.formalCharge)
      );
    });
    const coupling = -4;
    const solved = symmetricEigenDecomposition([
      [diagonal[0]!, coupling],
      [coupling, diagonal[1]!],
    ]);
    return solved.values.map(
      (energy, index): MolecularOrbital => ({
        id: `sigma${bondIndex + 1}${index === 1 ? "*" : ""}`,
        kind: "sigma",
        energy,
        electrons: index === 0 ? 2 : 0,
        coefficients: coefficients(atoms, solved.vectors[index]!),
      }),
    );
  });
}

/** Localized nonbonding orbitals not already donated to a pi system. */
function lonePairOrbitals(
  molecule: Molecule,
  charges: ReadonlyMap<AtomId, number>,
): MolecularOrbital[] {
  const result: MolecularOrbital[] = [];
  let sequence = 1;
  for (const atom of molecule.atoms()) {
    const view = molecule.getAtom(atom);
    const count = displayedLonePairCount(molecule, atom);
    for (let pair = 0; pair < count; pair += 1) {
      result.push({
        id: `n${sequence++}`,
        kind: "lone-pair",
        energy:
          -1.5 +
          0.4 * ELEMENTS[view.element].huckelCoulomb +
          PARTIAL_CHARGE_SHIFT * (charges.get(atom) ?? view.formalCharge),
        electrons: 2,
        coefficients: new Map([[atom, 1]]),
      });
    }
  }
  return result;
}

/**
 * Cheap molecular-orbital estimate for gameplay.
 *
 * Sigma bonds are localized two-center modes, lone pairs are localized
 * nonbonding modes, and each conjugated pi system is diagonalized as a
 * heteroatom- and charge-adjusted Hückel Hamiltonian.
 */
export function molecularOrbitals(molecule: Molecule): MolecularOrbitalResult {
  const charges = partialCharges(molecule);
  const orbitals = [
    ...sigmaOrbitals(molecule, charges),
    ...lonePairOrbitals(molecule, charges),
    ...piOrbitalsWithCharges(molecule, charges),
  ].sort(
    (first, second) =>
      first.energy - second.energy || first.id.localeCompare(second.id),
  );
  const occupied = orbitals.filter((orbital) => orbital.electrons > 0);
  const unoccupied = orbitals.filter((orbital) => orbital.electrons === 0);
  const homo = occupied.at(-1);
  const lumo = unoccupied[0];
  return {
    orbitals,
    occupied,
    unoccupied,
    ...(homo === undefined ? {} : { homo }),
    ...(lumo === undefined ? {} : { lumo }),
    ...(homo === undefined || lumo === undefined
      ? {}
      : { gap: lumo.energy - homo.energy }),
  };
}
