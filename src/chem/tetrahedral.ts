import type { BondId, TetrahedralDirection, TetrahedralStereo } from './types';

/**
 * Tetrahedral stereo helpers.
 *
 * A `TetrahedralStereo` label is an explicit local chirality specification:
 * the four bonds incident to a centre in an arbitrary order. The winding
 * convention is fixed - looking down `bonds[0]` (from the substituent toward
 * the centre), the three trailing bonds wind **counterclockwise** - so the
 * order alone encodes the chirality: the mirror-image arrangement is an odd
 * permutation (swap any two bonds) of the order.
 *
 * Conventions (pinned by the geometric tests in `test/tetrahedral.test.ts`):
 * - "looking down a bond" = looking along it from the substituent toward the
 *   centre (the same viewpoint Daylight uses for `@` / `@@`).
 * - `@` (anticlockwise) <-> `counterclockwise`, `@@` (clockwise) <-> `clockwise`.
 *
 * Key fact (the "order indicator"): the rotation group of a tetrahedron is the
 * alternating group A4, i.e. rotations are exactly the even permutations of the
 * four bonds. Cyclically rotating any three bonds is a 3-cycle (even) and never
 * changes the indicator. So two specified orders represent the same arrangement
 * iff they have the same parity relative to a fixed reference (here: sorted by
 * id); an odd permutation is a reflection and describes the mirror image.
 */

/** +1 for an even permutation of four items, -1 for an odd one. */
function parityOfPermutation(p: readonly [number, number, number, number]): 1 | -1 {
  let inversions = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if ((p[i] as number) > (p[j] as number)) inversions++;
    }
  }
  return inversions % 2 === 0 ? 1 : -1;
}

/**
 * Order indicator of a tetrahedral label: +1 / -1 is the parity of the bond
 * order relative to the same bonds sorted by id.
 *
 * Invariant under tetrahedron rotations (the even permutations, including the
 * cyclic rotations of any three bonds), so two specified orders are the same
 * arrangement iff their indicators are equal.
 */
export function orderIndicator(order: readonly BondId[]): 1 | -1 {
  if (order.length !== 4) {
    throw new Error(`orderIndicator: expected 4 bonds, got ${order.length}`);
  }
  const sorted = [...order].sort();
  const position = new Map<BondId, number>();
  sorted.forEach((id, i) => position.set(id, i));
  const p: [number, number, number, number] = [
    position.get(order[0]!)!,
    position.get(order[1]!)!,
    position.get(order[2]!)!,
    position.get(order[3]!)!,
  ];
  return parityOfPermutation(p);
}

/**
 * True if two labels describe the same physical arrangement.
 *
 * Specified labels: same arrangement iff their orders are in the same chiral
 * class (equal order indicators), because the winding convention is fixed.
 * Unspecified labels (`bonds` omitted) are equal to each other and never equal
 * to a specified label.
 */
export function sameTetrahedron(a: TetrahedralStereo, b: TetrahedralStereo): boolean {
  if (a.bonds === undefined || b.bonds === undefined) return a.bonds === b.bonds;
  return orderIndicator(a.bonds) === orderIndicator(b.bonds);
}

/**
 * Winding sense of the three trailing bonds of `stereo` when looking down a
 * different bond. Converts the label from its own viewpoint (looking down
 * `stereo.bonds[0]`, counterclockwise by convention) to "looking down
 * `targetBond`, with the remaining bonds in the given `order`".
 *
 * Throws if the label is unspecified.
 */
export function directionFromBond(
  stereo: TetrahedralStereo,
  targetBond: BondId,
  order: readonly [BondId, BondId, BondId],
): TetrahedralDirection {
  if (stereo.bonds === undefined) {
    throw new Error('directionFromBond: unspecified tetrahedral stereo');
  }
  const index = new Map<BondId, number>();
  stereo.bonds.forEach((id, i) => index.set(id, i));
  const t = index.get(targetBond);
  const a = index.get(order[0]);
  const b = index.get(order[1]);
  const c = index.get(order[2]);
  if (t === undefined || a === undefined || b === undefined || c === undefined) {
    throw new Error('directionFromBond: bond is not part of the tetrahedral label');
  }
  // Reference: the convention fixes the sense at (bonds[0]; bonds[1..3]) to
  // counterclockwise. Any other (viewpoint, order) keeps that sense iff its
  // permutation of the stored indices is even; an odd permutation mirrors it.
  return parityOfPermutation([t, a, b, c]) === 1 ? 'counterclockwise' : 'clockwise';
}

/**
 * SMILES chirality token for a label whose four bonds appear in `stringBonds`
 * order in the string (`stringBonds[0]` is the "from" bond - the neighbour
 * written before the chiral atom, or the implicit hydrogen when the chiral
 * atom opens the string). Daylight: `@` = anticlockwise, `@@` = clockwise.
 */
export function tokenForOrder(
  stereo: TetrahedralStereo,
  stringBonds: readonly [BondId, BondId, BondId, BondId],
): '@' | '@@' {
  const sense = directionFromBond(stereo, stringBonds[0], [
    stringBonds[1],
    stringBonds[2],
    stringBonds[3],
  ]);
  return sense === 'counterclockwise' ? '@' : '@@';
}
