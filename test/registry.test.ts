import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoleculeRegistry } from '../src/chem';

describe('MoleculeRegistry rendered SVG cache', () => {
  it('caches display geometry and regenerates it after graph mutation', () => {
    const registry = new MoleculeRegistry();
    const first = registry.geometry('C#C');
    expect(registry.geometry('C#C')).toBe(first);
    expect(registry.geometryCount).toBe(1);

    const molecule = registry.get('C#C');
    molecule.setBondOrder(molecule.bonds()[0]!, 2);
    const changed = registry.geometry('C#C');
    expect(changed).not.toBe(first);
    expect(registry.geometryCount).toBe(1);
  });

  it('renders a structure-diagram SVG lazily and caches it', () => {
    const registry = new MoleculeRegistry();
    expect(registry.svgCount).toBe(0);

    const svg1 = registry.renderSvg('CCO');
    expect(svg1).toContain('<svg');
    expect(svg1).not.toMatch(/^<\?xml/); // XML declaration stripped for HTML embedding
    expect(svg1).not.toContain('#FFFFFF'); // RDKit's background rect removed; container owns the bg
    expect(registry.svgCount).toBe(1);

    const svg2 = registry.renderSvg('CCO');
    expect(svg2).toBe(svg1); // cached; no re-render
    expect(registry.svgCount).toBe(1);
  });

  it('renders each substance separately', () => {
    const registry = new MoleculeRegistry();
    const ethanol = registry.renderSvg('CCO');
    const benzene = registry.renderSvg('c1ccccc1');
    expect(ethanol).not.toBe(benzene);
    expect(registry.svgCount).toBe(2);
  });

  it('re-renders when the underlying molecule graph is mutated', () => {
    const registry = new MoleculeRegistry();
    const before = registry.renderSvg('C#C');
    const molecule = registry.get('C#C');
    molecule.setBondOrder(molecule.bonds()[0]!, 2); // acetylene -> ethene
    const after = registry.renderSvg('C#C');
    expect(after).not.toBe(before);
  });

  it('throws on unparseable SMILES', () => {
    const registry = new MoleculeRegistry();
    expect(() => registry.renderSvg('CCO(')).toThrow(/invalid SMILES/);
  });

  it('renders wedge/dashed bonds for chiral centres', () => {
    const registry = new MoleculeRegistry();
    const down = registry.renderSvg('N[C@@H](C)C(=O)O');
    const up = registry.renderSvg('N[C@H](C)C(=O)O');
    const plain = registry.renderSvg('CCO');
    // Enantiomers depict opposite wedges, so their SVGs must differ and each
    // must carry a wedge marker: a hatched/dashed wedge (thin lines) or a
    // filled triangle (a closed path).
    expect(down).not.toBe(up);
    expect(down.includes('stroke-width:1.0px') || /\bZ\b/.test(down)).toBe(true);
    expect(up.includes('stroke-width:1.0px') || /\bZ\b/.test(up)).toBe(true);
    // Non-chiral molecules show neither.
    expect(plain.includes('stroke-width:1.0px')).toBe(false);
    expect(/\bZ\b/.test(plain)).toBe(false);
  });

  it('renders wedges for ring chiral centres (proline, cholesterol)', () => {
    const registry = new MoleculeRegistry();
    const lPro = registry.renderSvg('C1C[C@H](NC1)C(=O)O');
    const dPro = registry.renderSvg('C1C[C@@H](NC1)C(=O)O');
    // Enantiomers depict opposite wedges, so the SVGs must differ and each
    // must carry a wedge marker (hatched/dashed wedge or a filled triangle).
    expect(lPro).not.toBe(dPro);
    expect(lPro.includes('stroke-width:1.0px') || /\bZ\b/.test(lPro)).toBe(true);
    expect(dPro.includes('stroke-width:1.0px') || /\bZ\b/.test(dPro)).toBe(true);
    const cholesterol = registry.renderSvg(
      'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C',
    );
    expect(cholesterol.includes('stroke-width:1.0px') || /\bZ\b/.test(cholesterol)).toBe(true);
  });

  it('clear() empties the molecule, SVG, and geometry caches', () => {
    const registry = new MoleculeRegistry();
    registry.renderSvg('CCO');
    registry.geometry('CCO');
    expect(registry.size).toBe(1);
    expect(registry.svgCount).toBe(1);
    expect(registry.geometryCount).toBe(1);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.svgCount).toBe(0);
    expect(registry.geometryCount).toBe(0);
  });
});

/** A fake fetch that dispatches on URL and records every call. */
function mockFetch(routes: Array<{ match: (url: string) => boolean; respond: () => Response }>) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const route = routes.find((r) => r.match(url));
    if (route === undefined) return new Response('Not Found', { status: 404 });
    return route.respond();
  };
  return { fetchFn, calls };
}

function pubchemName(name: string, iupac = name): () => Response {
  return () =>
    new Response(JSON.stringify({ PropertyTable: { Properties: [{ Title: name, IUPACName: iupac }] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

describe('MoleculeRegistry substance name lookup', () => {
  // The network-path tests use butane ('CCCC'), which is not otherwise known
  // to the registry, so they exercise the real PubChem -> CIR flow.
  const NETWORK_SUBSTANCE = 'CCCC';

  /** A shared in-memory SubstanceNameCache for cross-registry tests. */
  function sharedCache(): { cache: { get: (s: string) => unknown; set: (s: string, n: unknown) => void; clear: () => void }; map: Map<string, unknown> } {
    const map = new Map<string, unknown>();
    return {
      cache: {
        get: (s: string) => map.get(s),
        set: (s: string, n: unknown) => void map.set(s, n),
        clear: () => void map.clear(),
      },
      map,
    };
  }

  /** A minimal Storage implementation for testing the localStorage adapter. */
  function fakeLocalStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => void map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, String(value)),
    } as Storage;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches from PubChem and caches the name', async () => {
    const { fetchFn, calls } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: pubchemName('butane') },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBeUndefined();

    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBe('butane');
    expect(registry.substanceNameCount).toBe(1);

    // Second request is served from the session cache: PubChem is hit once.
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(calls.filter((u) => u.includes('pubchem')).length).toBe(1);
  });

  it('reuses a previously resolved mapping from the name cache without network', async () => {
    const { cache, map } = sharedCache();
    const first = new MoleculeRegistry({
      fetch: mockFetch([{ match: (u) => u.includes('pubchem'), respond: pubchemName('butane') }]).fetchFn,
      nameCache: cache as never,
    });
    await expect(first.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(map.size).toBe(1);

    // A fresh registry sharing the cache resolves without touching the network.
    const second = new MoleculeRegistry({
      fetch: async () => {
        throw new Error('network must not be used');
      },
      nameCache: cache as never,
    });
    await expect(second.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(second.substanceCommonName(NETWORK_SUBSTANCE)).toBe('butane');
    expect(second.substanceIupacName(NETWORK_SUBSTANCE)).toBe('butane');
  });

  it('persists resolved names to localStorage and reloads them', async () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);
    const first = new MoleculeRegistry({
      fetch: mockFetch([{ match: (u) => u.includes('pubchem'), respond: pubchemName('butane') }]).fetchFn,
    });
    await first.fetchSubstanceName(NETWORK_SUBSTANCE);

    const raw = storage.getItem('beltorganics:substance-names');
    expect(raw).not.toBeNull();
    // PubChem-sourced names are stored as bare strings (compact form).
    const parsed = JSON.parse(raw ?? '{}') as { v: number; names: Record<string, Record<string, unknown>> };
    expect(parsed.v).toBe(1);
    expect(parsed.names[NETWORK_SUBSTANCE]).toEqual({ common: 'butane', iupac: 'butane' });

    // A fresh registry (new session) reads the mapping from localStorage and
    // never hits the network.
    const second = new MoleculeRegistry({
      fetch: async () => {
        throw new Error('network must not be used');
      },
    });
    await expect(second.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(second.substanceIupacName(NETWORK_SUBSTANCE)).toBe('butane');
  });

  it('refreshes CIR-sourced names from PubChem when it becomes available', async () => {
    const { cache, map } = sharedCache();
    map.set(NETWORK_SUBSTANCE, {
      common: { value: 'butane', source: 'cir' },
      iupac: { value: 'butane', source: 'cir' },
    });
    const registry = new MoleculeRegistry({
      fetch: mockFetch([{ match: (u) => u.includes('pubchem'), respond: pubchemName('Butane', 'butane') }]).fetchFn,
      nameCache: cache as never,
    });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('Butane');
    // The upgraded mapping is persisted with the PubChem source.
    const stored = map.get(NETWORK_SUBSTANCE) as { common: { source: string }; iupac: { source: string } };
    expect(stored.common.source).toBe('pubchem');
    expect(stored.iupac.source).toBe('pubchem');
  });

  it('keeps the CIR-sourced name when PubChem is unavailable', async () => {
    const { cache, map } = sharedCache();
    map.set(NETWORK_SUBSTANCE, {
      common: { value: 'butane', source: 'cir' },
      iupac: { value: 'butane', source: 'cir' },
    });
    const registry = new MoleculeRegistry({
      fetch: mockFetch([{ match: (u) => u.includes('pubchem'), respond: () => new Response('Not Found', { status: 404 }) }]).fetchFn,
      nameCache: cache as never,
    });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    const stored = map.get(NETWORK_SUBSTANCE) as { common: { source: string } };
    expect(stored.common.source).toBe('cir'); // not upgraded
  });

  it('prefers the common name (Title) over the IUPAC name', async () => {
    const { fetchFn } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: pubchemName('Water', 'oxidane') },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('Water');
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBe('Water');
    expect(registry.substanceCommonName(NETWORK_SUBSTANCE)).toBe('Water');
    expect(registry.substanceIupacName(NETWORK_SUBSTANCE)).toBe('oxidane');
  });

  it('exposes a missing common name as undefined (IUPAC-only fallback)', async () => {
    const { fetchFn } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: pubchemName('', 'oxidane') },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('oxidane');
    expect(registry.substanceCommonName(NETWORK_SUBSTANCE)).toBeUndefined();
    expect(registry.substanceIupacName(NETWORK_SUBSTANCE)).toBe('oxidane');
  });

  it('fills a missing field independently from the NCI CIR fallback', async () => {
    const { fetchFn, calls } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: pubchemName('', 'butane') },
      { match: (u) => u.includes('/names'), respond: () => new Response('butane\n106-97-8\n', { status: 200 }) },
      { match: (u) => u.includes('/iupac_name'), respond: () => new Response('Not Found', { status: 404 }) },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    // PubChem gives the IUPAC name only; CIR supplies the missing common name
    // (the CAS-number line in the /names listing is skipped).
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(registry.substanceCommonName(NETWORK_SUBSTANCE)).toBe('butane');
    expect(registry.substanceIupacName(NETWORK_SUBSTANCE)).toBe('butane');
    expect(calls.some((u) => u.includes('pubchem'))).toBe(true);
    expect(calls.some((u) => u.includes('/names'))).toBe(true);
  });

  it('falls back to the NCI CIR when PubChem does not know the substance', async () => {
    const { fetchFn, calls } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: () => new Response('Not Found', { status: 404 }) },
      { match: (u) => u.includes('cactus'), respond: () => new Response('butane\n106-97-8\n', { status: 200 }) },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('butane');
    expect(calls.some((u) => u.includes('pubchem'))).toBe(true);
    expect(calls.some((u) => u.includes('cactus'))).toBe(true);
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBe('butane');
  });

  it('skips Markush markup and picks the next usable CIR name', async () => {
    const { fetchFn } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: () => new Response('Not Found', { status: 404 }) },
      {
        match: (u) => u.includes('/names'),
        respond: () => new Response('$l^{1}-azane\nazane\nAMMONIA\n7664-41-7\n', { status: 200 }),
      },
      { match: (u) => u.includes('/iupac_name'), respond: () => new Response('$l^{1}-azane\nazane', { status: 200 }) },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    // The Markush line and the CAS number are skipped; the next real name is used.
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBe('azane');
    expect(registry.substanceCommonName(NETWORK_SUBSTANCE)).toBe('azane');
    expect(registry.substanceIupacName(NETWORK_SUBSTANCE)).toBe('azane');
  });

  it('treats entirely unusable CIR names as missing', async () => {
    const { fetchFn } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: () => new Response('Not Found', { status: 404 }) },
      { match: (u) => u.includes('/names'), respond: () => new Response('$l^{1}-azane\n', { status: 200 }) },
      { match: (u) => u.includes('/iupac_name'), respond: () => new Response('$l^{1}-azane\n', { status: 200 }) },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    // Only Markush garbage came back, so both sides stay unknown.
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBeUndefined();
    expect(registry.substanceCommonName(NETWORK_SUBSTANCE)).toBeUndefined();
    expect(registry.substanceIupacName(NETWORK_SUBSTANCE)).toBeUndefined();
  });

  it('caches a failed lookup so the network is not hit again', async () => {
    const { fetchFn, calls } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: () => new Response('Not Found', { status: 404 }) },
      { match: (u) => u.includes('cactus'), respond: () => new Response('Not Found', { status: 404 }) },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBeUndefined();
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBeUndefined();

    await expect(registry.fetchSubstanceName(NETWORK_SUBSTANCE)).resolves.toBeUndefined();
    expect(calls.length).toBe(3); // pubchem + cir name + cir iupac_name, once each
  });

  it('clear() empties the iupac cache', async () => {
    const { fetchFn } = mockFetch([
      { match: (u) => u.includes('pubchem'), respond: pubchemName('butane') },
    ]);
    const registry = new MoleculeRegistry({ fetch: fetchFn });
    await registry.fetchSubstanceName(NETWORK_SUBSTANCE);
    expect(registry.substanceNameCount).toBe(1);
    registry.clear();
    expect(registry.substanceNameCount).toBe(0);
    expect(registry.substanceName(NETWORK_SUBSTANCE)).toBeUndefined();
  });
});
