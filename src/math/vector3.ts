import { Quaternion, Vector3 } from 'three';

const AXES = [
  new Vector3(0, 0, 1),
  new Vector3(0, 1, 0),
  new Vector3(1, 0, 0),
] as const;

export interface DistanceConstraint<Key> {
  a: Key;
  b: Key;
  distance: number;
  strength: number;
}

export interface SegmentDistance {
  distance: number;
  firstT: number;
  secondT: number;
  delta: Vector3;
}

/** Normalize a copy, using a deterministic axis for a degenerate vector. */
export function normalized(vector: Vector3, fallback = new Vector3(1, 0, 0)): Vector3 {
  return vector.lengthSq() < 1e-18 ? fallback.clone().normalize() : vector.clone().normalize();
}

/** A deterministic unit vector perpendicular to the supplied axis. */
export function perpendicular(axis: Vector3, salt = 0): Vector3 {
  const direction = normalized(axis);
  let reference = AXES[salt % AXES.length]!;
  if (Math.abs(direction.dot(reference)) > 0.85) reference = AXES[(salt + 1) % AXES.length]!;
  return new Vector3().crossVectors(direction, reference).normalize();
}

export function rotateAroundAxis(vector: Vector3, axis: Vector3, radians: number): Vector3 {
  return vector.clone().applyAxisAngle(normalized(axis), radians).normalize();
}

export function spreadAround(
  direction: Vector3,
  axis: Vector3,
  count: number,
  span: number,
): Vector3[] {
  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 0 : index / (count - 1) - 0.5;
    return rotateAroundAxis(direction, axis, fraction * span);
  });
}

export function rotateFromTo(vector: Vector3, from: Vector3, to: Vector3): Vector3 {
  const rotation = new Quaternion().setFromUnitVectors(normalized(from), normalized(to));
  return vector.clone().applyQuaternion(rotation);
}

export function canonicalNormal(normal: Vector3): Vector3 {
  const result = normalized(normal);
  return result.z < 0 || (Math.abs(result.z) < 1e-6 && result.y < 0)
    ? result.multiplyScalar(-1)
    : result;
}

/** Least-squares plane through three or more points. */
export function bestFitPlane(points: readonly Vector3[]): { center: Vector3; normal: Vector3 } {
  const center = points.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / points.length);
  let xx = 0; let xy = 0; let xz = 0; let yy = 0; let yz = 0; let zz = 0;
  for (const point of points) {
    const offset = point.clone().sub(center);
    xx += offset.x * offset.x; xy += offset.x * offset.y; xz += offset.x * offset.z;
    yy += offset.y * offset.y; yz += offset.y * offset.z; zz += offset.z * offset.z;
  }
  let normal = normalized(new Vector3().crossVectors(
    points[1]!.clone().sub(points[0]!),
    points[2]!.clone().sub(points[0]!),
  ));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const scale = Math.max(xx + yy + zz, 1);
    const old = normal;
    normal = normalized(new Vector3(
      old.x - (xx * old.x + xy * old.y + xz * old.z) / scale,
      old.y - (xy * old.x + yy * old.y + yz * old.z) / scale,
      old.z - (xz * old.x + yz * old.y + zz * old.z) / scale,
    ));
  }
  return { center, normal };
}

export function flattenPointMap<Key>(
  positions: Map<Key, Vector3>,
  keys: readonly Key[],
  strength: number,
): void {
  const plane = bestFitPlane(keys.map((key) => positions.get(key)!));
  for (const key of keys) {
    const point = positions.get(key)!;
    const distance = point.clone().sub(plane.center).dot(plane.normal);
    positions.set(key, point.clone().addScaledVector(plane.normal, -distance * strength));
  }
}

export function applyDistanceConstraint<Key>(
  positions: Map<Key, Vector3>,
  item: DistanceConstraint<Key>,
  fallback = new Vector3(1, 0, 0),
): void {
  const first = positions.get(item.a)!;
  const second = positions.get(item.b)!;
  let delta = second.clone().sub(first);
  let length = delta.length();
  if (length < 1e-8) {
    delta = normalized(fallback);
    length = 1;
  }
  const correction = delta.multiplyScalar(
    ((length - item.distance) / length) * 0.5 * item.strength,
  );
  positions.set(item.a, first.clone().add(correction));
  positions.set(item.b, second.clone().sub(correction));
}

export function segmentDistance(
  a0: Vector3,
  a1: Vector3,
  b0: Vector3,
  b1: Vector3,
): SegmentDistance {
  const u = a1.clone().sub(a0);
  const v = b1.clone().sub(b0);
  const w = a0.clone().sub(b0);
  const aa = u.dot(u); const bb = u.dot(v); const cc = v.dot(v);
  const dd = u.dot(w); const ee = v.dot(w); const denominator = aa * cc - bb * bb;
  let firstT = denominator < 1e-10 ? 0.5 : (bb * ee - cc * dd) / denominator;
  let secondT = denominator < 1e-10 ? 0.5 : (aa * ee - bb * dd) / denominator;
  firstT = Math.max(0, Math.min(1, firstT));
  secondT = Math.max(0, Math.min(1, secondT));
  firstT = Math.max(0, Math.min(1, (bb * secondT - dd) / Math.max(aa, 1e-10)));
  secondT = Math.max(0, Math.min(1, (bb * firstT + ee) / Math.max(cc, 1e-10)));
  const delta = a0.clone().addScaledVector(u, firstT).sub(b0.clone().addScaledVector(v, secondT));
  return { distance: delta.length(), firstT, secondT, delta };
}

export function angleDegrees(a: Vector3, center: Vector3, b: Vector3): number {
  return a.clone().sub(center).angleTo(b.clone().sub(center)) * 180 / Math.PI;
}

export function signedTetrahedralVolume(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
): number {
  const first = b.clone().sub(a);
  const second = c.clone().sub(a);
  const third = d.clone().sub(a);
  return first.dot(new Vector3().crossVectors(second, third));
}

export function centerPointMap<Key>(positions: Map<Key, Vector3>): void {
  if (positions.size === 0) return;
  const center = [...positions.values()]
    .reduce((sum, point) => sum.add(point), new Vector3())
    .multiplyScalar(1 / positions.size);
  for (const [key, point] of positions) positions.set(key, point.clone().sub(center));
}
