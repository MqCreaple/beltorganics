import { beforeAll } from 'vitest';
import { initRdkit } from '../src/chem';

// The chemistry engine is backed by RDKit (WASM), which loads asynchronously.
// Initialize it once before any test file runs.
beforeAll(async () => {
  await initRdkit();
}, 60000);
