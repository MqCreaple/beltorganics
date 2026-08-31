import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  angleDegrees,
  applyDistanceConstraint,
  bestFitPlane,
  centerPointMap,
  flattenPointMap,
  normalized,
  perpendicular,
  rotateFromTo,
  segmentDistance,
} from '../src/math';

describe('shared Vector3 math', () => {
  it('normalizes without mutating inputs and handles a zero vector', () => {
    const input = new Vector3(3, 0, 0);
    expect(normalized(input)).toEqual(new Vector3(1, 0, 0));
    expect(input).toEqual(new Vector3(3, 0, 0));
    expect(normalized(new Vector3())).toEqual(new Vector3(1, 0, 0));
  });

  it('builds perpendicular directions and rotates between axes', () => {
    const axis = new Vector3(1, 2, 3);
    expect(perpendicular(axis).dot(axis)).toBeCloseTo(0, 12);
    const rotated = rotateFromTo(new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
    expect(rotated.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
  });

  it('fits and projects a point map onto a plane', () => {
    const positions = new Map([
      ['a', new Vector3(0, 0, 0.1)],
      ['b', new Vector3(1, 0, -0.1)],
      ['c', new Vector3(0, 1, 0.1)],
      ['d', new Vector3(1, 1, -0.1)],
    ]);
    flattenPointMap(positions, [...positions.keys()], 1);
    const plane = bestFitPlane([...positions.values()]);
    for (const point of positions.values()) {
      expect(Math.abs(point.clone().sub(plane.center).dot(plane.normal))).toBeLessThan(1e-10);
    }
  });

  it('solves distances, segment proximity, angles, and centering', () => {
    const positions = new Map([
      ['a', new Vector3(0, 0, 0)],
      ['b', new Vector3(2, 0, 0)],
    ]);
    applyDistanceConstraint(positions, { a: 'a', b: 'b', distance: 1, strength: 1 });
    expect(positions.get('a')!.distanceTo(positions.get('b')!)).toBeCloseTo(1);
    centerPointMap(positions);
    expect(positions.get('a')!.clone().add(positions.get('b')!).length()).toBeLessThan(1e-12);
    expect(angleDegrees(new Vector3(1, 0, 0), new Vector3(), new Vector3(0, 1, 0))).toBeCloseTo(90);
    expect(segmentDistance(
      new Vector3(-1, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, -1, 1),
      new Vector3(0, 1, 1),
    ).distance).toBeCloseTo(1);
  });
});
