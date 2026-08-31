import { parseSmiles } from './smiles';
import { generateMoleculeGeometry } from './geometry';
import type { Molecule } from './molecule';
import type { MoleculeGeometry } from './geometry';
import { getRdkitModule } from './rdkit';
import type { RDMolecule } from './rdkit';

/** Fetch function injected for tests (defaults to the global `fetch`); the
 * registry only ever requests plain string URLs. */
type FetchFn = (url: string) => Promise<Response>;

/**
 * A rendered structure diagram for one SMILES string, lazily produced and
 * tied to the RDKit molecule it was drawn from.
 *
 * The `rdkit` reference is the exact `Molecule.getRdkitMolecule()` snapshot
 * that produced `svg`: a later structural mutation of the game graph rebuilds
 * the snapshot (a *new* object identity), so the cache can tell when the
 * diagram is stale without re-rendering on every access.
 */
interface SvgCacheEntry {
  svg: string;
  rdkit: RDMolecule;
}

interface GeometryCacheEntry {
  geometry: MoleculeGeometry;
  /** Structural snapshot used to detect mutation, as for the SVG cache. */
  rdkit: RDMolecule;
}

/**
 * Global mapping from SMILES strings to molecule graphs (world groundwork;
 * see docs/game-world.md).
 *
 * Within the game every molecule is stored as its SMILES string; the graph
 * object for a substance is materialized once, on first use, and cached here
 * so all systems (source blocks, later belts/chambers) share a single
 * Molecule instance per substance. The registry is the single source of
 * truth for string -> graph in the game.
 *
 * The registry also owns each substance's lazily generated 3D display
 * conformer and rendered structure-diagram SVG. Both are tied to the
 * molecule's cached RDKit snapshot, reused afterwards, and invalidated
 * automatically when the underlying graph changes.
 */
export interface MoleculeRegistryOptions {
  /** Fetch implementation (injectable for tests); defaults to global fetch. */
  fetch?: FetchFn;
  /**
   * Persistent SMILES -> names store (injectable for tests). Defaults to a
   * localStorage-backed cache in the browser (so resolved names survive
   * reloads) and a fresh in-memory cache elsewhere (Node).
   */
  nameCache?: SubstanceNameCache;
}

export class MoleculeRegistry {
  readonly #molecules = new Map<string, Molecule>();
  readonly #svgCache = new Map<string, SvgCacheEntry>();
  readonly #geometryCache = new Map<string, GeometryCacheEntry>();
  readonly #substanceNames = new Map<string, string | undefined>();
  readonly #substanceCommon = new Map<string, string | undefined>();
  readonly #substanceIupac = new Map<string, string | undefined>();
  readonly #substanceNamePromises = new Map<string, Promise<string | undefined>>();
  readonly #fetch: FetchFn;
  readonly #nameCache: SubstanceNameCache;

  constructor(options: MoleculeRegistryOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#nameCache = options.nameCache ?? createDefaultNameCache();
  }

  /** The molecule graph for a SMILES string, parsed on first use and cached. */
  get(smiles: string): Molecule {
    const cached = this.#molecules.get(smiles);
    if (cached !== undefined) return cached;
    const molecule = parseSmiles(smiles);
    this.#molecules.set(smiles, molecule);
    return molecule;
  }

  has(smiles: string): boolean {
    return this.#molecules.has(smiles);
  }

  /** Number of distinct SMILES strings materialized so far. */
  get size(): number {
    return this.#molecules.size;
  }

  /**
   * Deterministic display conformer, generated lazily once per substance.
   * The RDKit snapshot identity changes after any graph mutation, providing
   * the same automatic invalidation rule used by the structure-SVG cache.
   */
  geometry(smiles: string): MoleculeGeometry {
    const molecule = this.get(smiles);
    const rdkit = molecule.getRdkitMolecule();
    const cached = this.#geometryCache.get(smiles);
    if (cached !== undefined && cached.rdkit === rdkit) return cached.geometry;
    const geometry = generateMoleculeGeometry(molecule);
    this.#geometryCache.set(smiles, { geometry, rdkit });
    return geometry;
  }

  /** Number of display conformers cached so far. */
  get geometryCount(): number {
    return this.#geometryCache.size;
  }

  /**
   * The structure-diagram SVG for a SMILES string, rendered lazily on first
   * use and cached (see `SvgCacheEntry` for the staleness rule).
   *
   * Rendering delegates to RDKit's `get_svg()` on the molecule's cached RDKit
   * representation (`Molecule.getRdkitMolecule()`), so a substance whose
   * diagram is already cached costs a map lookup. The SVG itself keeps a
   * transparent background so it stays usable anywhere it is embedded; the
   * hosting panel provides a light container so the black structure strokes
   * stay visible. Throws when the SMILES cannot be parsed or RDKit cannot
   * build the molecule.
   */
  renderSvg(smiles: string): string {
    const molecule = this.get(smiles);
    const rdkit = molecule.getRdkitMolecule();
    const cached = this.#svgCache.get(smiles);
    if (cached !== undefined && cached.rdkit === rdkit) return cached.svg;

    // Round-trip through the molblock: RDKit assigns explicit wedge/dash bond
    // directions when it serializes a chiral centre, so the structure diagram
    // shows tetrahedral stereochemistry. (Its plain get_svg on a SMILES-built
    // molecule only draws one of the two wedge directions.)
    const depicted = getRdkitModule().get_mol(rdkit.get_molblock());
    if (depicted === null) {
      throw new Error(`renderSvg: RDKit could not depict "${smiles}"`);
    }
    let svg: string;
    try {
      svg = sanitizeSvg(depicted.get_svg());
    } finally {
      depicted.delete();
    }
    this.#svgCache.set(smiles, { svg, rdkit });
    return svg;
  }

  /** Number of rendered structure diagrams cached so far. */
  get svgCount(): number {
    return this.#svgCache.size;
  }

  /**
   * The substance's display name for a SMILES string: the common name when
   * one is available (PubChem's `Title`), otherwise the IUPAC name. Looked up
   * lazily from PubChem's PUG REST API; the NCI Chemical Identifier Resolver
   * fills any field PubChem leaves empty (or returns unusable). Every resolved
   * name is recorded with its source (PubChem or CIR) and persisted in the
   * registry's name cache (localStorage in the browser). A name that came from
   * CIR is re-checked against PubChem on the next lookup, so it is upgraded to
   * PubChem's name once the API becomes available; fully PubChem-sourced
   * substances are never re-queried. Names are sanitized (Markush markup
   * rejected). Returns undefined when no source knows the substance.
   */
  fetchSubstanceName(smiles: string): Promise<string | undefined> {
    if (this.#substanceNames.has(smiles)) {
      return Promise.resolve(this.#substanceNames.get(smiles));
    }
    const pending = this.#substanceNamePromises.get(smiles);
    if (pending !== undefined) return pending;
    const promise = (async () => {
      const cached = this.#nameCache.get(smiles);
      // Both names already came from PubChem: nothing to refresh.
      if (cached?.common?.source === 'pubchem' && cached.iupac?.source === 'pubchem') {
        this.#substanceCommon.set(smiles, cached.common.value);
        this.#substanceIupac.set(smiles, cached.iupac.value);
        const display = cached.common.value;
        this.#substanceNames.set(smiles, display);
        return display;
      }
      // A cached mapping with CIR-sourced (or missing) names: ask PubChem
      // again in case it is available now, upgrading those names.
      const pubchem = await substanceNameFromPubChem(smiles, this.#fetch);
      let common = pubchem.common ?? cached?.common;
      let iupac = pubchem.iupac ?? cached?.iupac;
      // Fill anything still missing from the CIR fallback.
      if (common === undefined || iupac === undefined) {
        const cir = await substanceNameFromCIR(smiles, this.#fetch);
        if (common === undefined) common = cir.common;
        if (iupac === undefined) iupac = cir.iupac;
      }
      // Persist the resolved mapping (with sources) so future sessions skip
      // the network; a completely unknown substance is not persisted.
      if (common !== undefined || iupac !== undefined) {
        this.#nameCache.set(smiles, { common, iupac });
      }
      this.#substanceCommon.set(smiles, common?.value);
      this.#substanceIupac.set(smiles, iupac?.value);
      const display = common?.value ?? iupac?.value;
      this.#substanceNames.set(smiles, display);
      return display;
    })().finally(() => {
      this.#substanceNamePromises.delete(smiles);
    });
    this.#substanceNamePromises.set(smiles, promise);
    return promise;
  }

  /** Synchronous access to a resolved substance name (common, else IUPAC;
   * undefined if not fetched yet or unknown). */
  substanceName(smiles: string): string | undefined {
    return this.#substanceNames.get(smiles);
  }

  /** Synchronous access to the resolved common name (PubChem `Title`), if any. */
  substanceCommonName(smiles: string): string | undefined {
    return this.#substanceCommon.get(smiles);
  }

  /** Synchronous access to the resolved IUPAC name, if any. */
  substanceIupacName(smiles: string): string | undefined {
    return this.#substanceIupac.get(smiles);
  }

  /** Number of SMILES strings with a resolved (or failed) name lookup. */
  get substanceNameCount(): number {
    return this.#substanceNames.size;
  }

  clear(): void {
    this.#molecules.clear();
    this.#svgCache.clear();
    this.#geometryCache.clear();
    this.#substanceNames.clear();
    this.#substanceCommon.clear();
    this.#substanceIupac.clear();
    this.#substanceNamePromises.clear();
    this.#nameCache.clear();
  }
}

/** A resolved pair of names; either side may be missing. */
/** A resolved name plus where it came from (PubChem is the default). */
interface ResolvedName {
  value: string;
  source: 'pubchem' | 'cir';
}

/** A resolved pair of names; either side may be missing. */
interface SubstanceNames {
  common?: ResolvedName;
  iupac?: ResolvedName;
}

/**
 * Cleans a name returned by a network service so it is fit to display:
 * trims, collapses internal whitespace/newlines to single spaces, and rejects
 * empty or unusable strings. In particular, PubChem/CIR sometimes return
 * Markush / isotope markup (e.g. `$l^{1}-azane`) or multi-line
 * concatenations that are not a clean name; those are treated as missing so a
 * better fallback can supply the name.
 */
function sanitizeName(name: string): string | undefined {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return undefined;
  if (/\$l\^\{/.test(cleaned)) return undefined; // Markush isotope markup, not a name
  return cleaned;
}

/** A sanitized name tagged with its source, or undefined when unusable. */
function nameOf(raw: string, source: 'pubchem' | 'cir'): ResolvedName | undefined {
  const value = sanitizeName(raw);
  return value === undefined ? undefined : { value, source };
}

/**
 * The SMILES -> { common, iupac } mapping the registry resolves and persists,
 * so a substance's names survive reloads and are never re-fetched.
 */
export interface SubstanceNameCache {
  get(smiles: string): SubstanceNames | undefined;
  set(smiles: string, names: SubstanceNames): void;
  clear(): void;
}

/** In-memory name cache (Node / tests / when localStorage is unavailable). */
class MemoryNameCache implements SubstanceNameCache {
  readonly #names = new Map<string, SubstanceNames>();

  get(smiles: string): SubstanceNames | undefined {
    const names = this.#names.get(smiles);
    return names === undefined ? undefined : { common: names.common, iupac: names.iupac };
  }

  set(smiles: string, names: SubstanceNames): void {
    this.#names.set(smiles, { common: names.common, iupac: names.iupac });
  }

  clear(): void {
    this.#names.clear();
  }

  /** Iterate the stored mappings (used by the localStorage adapter). */
  entries(): IterableIterator<[string, SubstanceNames]> {
    return this.#names.entries();
  }
}

/**
 * localStorage-backed name cache (the browser default): the whole mapping is
 * stored under one key as JSON, so every resolved substance survives reloads.
 * Storage errors (private mode, quota, disabled storage) degrade gracefully to
 * in-memory behaviour instead of throwing.
 */
class LocalStorageNameCache implements SubstanceNameCache {
  static readonly STORAGE_KEY = 'beltorganics:substance-names';

  readonly #memory = new MemoryNameCache();
  readonly #storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null;

  constructor() {
    this.#load();
  }

  get(smiles: string): SubstanceNames | undefined {
    return this.#memory.get(smiles);
  }

  set(smiles: string, names: SubstanceNames): void {
    this.#memory.set(smiles, names);
    this.#save();
  }

  clear(): void {
    this.#memory.clear();
    try {
      this.#storage?.removeItem(LocalStorageNameCache.STORAGE_KEY);
    } catch {
      // Storage unavailable; the in-memory copy is already cleared.
    }
  }

  #load(): void {
    try {
      const raw = this.#storage?.getItem(LocalStorageNameCache.STORAGE_KEY);
      if (raw === null || raw === undefined) return;
      const parsed = JSON.parse(raw) as { v?: number; names?: Record<string, Record<string, unknown>> };
      if (parsed.names === undefined) return;
      for (const [smiles, entry] of Object.entries(parsed.names)) {
        const common = parseName(entry.common);
        const iupac = parseName(entry.iupac);
        if (common === undefined && iupac === undefined) continue;
        this.#memory.set(smiles, { ...(common !== undefined ? { common } : {}), ...(iupac !== undefined ? { iupac } : {}) });
      }
    } catch {
      // Corrupt or unreadable storage: start empty.
    }
  }

  #save(): void {
    try {
      const payload = JSON.stringify({
        v: 1,
        names: Object.fromEntries(
          [...this.#memory.entries()].map(([smiles, names]) => [
            smiles,
            {
              ...(names.common !== undefined ? { common: serializeName(names.common) } : {}),
              ...(names.iupac !== undefined ? { iupac: serializeName(names.iupac) } : {}),
            },
          ]),
        ),
      });
      this.#storage?.setItem(LocalStorageNameCache.STORAGE_KEY, payload);
    } catch {
      // Storage full or unavailable: keep the in-memory copy.
    }
  }
}

/** The default cache: localStorage in the browser, in-memory elsewhere. */
function createDefaultNameCache(): SubstanceNameCache {
  if (typeof localStorage !== 'undefined') return new LocalStorageNameCache();
  return new MemoryNameCache();
}


/**
 * Compact serialized form of a resolved name. A bare string means the name
 * came from PubChem (the default); CIR-sourced names carry a short object so
 * the cache records their source and can upgrade them later.
 */
type SerializedName = string | { v: string; s: 'cir' };

function serializeName(name: ResolvedName | undefined): SerializedName | undefined {
  if (name === undefined) return undefined;
  return name.source === 'cir' ? { v: name.value, s: 'cir' } : name.value;
}

function parseName(field: unknown): ResolvedName | undefined {
  if (typeof field === 'string') {
    const value = sanitizeName(field);
    return value === undefined ? undefined : { value, source: 'pubchem' };
  }
  if (typeof field === 'object' && field !== null) {
    const record = field as { v?: unknown; s?: unknown };
    const value = sanitizeName(typeof record.v === 'string' ? record.v : '');
    if (value === undefined) return undefined;
    return { value, source: record.s === 'cir' ? 'cir' : 'pubchem' };
  }
  return undefined;
}

/**
 * PubChem PUG REST: `.../property/Title,IUPACName/JSON` in one request. The
 * Title is PubChem's preferred (common) name; the IUPAC name is separate so
 * the panel can show both.
 */
async function substanceNameFromPubChem(smiles: string, fetchFn: FetchFn): Promise<SubstanceNames> {
  const url =
    'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/' +
    `${encodeURIComponent(smiles)}/property/Title,IUPACName/JSON`;
  const response = await fetchFn(url);
  if (!response.ok) return {};
  const data = (await response.json()) as {
    PropertyTable?: { Properties?: Array<{ Title?: string; IUPACName?: string }> };
  };
  const properties = data.PropertyTable?.Properties?.[0];
  return {
    common: nameOf(properties?.Title ?? '', 'pubchem'),
    iupac: nameOf(properties?.IUPACName ?? '', 'pubchem'),
  };
}

/**
 * NCI Chemical Identifier Resolver: the common `names` listing and the
 * `iupac_name`. Either endpoint may be unavailable; failed requests simply
 * leave that side missing. `/names` returns the substance's names
 * (systematic, common and synonyms), one per line - the first usable,
 * non-CAS name is taken as the common name.
 */
async function substanceNameFromCIR(smiles: string, fetchFn: FetchFn): Promise<SubstanceNames> {
  const base = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}`;
  const result: SubstanceNames = {};
  const namesResponse = await fetchFn(`${base}/names`);
  if (namesResponse.ok) {
    const name = firstUsableName(await namesResponse.text(), true);
    if (name !== undefined) result.common = { value: name, source: 'cir' };
  }
  const iupacResponse = await fetchFn(`${base}/iupac_name`);
  if (iupacResponse.ok) {
    const name = firstUsableName(await iupacResponse.text(), false);
    if (name !== undefined) result.iupac = { value: name, source: 'cir' };
  }
  return result;
}

/**
 * The first usable name from a multi-line CIR response: sanitized, skipping
 * Markush markup and (for the common-name listing) CAS-number lines.
 */
function firstUsableName(text: string, skipCasNumbers: boolean): string | undefined {
  for (const line of text.split('\n')) {
    const name = sanitizeName(line);
    if (name === undefined) continue;
    if (skipCasNumbers && /^[\d-]+$/.test(name)) continue;
    return name;
  }
  return undefined;
}

/**
 * Prepares RDKit's SVG for embedding into HTML: strips the XML declaration
 * and the white background rectangle RDKit draws by default (the hosting
 * container supplies the background).
 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    // RDKit's background rect is an open/close pair, not self-closing.
    .replace(/<rect[^>]*fill:['"]?#FFFFFF['"]?[^>]*>[\s\S]*?<\/rect>/, '');
}

/** The process-wide molecule registry used by the game. */
export const moleculeRegistry = new MoleculeRegistry();
