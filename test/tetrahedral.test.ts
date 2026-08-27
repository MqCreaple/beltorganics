import { describe, expect, it } from 'vitest';
import { directionFromBond, orderIndicator, sameTetrahedron, tokenForOrder } from '../src/chem';
import type { TetrahedralStereo } from '../src/chem';

/**
 * Geometric ground truth for the tetrahedral order-conversion functions.
 *
 * The tetrahedron has its centre at the origin and four substituent vertices
 * (chosen so that the reference label [e0,e1,e2,e3] - counterclockwise by the
 * fixed winding convention - matches this geometry):
 *
 *        v0 = (-1, -1, -1)
 *        v1 = (-1,  1,  1)
 *        v2 = ( 1, -1,  1)
 *        v3 = ( 1,  1, -1)
 *
 * Bond i connects the centre to vertex v_i. "Looking down bond a" means
 * looking from vertex v_a toward the centre (view direction d = -v_a), the
 * same viewpoint Daylight uses for `@` / `@@`. The other three vertices are
 * projected onto the plane perpendicular to d and their winding is read from
 * the signed triangle area in a right-handed screen basis (u, w, d) with
 * u x w = d: positive area = counterclockwise, negative = clockwise.
 *
 * The convention under test: a label [e0,e1,e2,e3] means "looking down e0,
 * (e1,e2,e3) wind counterclockwise". The mirror image is an odd permutation
 * of the order, so no direction field is stored.
 */

type Vec3 = [number, number, number];

const VERTICES: Vec3[] = [
  [-1, -1, -1],
  [-1, 1, 1],
  [1, -1, 1],
  [1, 1, -1],
];

const BONDS = ['e0', 'e1', 'e2', 'e3'];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / len, a[1]! / len, a[2]! / len];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0]! * s, a[1]! * s, a[2]! * s];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

/** Winding sense of vertices (b, c, d) when looking down bond a. */
function geometricSense(a: number, order: [number, number, number]): 'clockwise' | 'counterclockwise' {
  const d = normalize(scale(VERTICES[a]!, -1)); // from vertex a toward the centre
  // Right-handed screen basis (u, w, d) with u x w = d.
  const ref: Vec3 = Math.abs(d[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(ref, d));
  const w = cross(d, u);
  const project = (i: number): [number, number] => {
    const v = VERTICES[i]!;
    const p = subtract(v, scale(d, dot(v, d)));
    return [dot(p, u), dot(p, w)];
  };
  const [x1, y1] = project(order[0]!);
  const [x2, y2] = project(order[1]!);
  const [x3, y3] = project(order[2]!);
  const area = 0.5 * ((x2! - x1!) * (y3! - y1!) - (x3! - x1!) * (y2! - y1!));
  return area >= 0 ? 'counterclockwise' : 'clockwise';
}

/** All 24 permutations of [0, 1, 2, 3]. */
function permutations4(): [number, number, number, number][] {
  const result: [number, number, number, number][] = [];
  for (const a of [0, 1, 2, 3]) {
    for (const b of [0, 1, 2, 3]) {
      if (b === a) continue;
      for (const c of [0, 1, 2, 3]) {
        if (c === a || c === b) continue;
        for (const d of [0, 1, 2, 3]) {
          if (d !== a && d !== b && d !== c) result.push([a, b, c, d]);
        }
      }
    }
  }
  return result;
}

/** The reference label under the fixed counterclockwise convention. */
const LABEL: TetrahedralStereo = { bonds: [BONDS[0]!, BONDS[1]!, BONDS[2]!, BONDS[3]!] };

describe('tetrahedral order conversion', () => {
  it('directionFromBond matches the geometric winding for all 24 viewpoints/orders', () => {
    for (const [i, j, k, l] of permutations4()) {
      const expected = geometricSense(i, [j, k, l]);
      const actual = directionFromBond(LABEL, `e${i}`, [`e${j}`, `e${k}`, `e${l}`]);
      expect(actual, `looking down e${i}, order (e${j}, e${k}, e${l})`).toBe(expected);
    }
  });

  it('tokenForOrder maps the string order to @ (counterclockwise) / @@ (clockwise)', () => {
    // string order equal to the label's own order:
    expect(tokenForOrder(LABEL, ['e0', 'e1', 'e2', 'e3'])).toBe(
      geometricSense(0, [1, 2, 3]) === 'counterclockwise' ? '@' : '@@',
    );
    // an independent string order, checked against the geometry:
    const sense = geometricSense(1, [2, 3, 0]);
    expect(tokenForOrder(LABEL, ['e1', 'e2', 'e3', 'e0'])).toBe(sense === 'counterclockwise' ? '@' : '@@');
  });

  it('orderIndicator equals permutation parity relative to the sorted order', () => {
    for (const p of permutations4()) {
      const order = p.map((i) => `e${i}`);
      const positions = order.map((id) => [...order].sort().indexOf(id));
      let inversions = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          if ((positions[i] ?? 0) > (positions[j] ?? 0)) inversions++;
        }
      }
      const expected = inversions % 2 === 0 ? 1 : -1;
      expect(orderIndicator(order), order.join(',')).toBe(expected);
    }
  });

  it('orderIndicator is invariant under 3-cycles and flipped by odd permutations', () => {
    const base = orderIndicator(['e0', 'e1', 'e2', 'e3']);
    expect(orderIndicator(['e0', 'e2', 'e3', 'e1'])).toBe(base); // cycle (1 2 3)
    expect(orderIndicator(['e3', 'e0', 'e1', 'e2'])).toBe(base === 1 ? -1 : 1); // 4-cycle is odd
    expect(orderIndicator(['e1', 'e0', 'e2', 'e3'])).toBe(base === 1 ? -1 : 1); // a swap is odd
  });

  it('sameTetrahedron: even permutations are the same arrangement, odd ones are mirror images', () => {
    for (const [i, j, k, l] of permutations4()) {
      const order = [`e${i}`, `e${j}`, `e${k}`, `e${l}`] as [string, string, string, string];
      const same = sameTetrahedron(LABEL, { bonds: order });
      // Two specified orders are the same arrangement iff they share the order
      // indicator, which (per the geometry) is exactly when the geometric sense
      // at that (viewpoint, order) is counterclockwise - the fixed convention.
      expect(same, order.join(',')).toBe(orderIndicator(order) === orderIndicator(LABEL.bonds!));
      expect(same, order.join(',')).toBe(geometricSense(i, [j, k, l]) === 'counterclockwise');
    }
  });

  it('unspecified labels: equal to each other, never equal to a specified label', () => {
    expect(sameTetrahedron({}, {})).toBe(true);
    expect(sameTetrahedron({}, LABEL)).toBe(false);
    expect(sameTetrahedron(LABEL, {})).toBe(false);
    expect(() => directionFromBond({}, 'e0', ['e1', 'e2', 'e3'])).toThrow();
  });
});
