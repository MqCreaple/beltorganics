import { hybridizationOf } from './hybridization';
import { ELEMENTS } from './elements';
import type { AtomId, Molecule } from './molecule';
import type { PeoeParameters } from './types';

/** Coefficients for the PEOE orbital-electronegativity polynomial. */
export interface PartialChargeOptions {
  /** Number of charge-equalization passes. Default: 8. */
  iterations?: number;
  /** Geometric damping applied on each pass. Default: 0.5. */
  damping?: number;
}

const DEFAULT_ITERATIONS = 8;
const DEFAULT_DAMPING = 0.5;

/** Evaluate an atom's effective orbital electronegativity at charge `q`. */
export function peoeElectronegativity(parameters: PeoeParameters, q: number): number {
  return parameters.a + parameters.b * q + parameters.c * q * q;
}

export function peoeParametersFor(molecule: Molecule, atom: AtomId): PeoeParameters {
  const { element } = molecule.getAtom(atom);
  const parameters = ELEMENTS[element].peoe;
  const hybridization = hybridizationOf(molecule, atom);
  const selected = parameters[hybridization ?? 'sp3']
    ?? parameters.sp3 ?? parameters.sp2 ?? parameters.sp ?? parameters['*'];
  if (selected === undefined) throw new Error(`partialCharges: missing PEOE parameters for ${element}`);
  return selected;
}

/**
 * Connected components in stable atom order. Charge never transfers between
 * components (for example the two ions in a salt), so each component's
 * formal charge is conserved independently.
 */
function connectedComponents(molecule: Molecule): AtomId[][] {
  const atoms = molecule.atoms();
  const atomOrder = new Map(atoms.map((atom, index) => [atom, index]));
  const unseen = new Set(atoms);
  const components: AtomId[][] = [];
  for (const start of atoms) {
    if (!unseen.delete(start)) continue;
    const component: AtomId[] = [];
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const atom = queue[index]!;
      component.push(atom);
      for (const neighbor of molecule.neighbors(atom)) {
        if (unseen.delete(neighbor)) queue.push(neighbor);
      }
    }
    // The final conservation correction is placed on the last atom in the
    // map's public iteration order, so a normal reduction over Map.values()
    // observes the exact component total as well.
    component.sort((a, b) => atomOrder.get(a)! - atomOrder.get(b)!);
    components.push(component);
  }
  return components;
}

/**
 * Stable endpoint order for the iteration. Updates within a pass are
 * simultaneous; sorting also prevents insignificant floating-point drift
 * when the same bonds were inserted in a different order.
 */
function orderedBonds(molecule: Molecule): Array<[AtomId, AtomId]> {
  return molecule
    .bonds()
    .map((bond): [AtomId, AtomId] => {
      const { source, target } = molecule.getBond(bond);
      return source.localeCompare(target) <= 0 ? [source, target] : [target, source];
    })
    .sort(([a1, a2], [b1, b2]) => a1.localeCompare(b1) || a2.localeCompare(b2));
}

function validateOptions(options: PartialChargeOptions): { iterations: number; damping: number } {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const damping = options.damping ?? DEFAULT_DAMPING;
  if (!Number.isInteger(iterations) || iterations < 0) {
    throw new Error('partialCharges: iterations must be a non-negative integer');
  }
  if (!Number.isFinite(damping) || damping <= 0 || damping > 1) {
    throw new Error('partialCharges: damping must be greater than 0 and at most 1');
  }
  return { iterations, damping };
}

/**
 * Compute topology-only Gasteiger-Marsili (PEOE) partial charges.
 *
 * Charges start at each atom's formal charge. On every pass, each bond moves
 * a damped amount of electron density toward the atom with the greater
 * effective electronegativity, where χ(q) = a + bq + cq². All bond transfers
 * in a pass are accumulated before any charge is updated, making the result
 * independent of bond traversal order. Work is O(iterations * bonds).
 *
 * The returned map contains every atom, including explicit Habitium atoms.
 * The sum is corrected at floating-point precision so every disconnected
 * component preserves its formal charge exactly.
 */
export function partialCharges(
  molecule: Molecule,
  options: PartialChargeOptions = {},
): Map<AtomId, number> {
  const { iterations, damping } = validateOptions(options);
  const atoms = molecule.atoms();
  const parameters = new Map(atoms.map((atom) => [atom, peoeParametersFor(molecule, atom)]));
  const charges = new Map(atoms.map((atom) => [atom, molecule.getAtom(atom).formalCharge]));
  const bonds = orderedBonds(molecule);

  let passDamping = damping;
  for (let pass = 0; pass < iterations; pass += 1) {
    const chi = new Map(
      atoms.map((atom) => {
        const parametersForAtom = parameters.get(atom)!;
        return [atom, peoeElectronegativity(parametersForAtom, charges.get(atom)!)] as const;
      }),
    );
    const changes = new Map(atoms.map((atom) => [atom, 0]));

    for (const [first, second] of bonds) {
      const firstChi = chi.get(first)!;
      const secondChi = chi.get(second)!;
      if (firstChi === secondChi) continue;

      // The less electronegative atom donates density and becomes the
      // electron-poor (+q) end. Its χ(+1) normalizes the transfer.
      const acceptor = firstChi > secondChi ? first : second;
      const donor = acceptor === first ? second : first;
      const difference = Math.abs(firstChi - secondChi);
      const donorParameters = parameters.get(donor)!;
      const denominator = peoeElectronegativity(donorParameters, 1);
      const transfer = (passDamping * difference) / denominator;

      changes.set(acceptor, changes.get(acceptor)! - transfer);
      changes.set(donor, changes.get(donor)! + transfer);
    }

    for (const atom of atoms) charges.set(atom, charges.get(atom)! + changes.get(atom)!);
    passDamping *= damping;
  }

  // Bond transfers conserve charge algebraically. Rebuilding the final atom
  // in each component from its target sum removes only accumulated IEEE-754
  // round-off and makes the public conservation guarantee exact.
  for (const component of connectedComponents(molecule)) {
    const last = component.at(-1)!;
    let target = 0;
    let subtotal = 0;
    for (const atom of component) target += molecule.getAtom(atom).formalCharge;
    for (const atom of component.slice(0, -1)) subtotal += charges.get(atom)!;
    charges.set(last, target - subtotal);
  }

  return charges;
}
