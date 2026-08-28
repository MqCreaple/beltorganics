/**
 * Browser shim for Node's `process` global.
 *
 * `openchem` (a Node-oriented library) reads `process.env.*` and browsers have
 * no `process`, so importing it throws `ReferenceError: process is not
 * defined` (verified in the dev server: the crash was
 * `debugSmarts = !!process.env.OPENCHEM_DEBUG_SMARTS` running inside
 * `init_openchem()` at module scope). This module installs a minimal stub
 * before any openchem code runs.
 *
 * Findings from reading openchem's bundled source (2026-08-28):
 *
 * - Everything openchem executes reads `process.env.<FLAG>` as a boolean to
 *   gate its own debug logging. The flags are:
 *     - `OPENCHEM_DEBUG_SMARTS` (1 read, at module init - the crash site)
 *     - `VERBOSE` (~1340 reads; ring perception, aromaticity, IUPAC naming,
 *       SDF, ...)
 *     - `OPENCHEM_DEBUG_TAUTOMER` (5 reads; tautomer enumeration)
 *     - `DEBUG_ALDEHYDE` (1 read; aldehyde perception)
 *   There is NO `process.env.NODE_ENV` usage.
 * - `process.cwd()` (3 calls) only appears in lazy, Node-only file loaders
 *   that the game never reaches and a browser cannot run anyway: the InChI
 *   WASM loader (`await import("fs")` + `join(process.cwd(), "...wasm")`) and
 *   the OPSIN IUPAC-rules fallback (`fs.readFileSync` inside a try/catch, so
 *   a missing `cwd` is swallowed). SMILES parse/generate never touches it.
 * - openchem bundles a browserify-style `process` polyfill object (env: {},
 *   argv: [], cwd: () => "/", binding/chdir stubs that throw) but never wires
 *   it to the global - which is exactly why the browser crashed.
 *
 * Conclusion: an empty `{ env: {} }` is sufficient and correct. Every flag
 * openchem reads becomes `undefined` (falsy), i.e. "all openchem debug output
 * off" - the intended production default. No other process members are needed
 * for the code paths the game uses, so the stub below stays minimal on
 * purpose. (To debug openchem internals later, set
 * `process = { env: { VERBOSE: "1", OPENCHEM_DEBUG_SMARTS: "1" } }` here.)
 *
 * It must be the FIRST import in the web entry (`src/main.ts`): ES module
 * side-effect imports evaluate in source order, so this runs before the
 * chemistry engine (and thus openchem) is loaded. The library entry
 * (`src/index.ts`) deliberately does NOT import this - it stays
 * Node-importable.
 */
const globalScope = globalThis as { process?: { env: Record<string, string | undefined> } };

if (typeof globalScope.process === 'undefined') {
  globalScope.process = { env: {} };
}

export {};