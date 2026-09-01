import { describe, expect, it } from "vitest";
import {
  molecularOrbitals,
  parseSmiles,
  piMolecularOrbitals,
} from "../src/chem";
import { DEMO_SOURCES } from "../src/demo-sources";

const norm = (values: Iterable<number>): number =>
  Math.sqrt([...values].reduce((sum, value) => sum + value * value, 0));

describe("molecular orbitals", () => {
  it("solves ethene into normalized bonding and antibonding pi modes", () => {
    const orbitals = piMolecularOrbitals(parseSmiles("C=C"));
    expect(orbitals).toHaveLength(2);
    expect(orbitals[1]!.energy - orbitals[0]!.energy).toBeCloseTo(2, 8);
    expect(orbitals.map((orbital) => orbital.electrons)).toEqual([2, 0]);
    for (const orbital of orbitals)
      expect(norm(orbital.coefficients.values())).toBeCloseTo(1, 10);
  });

  it("reproduces the benzene Hückel degeneracies", () => {
    const energies = piMolecularOrbitals(parseSmiles("c1ccccc1")).map(
      (orbital) => orbital.energy,
    );
    expect(energies).toHaveLength(6);
    const center =
      energies.reduce((sum, energy) => sum + energy, 0) / energies.length;
    expect(energies[0]! - center).toBeCloseTo(-2, 8);
    expect(energies[1]! - center).toBeCloseTo(-1, 8);
    expect(energies[2]! - center).toBeCloseTo(-1, 8);
    expect(energies[3]! - center).toBeCloseTo(1, 8);
    expect(energies[4]! - center).toBeCloseTo(1, 8);
    expect(energies[5]! - center).toBeCloseTo(2, 8);
  });

  it("localizes the carbonyl LUMO more strongly on carbon than oxygen", () => {
    const molecule = parseSmiles("C=O");
    const carbon = molecule
      .atoms()
      .find((atom) => molecule.getAtom(atom).element === "C")!;
    const oxygen = molecule
      .atoms()
      .find((atom) => molecule.getAtom(atom).element === "O")!;
    const piLumo = piMolecularOrbitals(molecule).find(
      (orbital) => orbital.electrons === 0,
    )!;
    expect(Math.abs(piLumo.coefficients.get(carbon)!)).toBeGreaterThan(
      Math.abs(piLumo.coefficients.get(oxygen)!),
    );
  });

  it("polarizes heteronuclear sigma modes in opposite directions", () => {
    const molecule = parseSmiles("CO");
    const carbon = molecule.atoms().find((atom) => molecule.getAtom(atom).element === "C")!;
    const oxygen = molecule.atoms().find((atom) => molecule.getAtom(atom).element === "O")!;
    const modes = molecularOrbitals(molecule).orbitals.filter((orbital) =>
      orbital.kind === "sigma"
      && orbital.coefficients.has(carbon)
      && orbital.coefficients.has(oxygen)
    );
    expect(modes).toHaveLength(2);
    expect(Math.abs(modes[0]!.coefficients.get(oxygen)!)).toBeGreaterThan(
      Math.abs(modes[0]!.coefficients.get(carbon)!),
    );
    expect(Math.abs(modes[1]!.coefficients.get(carbon)!)).toBeGreaterThan(
      Math.abs(modes[1]!.coefficients.get(oxygen)!),
    );
  });

  it("raises an alkoxide lone pair toward its measured detachment energy", () => {
    const oxygenLonePairEnergy = (smiles: string): number => {
      const molecule = parseSmiles(smiles);
      const oxygen = molecule.atoms().find((atom) => molecule.getAtom(atom).element === "O")!;
      return Math.max(...molecularOrbitals(molecule).orbitals.filter((orbital) =>
        orbital.kind === "lone-pair" && orbital.coefficients.has(oxygen)
      ).map((orbital) => orbital.energyEv));
    };
    const ethanol = oxygenLonePairEnergy("CCO");
    const ethoxide = oxygenLonePairEnergy("CC[O-]");
    expect(ethanol).toBeGreaterThan(-13);
    expect(ethanol).toBeLessThan(-9);
    expect(ethoxide).toBeCloseTo(-1.71, 1);
    expect(ethoxide - ethanol).toBeGreaterThan(8);
  });

  it.each([
    ["water", "O", "lone-pair", "sigma"],
    ["ethanol", "CCO", "lone-pair", "sigma"],
    ["acetone", "CC(=O)C", "lone-pair", "pi"],
    ["ammonia", "N", "lone-pair", "sigma"],
    ["acetic acid", "CC(=O)O", "lone-pair", "pi"],
    ["acetate", "CC(=O)[O-]", "pi", "pi"],
  ] as const)(
    "gives %s its benchmark frontier-orbital characters",
    (_name, smiles, homoKind, lumoKind) => {
      const result = molecularOrbitals(parseSmiles(smiles));
      expect(result.homo?.kind).toBe(homoKind);
      expect(result.lumo?.kind).toBe(lumoKind);
      expect(result.gapEv).toBeGreaterThan(0);
    },
  );

  it("places the acetate frontier near its measured detachment energy", () => {
    const homo = molecularOrbitals(parseSmiles("CC(=O)[O-]")).homo!;
    expect(homo.kind).toBe("pi");
    expect(homo.energyEv).toBeGreaterThan(-4);
    expect(homo.energyEv).toBeLessThan(-3);
  });

  it("gives a conjugated diene a smaller pi frontier gap than ethene", () => {
    const gap = (smiles: string): number => {
      const orbitals = piMolecularOrbitals(parseSmiles(smiles));
      const homo = orbitals.filter((orbital) => orbital.electrons > 0).at(-1)!;
      const lumo = orbitals.find((orbital) => orbital.electrons === 0)!;
      return lumo.energy - homo.energy;
    };
    expect(gap("C=CC=C")).toBeLessThan(gap("C=C"));
  });

  it("includes occupied and unoccupied sigma, pi and lone-pair modes", () => {
    const result = molecularOrbitals(parseSmiles("C=O"));
    expect(new Set(result.orbitals.map((orbital) => orbital.kind))).toEqual(
      new Set(["sigma", "pi", "lone-pair"]),
    );
    expect(result.homo).toBeDefined();
    expect(result.lumo).toBeDefined();
    expect(result.gap).toBeGreaterThan(0);
    expect(result.gapEv).toBeCloseTo(result.gap! * 2.5, 10);
    expect(result.occupied.every((orbital) => orbital.electrons > 0)).toBe(
      true,
    );
    expect(result.unoccupied.every((orbital) => orbital.electrons === 0)).toBe(
      true,
    );
  });

  it.each(DEMO_SOURCES.map(([, , smiles]) => [smiles]))(
    "produces finite orbital energies for demo molecule %s",
    (smiles) => {
      const result = molecularOrbitals(parseSmiles(smiles));
      expect(
        result.orbitals.every((orbital) => Number.isFinite(orbital.energy)),
      ).toBe(true);
      for (const orbital of result.orbitals) {
        expect(norm(orbital.coefficients.values())).toBeCloseTo(1, 8);
      }
    },
  );
});
