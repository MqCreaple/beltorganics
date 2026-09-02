export interface EigenDecomposition {
  /** Eigenvalues in ascending order. */
  values: number[];
  /** Normalized eigenvectors corresponding to `values`. */
  vectors: number[][];
}

/**
 * Diagonalize a small real symmetric matrix with Jacobi rotations.
 *
 * Molecular pi systems are normally tiny, so this dependency-free O(n^3)
 * method is predictable and more than fast enough for game-scale graphs.
 */
export function symmetricEigenDecomposition(
  matrix: readonly (readonly number[])[],
): EigenDecomposition {
  const size = matrix.length;
  if (matrix.some((row) => row.length !== size))
    throw new Error("eigen: matrix must be square");
  if (size === 0) return { values: [], vectors: [] };
  const a = matrix.map((row, i) =>
    row.map((value, j) => {
      if (!Number.isFinite(value))
        throw new Error("eigen: matrix entries must be finite");
      if (Math.abs(value - matrix[j]![i]!) > 1e-10)
        throw new Error("eigen: matrix must be symmetric");
      return value;
    }),
  );
  const vectors = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => Number(row === column)),
  );
  const tolerance = 1e-12;
  const maximumIterations = Math.max(24, 40 * size * size);
  let converged = size === 1;

  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    let p = 0;
    let q = 0;
    let largest = 0;
    for (let i = 0; i < size; i += 1) {
      for (let j = i + 1; j < size; j += 1) {
        if (Math.abs(a[i]![j]!) > largest) {
          largest = Math.abs(a[i]![j]!);
          p = i;
          q = j;
        }
      }
    }
    if (largest < tolerance) {
      converged = true;
      break;
    }

    const angle = 0.5 * Math.atan2(2 * a[p]![q]!, a[q]![q]! - a[p]![p]!);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    a[p]![p] =
      cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    a[q]![q] =
      sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    a[p]![q] = 0;
    a[q]![p] = 0;
    for (let k = 0; k < size; k += 1) {
      if (k === p || k === q) continue;
      const akp = a[k]![p]!;
      const akq = a[k]![q]!;
      a[k]![p] = a[p]![k] = cosine * akp - sine * akq;
      a[k]![q] = a[q]![k] = sine * akp + cosine * akq;
    }
    for (let row = 0; row < size; row += 1) {
      const vip = vectors[row]![p]!;
      const viq = vectors[row]![q]!;
      vectors[row]![p] = cosine * vip - sine * viq;
      vectors[row]![q] = sine * vip + cosine * viq;
    }
  }
  if (!converged) throw new Error("eigen: Jacobi iteration did not converge");

  return Array.from({ length: size }, (_, column) => ({
    value: a[column]![column]!,
    vector: vectors.map((row) => row[column]!),
  }))
    .sort((first, second) => first.value - second.value)
    .reduce<EigenDecomposition>(
      (result, entry) => {
        const largestIndex = entry.vector.reduce(
          (best, value, index) =>
            Math.abs(value) > Math.abs(entry.vector[best]!) ? index : best,
          0,
        );
        if (entry.vector[largestIndex]! < 0)
          entry.vector = entry.vector.map((value) => -value);
        result.values.push(entry.value);
        result.vectors.push(entry.vector);
        return result;
      },
      { values: [], vectors: [] },
    );
}
