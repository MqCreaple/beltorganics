import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ELEMENTS,
  conjugatedPiSystems,
  generateMoleculeGeometry,
  hybridizationOf,
  partialCharges,
} from '../../chem';
import type { AtomId, ElementSymbol, Molecule, Point3D } from '../../chem';

export type MoleculeViewerLayer =
  | 'structure'
  | 'geometry'
  | 'charge'
  | 'density'
  | 'orbitals';
export type MoleculeRepresentation = 'ball-stick' | 'space-fill';

export interface MoleculeViewer3DProps {
  molecule: Molecule;
}

const LAYERS: ReadonlyArray<{ value: MoleculeViewerLayer; label: string }> = [
  { value: 'structure', label: 'Structure' },
  { value: 'geometry', label: 'Hybridization' },
  { value: 'charge', label: 'Charge' },
  { value: 'density', label: 'Electron cloud' },
  { value: 'orbitals', label: 'π orbitals' },
];

const ELEMENT_COLOR: Record<ElementSymbol, number> = {
  C: 0x343b45,
  H: 0xf0f3f7,
  O: 0xe14c52,
  N: 0x3976d3,
};

const BALL_RADIUS: Record<ElementSymbol, number> = { C: 0.32, H: 0.22, O: 0.3, N: 0.31 };
const SPACE_RADIUS: Record<ElementSymbol, number> = { C: 0.72, H: 0.5, O: 0.64, N: 0.66 };

interface ViewerRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  moleculeGroup: THREE.Group;
  atomMeshes: THREE.Mesh[];
  layer: MoleculeViewerLayer;
  frame: number;
  resizeObserver: ResizeObserver;
  onPointerMove: (event: PointerEvent) => void;
  onPointerLeave: () => void;
}

export function MoleculeViewer3D({ molecule }: MoleculeViewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const [layer, setLayer] = useState<MoleculeViewerLayer>('structure');
  const [representation, setRepresentation] = useState<MoleculeRepresentation>('ball-stick');
  const [hovered, setHovered] = useState<string>('Drag to rotate · scroll or pinch to zoom');
  const [error, setError] = useState<string | null>(null);
  const geometry = useMemo(() => generateMoleculeGeometry(molecule), [molecule]);
  const charges = useMemo(() => partialCharges(molecule), [molecule]);
  const piSystems = useMemo(() => conjugatedPiSystems(molecule), [molecule]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WebGL is unavailable.');
      return;
    }

    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x111722, 1);
    renderer.domElement.className = 'molecule-viewer-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional molecule');
    renderer.domElement.setAttribute('role', 'img');
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111722, 0.025);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    const boundsRadius = Math.max(
      1.5,
      ...[...geometry.positions.values()].map((point) => Math.hypot(point.x, point.y, point.z)),
    );
    camera.position.set(boundsRadius * 1.65, boundsRadius * 1.1, boundsRadius * 2.75);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = Math.max(1.8, boundsRadius * 0.65);
    controls.maxDistance = Math.max(14, boundsRadius * 8);
    controls.saveState();

    scene.add(new THREE.HemisphereLight(0xdbe9ff, 0x273247, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(5, 7, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x77a9ff, 2.1);
    rimLight.position.set(-6, -2, -5);
    scene.add(rimLight);
    const moleculeGroup = new THREE.Group();
    scene.add(moleculeGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent) => {
      const runtime = runtimeRef.current;
      if (runtime === null) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(runtime.atomMeshes, false)[0];
      const atom = hit?.object.userData.atom as AtomId | undefined;
      if (atom === undefined) {
        setHovered('Drag to rotate · scroll or pinch to zoom');
      } else {
        setHovered(atomDescription(molecule, atom, runtime.layer, charges, piSystems));
      }
    };
    const onPointerLeave = () => setHovered('Drag to rotate · scroll or pinch to zoom');
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.floor(entry?.contentRect.width ?? host.clientWidth));
      const height = Math.max(1, Math.floor(entry?.contentRect.height ?? host.clientHeight));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    const runtime: ViewerRuntime = {
      renderer,
      scene,
      camera,
      controls,
      moleculeGroup,
      atomMeshes: [],
      layer,
      frame: 0,
      resizeObserver,
      onPointerMove,
      onPointerLeave,
    };
    runtimeRef.current = runtime;
    const animate = () => {
      runtime.frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(runtime.frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      disposeObject(moleculeGroup);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [molecule, geometry, charges, piSystems]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    runtime.layer = layer;
    disposeObject(runtime.moleculeGroup);
    runtime.moleculeGroup.clear();
    runtime.atomMeshes = populateMolecule(
      runtime.moleculeGroup,
      molecule,
      geometry.positions,
      charges,
      piSystems,
      layer,
      representation,
    );
    setHovered('Drag to rotate · scroll or pinch to zoom');
  }, [molecule, geometry, charges, piSystems, layer, representation]);

  return (
    <section className="molecule-viewer" aria-label="3D molecule viewer">
      <div className="molecule-viewer-toolbar">
        <div className="molecule-viewer-modes" aria-label="Visualization quantity">
          {LAYERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={layer === option.value}
              onClick={() => setLayer(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="molecule-viewer-representation" aria-label="Molecule representation">
          <button
            type="button"
            aria-pressed={representation === 'ball-stick'}
            onClick={() => setRepresentation('ball-stick')}
          >
            Ball & stick
          </button>
          <button
            type="button"
            aria-pressed={representation === 'space-fill'}
            onClick={() => setRepresentation('space-fill')}
          >
            Space filling
          </button>
        </div>
      </div>
      <div className="molecule-viewer-stage">
        <div ref={hostRef} className="molecule-viewer-host" />
        <button
          type="button"
          className="molecule-viewer-reset"
          onClick={() => runtimeRef.current?.controls.reset()}
        >
          Reset view
        </button>
        {error === null ? null : <p className="molecule-viewer-error">3D view unavailable: {error}</p>}
      </div>
      <div className="molecule-viewer-caption">
        <span>{hovered}</span>
        <LayerLegend layer={layer} hasOrbitals={piSystems.length > 0} />
      </div>
    </section>
  );
}

function LayerLegend({ layer, hasOrbitals }: { layer: MoleculeViewerLayer; hasOrbitals: boolean }) {
  if (layer === 'charge') {
    return <span className="viewer-legend charge-gradient">δ− electron-rich <i /> δ+ electron-poor</span>;
  }
  if (layer === 'geometry') {
    return <span className="viewer-legend geometry-legend"><b className="sp" />sp <b className="sp2" />sp² <b className="sp3" />sp³</span>;
  }
  if (layer === 'density') {
    return <span className="viewer-legend">Translucent shells show qualitative electron extent</span>;
  }
  if (layer === 'orbitals') {
    return <span className="viewer-legend">{hasOrbitals ? 'Blue/orange = opposite π-orbital phase' : 'No π system in this molecule'}</span>;
  }
  return <span className="viewer-legend">C dark · H white · O red · N blue</span>;
}

function populateMolecule(
  group: THREE.Group,
  molecule: Molecule,
  positions: ReadonlyMap<AtomId, Point3D>,
  charges: ReadonlyMap<AtomId, number>,
  piSystems: ReturnType<typeof conjugatedPiSystems>,
  layer: MoleculeViewerLayer,
  representation: MoleculeRepresentation,
): THREE.Mesh[] {
  const atomMeshes: THREE.Mesh[] = [];
  const showBonds = representation === 'ball-stick' || layer === 'orbitals';

  if (showBonds) {
    for (const id of molecule.bonds()) {
      const bond = molecule.getBond(id);
      const first = vectorOf(positions.get(bond.source)!);
      const second = vectorOf(positions.get(bond.target)!);
      const direction = new THREE.Vector3().subVectors(second, first).normalize();
      const reference = Math.abs(direction.z) < 0.85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const offsetAxis = new THREE.Vector3().crossVectors(direction, reference).normalize();
      const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-0.07, 0.07] : [-0.11, 0, 0.11];
      for (const amount of offsets) {
        const offset = offsetAxis.clone().multiplyScalar(amount);
        const start = first.clone().add(offset);
        const end = second.clone().add(offset);
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        const firstColor = layer === 'structure' ? ELEMENT_COLOR[molecule.getAtom(bond.source).element] : 0x818c9e;
        const secondColor = layer === 'structure' ? ELEMENT_COLOR[molecule.getAtom(bond.target).element] : 0x818c9e;
        group.add(cylinderBetween(start, midpoint, 0.055, firstColor));
        group.add(cylinderBetween(midpoint, end, 0.055, secondColor));
      }
    }
  }

  for (const atom of molecule.atoms()) {
    const view = molecule.getAtom(atom);
    const point = vectorOf(positions.get(atom)!);
    const charge = charges.get(atom) ?? 0;
    const radius =
      representation === 'space-fill' && layer !== 'orbitals'
        ? SPACE_RADIUS[view.element]
        : BALL_RADIUS[view.element] * (layer === 'orbitals' ? 0.78 : 1);
    const color = atomColor(molecule, atom, layer, charge);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.31,
      metalness: 0.04,
      emissive: new THREE.Color(color).multiplyScalar(layer === 'charge' ? 0.08 : 0.025),
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
    mesh.position.copy(point);
    mesh.userData.atom = atom;
    mesh.renderOrder = 2;
    group.add(mesh);
    atomMeshes.push(mesh);

    if (layer === 'density') {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(SPACE_RADIUS[view.element] * 1.16, 28, 18),
        new THREE.MeshPhysicalMaterial({
          color: chargeColor(charge),
          transparent: true,
          opacity: 0.19 + Math.min(0.13, Math.abs(charge) * 0.18),
          depthWrite: false,
          roughness: 0.15,
          transmission: 0.08,
          side: THREE.DoubleSide,
        }),
      );
      shell.position.copy(point);
      shell.renderOrder = 3;
      group.add(shell);
    }
  }

  if (layer === 'orbitals') addPiOrbitals(group, molecule, positions, piSystems);
  return atomMeshes;
}

function addPiOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  positions: ReadonlyMap<AtomId, Point3D>,
  systems: ReturnType<typeof conjugatedPiSystems>,
): void {
  const drawn = new Set<AtomId>();
  for (const system of systems) {
    for (const atom of system.atoms) {
      if (drawn.has(atom)) continue;
      drawn.add(atom);
      const center = vectorOf(positions.get(atom)!);
      const normal = orbitalNormal(molecule, atom, positions);
      const size = molecule.getAtom(atom).element === 'H' ? 0.28 : 0.42;
      for (const phase of [-1, 1] as const) {
        const lobe = new THREE.Mesh(
          new THREE.SphereGeometry(size, 22, 14),
          new THREE.MeshPhongMaterial({
            color: phase < 0 ? 0x4f8fe8 : 0xf29b55,
            transparent: true,
            opacity: 0.52,
            depthWrite: false,
            shininess: 70,
            side: THREE.DoubleSide,
          }),
        );
        lobe.scale.set(0.72, 1.38, 0.72);
        lobe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        lobe.position.copy(center).addScaledVector(normal, phase * size * 1.15);
        lobe.renderOrder = 4;
        group.add(lobe);
      }
    }
  }
}

function orbitalNormal(
  molecule: Molecule,
  atom: AtomId,
  positions: ReadonlyMap<AtomId, Point3D>,
): THREE.Vector3 {
  const center = vectorOf(positions.get(atom)!);
  const vectors = molecule.neighbors(atom).map((neighbor) => vectorOf(positions.get(neighbor)!).sub(center));
  if (vectors.length >= 2) {
    const normal = new THREE.Vector3().crossVectors(vectors[0]!, vectors[1]!);
    if (normal.lengthSq() > 1e-6) return normal.normalize();
  }
  const direction = vectors[0]?.normalize() ?? new THREE.Vector3(1, 0, 0);
  const reference = Math.abs(direction.z) < 0.8 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(direction, reference).normalize();
}

function atomColor(molecule: Molecule, atom: AtomId, layer: MoleculeViewerLayer, charge: number): number {
  const element = molecule.getAtom(atom).element;
  if (layer === 'charge' || layer === 'density') return chargeColor(charge);
  if (layer === 'geometry' && element !== 'H') {
    const hybridization = hybridizationOf(molecule, atom);
    if (hybridization === 'sp') return 0xf4c24f;
    if (hybridization === 'sp2') return 0x35b9a9;
    return 0x9473d3;
  }
  return ELEMENT_COLOR[element];
}

function chargeColor(charge: number): number {
  const neutral = new THREE.Color(0xb8c0cc);
  const charged = new THREE.Color(charge < 0 ? 0x397ee0 : 0xe04e56);
  return neutral.lerp(charged, Math.min(1, Math.abs(charge) / 0.5)).getHex();
}

function atomDescription(
  molecule: Molecule,
  atom: AtomId,
  layer: MoleculeViewerLayer,
  charges: ReadonlyMap<AtomId, number>,
  systems: ReturnType<typeof conjugatedPiSystems>,
): string {
  const { element } = molecule.getAtom(atom);
  const name = `${ELEMENTS[element].name} (${element})`;
  if (layer === 'charge' || layer === 'density') {
    const charge = charges.get(atom) ?? 0;
    const value = Math.abs(charge) < 0.0005 ? '0.000' : `${charge > 0 ? '+' : ''}${charge.toFixed(3)}`;
    return `${name} · partial charge ${value}`;
  }
  if (layer === 'geometry') return `${name} · ${hybridizationOf(molecule, atom) ?? '1s'} geometry`;
  if (layer === 'orbitals') {
    return `${name} · ${systems.some((system) => system.atoms.includes(atom)) ? 'π-orbital participant' : 'no π orbital'}`;
  }
  return name;
}

function vectorOf(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const delta = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.42 }),
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
