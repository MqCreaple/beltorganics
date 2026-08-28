import initRDKitModule from '@rdkit/rdkit';
import type { JSMol, RDKitModule, RDKitLoader } from '@rdkit/rdkit';
import wasmUrl from '@rdkit/rdkit/dist/RDKit_minimal.wasm?url';

/**
 * RDKit.js (WASM) module loading for BeltOrganics.
 *
 * The RDKit WASM module loads asynchronously; every chemistry function that
 * needs it (parseSmiles, toSmiles via `Molecule.getRdkitMolecule`, the
 * registry's `renderSvg`) requires `initRdkit()` to have been awaited first
 * (the web entry does this at startup; tests via `test/setup.ts`).
 *
 * The `.wasm` binary is resolved per environment:
 * - browser: Vite emits the asset imported below with `?url` and serves it;
 * - Node (Vitest): the file is resolved next to the package on disk.
 */
export type { JSMol as RDMolecule, RDKitModule } from '@rdkit/rdkit';

// The package ships no default-export type for its UMD entry; at runtime the
// default export is the RDKit loader (verified against the packaged build).
const loadModule = initRDKitModule as unknown as RDKitLoader;

let modulePromise: Promise<RDKitModule> | null = null;
let module: RDKitModule | null = null;

async function wasmLocator(): Promise<() => string> {
  // Node (Vitest / SSR): resolve the wasm binary from the package on disk.
  if (typeof window === 'undefined') {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve('@rdkit/rdkit/dist/RDKit_minimal.wasm');
    return () => wasmPath;
  }
  // Browser: Vite serves the wasm as a hashed asset.
  return () => wasmUrl;
}

/**
 * Loads (once) and returns the RDKit module. Safe to call repeatedly; the
 * module is cached after the first successful load.
 */
export function initRdkit(): Promise<RDKitModule> {
  if (modulePromise === null) {
    modulePromise = (async () => {
      const locateFile = await wasmLocator();
      const loaded = await loadModule({ locateFile });
      module = loaded;
      return loaded;
    })();
    // Allow a failed load to be retried.
    modulePromise.catch(() => {
      modulePromise = null;
      module = null;
    });
  }
  return modulePromise;
}

/**
 * The already-initialized RDKit module, or throws when `initRdkit()` has not
 * been awaited yet. Used by synchronous paths (`Molecule.getRdkitMolecule`).
 */
export function getRdkitModule(): RDKitModule {
  if (module === null) {
    throw new Error('RDKit is not initialized; await initRdkit() before using the chemistry engine');
  }
  return module;
}
