import { describe, expect, it } from 'vitest';
import { Molecule, parseSmiles, partialCharges } from '../src/chem';

function chargeSum(charges: ReadonlyMap<string, number>): number {
  return [...charges.values()].reduce((sum, charge) => sum + charge, 0);
}

function chargeOfElement(
  molecule: Molecule,
  charges: ReadonlyMap<string, number>,
  element: 'C' | 'H' | 'O' | 'N',
): number[] {
  return molecule
    .atoms()
    .filter((atom) => molecule.getAtom(atom).element === element)
    .map((atom) => charges.get(atom)!);
}

describe('PEOE partial charges', () => {
  it('makes water oxygen electron-rich and its hydrogens electron-poor', () => {
    const water = parseSmiles('O');
    const charges = partialCharges(water);
    const [oxygen] = chargeOfElement(water, charges, 'O');
    const hydrogens = chargeOfElement(water, charges, 'H');

    expect(oxygen).toBeLessThan(0);
    expect(hydrogens).toHaveLength(2);
    for (const hydrogen of hydrogens) expect(hydrogen).toBeGreaterThan(0);
    expect(chargeSum(charges)).toBe(0);
  });

  it('identifies the carbonyl carbon as electron-poor and oxygen as electron-rich', () => {
    const formaldehyde = parseSmiles('C=O');
    const charges = partialCharges(formaldehyde);
    const [carbon] = chargeOfElement(formaldehyde, charges, 'C');
    const [oxygen] = chargeOfElement(formaldehyde, charges, 'O');

    expect(carbon).toBeGreaterThan(0);
    expect(oxygen).toBeLessThan(0);
    expect(oxygen!).toBeLessThan(carbon!);
  });

  it('decays the polarizing effect of oxygen through a carbon chain', () => {
    const butanol = parseSmiles('CCCCO');
    const charges = partialCharges(butanol);
    const oxygen = butanol.atoms().find((atom) => butanol.getAtom(atom).element === 'O')!;
    const carbonByDistance: string[] = [];
    let previous = oxygen;
    let current = butanol.neighbors(oxygen).find((atom) => butanol.getAtom(atom).element === 'C')!;
    while (current !== undefined) {
      carbonByDistance.push(current);
      const next = butanol
        .neighbors(current)
        .find(
          (atom) => atom !== previous && butanol.getAtom(atom).element === 'C',
        );
      previous = current;
      current = next!;
    }

    expect(carbonByDistance).toHaveLength(4);
    const butanolCarbonCharges = carbonByDistance.map((atom) => charges.get(atom)!);
    const butane = parseSmiles('CCCC');
    const butaneCharges = partialCharges(butane);
    const firstTerminal = butane
      .atoms()
      .find(
        (atom) =>
          butane.getAtom(atom).element === 'C' &&
          butane.neighbors(atom).filter((neighbor) => butane.getAtom(neighbor).element === 'C')
            .length === 1,
      )!;
    const butaneCarbons: string[] = [];
    previous = '';
    current = firstTerminal;
    while (current !== undefined) {
      butaneCarbons.push(current);
      const next = butane
        .neighbors(current)
        .find(
          (atom) => atom !== previous && butane.getAtom(atom).element === 'C',
        );
      previous = current;
      current = next!;
    }
    const oxygenInfluence = butanolCarbonCharges.map((charge, index) =>
      Math.abs(charge - butaneCharges.get(butaneCarbons[index]!)!),
    );

    expect(oxygenInfluence[0]).toBeGreaterThan(oxygenInfluence[1]!);
    expect(oxygenInfluence[1]).toBeGreaterThan(oxygenInfluence[2]!);
    expect(oxygenInfluence[2]).toBeGreaterThan(oxygenInfluence[3]!);
  });

  it('retains formal charge and shares carboxylate charge across both oxygens', () => {
    const acetate = parseSmiles('CC(=O)[O-]');
    const charges = partialCharges(acetate);
    const oxygens = chargeOfElement(acetate, charges, 'O');

    expect(oxygens).toHaveLength(2);
    expect(oxygens[0]).toBeLessThan(0);
    expect(oxygens[1]).toBeLessThan(0);
    // Density moves onto the neutral carbonyl O and away from the formal O-,
    // so the charge is shared even though this cheap model does not enforce
    // perfect resonance equivalence.
    expect(oxygens[0]).toBeLessThan(-0.1);
    expect(oxygens[1]).toBeGreaterThan(-1);
    expect(chargeSum(charges)).toBe(-1);
  });

  it('conserves each disconnected ion charge independently', () => {
    const salt = new Molecule();
    const ammonium = salt.addAtom('N', { formalCharge: 1 });
    for (let i = 0; i < 4; i += 1) salt.addBond(ammonium, salt.addAtom('H'));
    const anion = salt.addAtom('O', { formalCharge: -1 });
    const charges = partialCharges(salt);

    const cationTotal = [ammonium, ...salt.neighbors(ammonium)].reduce(
      (sum, atom) => sum + charges.get(atom)!,
      0,
    );
    expect(cationTotal).toBe(1);
    expect(charges.get(anion)).toBe(-1);
    expect(chargeSum(charges)).toBe(0);
  });

  it('is independent of bond insertion order', () => {
    const first = new Molecule();
    const firstAtoms = [first.addAtom('C'), first.addAtom('C'), first.addAtom('O')];
    first.addBond(firstAtoms[0]!, firstAtoms[1]!);
    first.addBond(firstAtoms[1]!, firstAtoms[2]!);
    first.addImplicitHydrogens();

    const second = new Molecule();
    const secondAtoms = [second.addAtom('C'), second.addAtom('C'), second.addAtom('O')];
    second.addBond(secondAtoms[1]!, secondAtoms[2]!);
    second.addBond(secondAtoms[0]!, secondAtoms[1]!);
    second.addImplicitHydrogens();

    expect([...partialCharges(second).values()]).toEqual([...partialCharges(first).values()]);
  });

  it('validates iteration options', () => {
    const methane = parseSmiles('C');
    expect(() => partialCharges(methane, { iterations: -1 })).toThrow(/iterations/);
    expect(() => partialCharges(methane, { damping: 0 })).toThrow(/damping/);
    expect(partialCharges(methane, { iterations: 0 }).get(methane.atoms()[0]!)).toBe(0);
  });
});
