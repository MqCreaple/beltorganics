import { symmetricEigenDecomposition } from "../math";
import { conjugatedPiSystems } from "./conjugation";
import { ELEMENTS } from "./elements";
import { displayedLonePairCount } from "./geometry";
import {
  partialCharges,
  peoeElectronegativity,
  peoeParametersFor,
} from "./partial-charges";
import type { AtomId, Molecule } from "./molecule";

export type OrbitalKind = "sigma" | "pi" | "lone-pair";

export interface MolecularOrbital {
  id: string;
  kind: OrbitalKind;
  /** Relative game energy; lower values are more stable. */
  energy: number;
  /** Approximate energy in electron-volts for the inspector diagram. */
  energyEv: number;
  electrons: 0 | 1 | 2;
  /** Signed normalized atomic-orbital coefficients. */
  coefficients: Map<AtomId, number>;
  /** Conjugated-system index for pi orbitals. */
  piSystem?: number;
  /** Direction index among an atom's localized lone-pair domains. */
  lonePairIndex?: number;
}

export interface MolecularOrbitalResult {
  orbitals: MolecularOrbital[];
  occupied: MolecularOrbital[];
  unoccupied: MolecularOrbital[];
  homo?: MolecularOrbital;
  lumo?: MolecularOrbital;
  gap?: number;
  gapEv?: number;
}

const PI_COUPLING = -1;
const PARTIAL_CHARGE_SHIFT = -0.35;
const SIGMA_COUPLING_EV = -4;
/** Empirical molecular relaxation applied to the PEOE integer-charge shift. */
export const FORMAL_CHARGE_RELAXATION = 0.87;
/** Affine calibration from dimensionless game levels to display eV. */
export const ORBITAL_ENERGY_SCALE_EV = 2.5;
export const ORBITAL_ENERGY_ZERO_EV = -7.5;

export function orbitalEnergyEv(relativeEnergy: number): number {
  return ORBITAL_ENERGY_ZERO_EV + ORBITAL_ENERGY_SCALE_EV * relativeEnergy;
}

export function relativeOrbitalEnergy(energyEv: number): number {
  return (energyEv - ORBITAL_ENERGY_ZERO_EV) / ORBITAL_ENERGY_SCALE_EV;
}

/**
 * Shift an atom's orbital levels by the PEOE electronegativity change for its
 * integer charge. The minus sign converts electronegativity to electron
 * energy; relaxation screens the isolated-atom response inside a molecule.
 */
export function formalChargeOrbitalShiftEv(molecule: Molecule, atom: AtomId): number {
  const formalCharge = molecule.getAtom(atom).formalCharge;
  if (formalCharge === 0) return 0;
  const parameters = peoeParametersFor(molecule, atom);
  return -FORMAL_CHARGE_RELAXATION * (
    peoeElectronegativity(parameters, formalCharge)
    - peoeElectronegativity(parameters, 0)
  );
}

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
            PARTIAL_CHARGE_SHIFT * (charges.get(atom) ?? view.formalCharge) +
            formalChargeOrbitalShiftEv(molecule, atom) / ORBITAL_ENERGY_SCALE_EV
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
        energyEv: orbitalEnergyEv(energy),
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
      const neutralOrbitalEnergyEv = -peoeParametersFor(molecule, atom).a;
      const partialChargeShiftEv = ORBITAL_ENERGY_SCALE_EV
        * PARTIAL_CHARGE_SHIFT
        * (charges.get(atom) ?? view.formalCharge);
      return relativeOrbitalEnergy(
        neutralOrbitalEnergyEv
        + partialChargeShiftEv
        + formalChargeOrbitalShiftEv(molecule, atom),
      );
    });
    const coupling = SIGMA_COUPLING_EV / ORBITAL_ENERGY_SCALE_EV;
    const solved = symmetricEigenDecomposition([
      [diagonal[0]!, coupling],
      [coupling, diagonal[1]!],
    ]);
    return solved.values.map(
      (energy, index): MolecularOrbital => ({
        id: `sigma${bondIndex + 1}${index === 1 ? "*" : ""}`,
        kind: "sigma",
        energy,
        energyEv: orbitalEnergyEv(energy),
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
      const energy =
        -1.5 +
        0.4 * ELEMENTS[view.element].huckelCoulomb +
        PARTIAL_CHARGE_SHIFT * (charges.get(atom) ?? view.formalCharge) +
        formalChargeOrbitalShiftEv(molecule, atom) / ORBITAL_ENERGY_SCALE_EV;
      result.push({
        id: `n${sequence++}`,
        kind: "lone-pair",
        energy,
        energyEv: orbitalEnergyEv(energy),
        electrons: 2,
        coefficients: new Map([[atom, 1]]),
        lonePairIndex: pair,
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
      : {
          gap: lumo.energy - homo.energy,
          gapEv: lumo.energyEv - homo.energyEv,
        }),
  };
}
