import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import {
  PI_SURFACE_ISOLATION,
  PI_SURFACE_SUBTRACT,
  metaballSupportRadius,
  piLobeOffset,
  piSurfaceResolution,
} from './pi-surface-math';
import {
  ELEMENTS,
  conjugatedPiSystems,
  displayedLonePairCount,
  hybridizationOf,
  lonePairDirections,
  partialCharges,
  piSystemNormals,
} from '../../chem';
import type { AtomId, ElementSymbol, Molecule, MoleculeGeometry } from '../../chem';

export type MoleculeViewerLayer =
  | 'structure'
  | 'geometry'
  | 'charge'
  | 'density'
  | 'orbitals';
export type MoleculeRepresentation = 'ball-stick' | 'space-fill';

export interface MoleculeViewer3DProps {
  molecule: Molecule;
  /** Registry-owned, mutation-aware cached display conformer. */
  geometry: MoleculeGeometry;
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
/** Bondi/Rowland-Taylor van der Waals radii in ångströms. */
const SPACE_RADIUS: Record<ElementSymbol, number> = { C: 1.7, H: 1.1, O: 1.52, N: 1.55 };

interface ViewerRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  moleculeGroup: THREE.Group;
  atomMeshes: THREE.Mesh[];
  orbitalMeshes: THREE.Mesh[];
  layer: MoleculeViewerLayer;
  frame: number;
  resizeObserver: ResizeObserver;
  onPointerMove: (event: PointerEvent) => void;
  onPointerLeave: () => void;
}

interface OrbitalHover {
  left: number;
  top: number;
  id: string;
  atomCount: number;
  electronCount: number;
}

export function MoleculeViewer3D({ molecule, geometry }: MoleculeViewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const [layer, setLayer] = useState<MoleculeViewerLayer>('structure');
  const [representation, setRepresentation] = useState<MoleculeRepresentation>('ball-stick');
  const [hovered, setHovered] = useState<string>('Drag to rotate · scroll or pinch to zoom');
  const [orbitalHover, setOrbitalHover] = useState<OrbitalHover | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    renderer.setClearColor(0xf4f7fb, 1);
    renderer.domElement.className = 'molecule-viewer-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional molecule');
    renderer.domElement.setAttribute('role', 'img');
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf4f7fb, 0.018);
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

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4d6, 2.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(5, 7, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9dbce8, 1.35);
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
      if (runtime.layer === 'orbitals') {
        const orbitalHit = raycaster.intersectObjects(runtime.orbitalMeshes, false)[0];
        const orbital = orbitalHit?.object.userData.piOrbital as Omit<OrbitalHover, 'left' | 'top'> | undefined;
        if (orbital !== undefined) {
          setOrbitalHover({
            ...orbital,
            left: Math.max(8, Math.min(rect.width - 142, event.clientX - rect.left + 14)),
            top: Math.max(72, event.clientY - rect.top + 14),
          });
          setHovered(`Orbital ${orbital.id} · ${orbital.atomCount} atoms · ${orbital.electronCount} electrons`);
          return;
        }
      }
      setOrbitalHover(null);
      const hit = raycaster.intersectObjects(runtime.atomMeshes, false)[0];
      const atom = hit?.object.userData.atom as AtomId | undefined;
      if (atom === undefined) {
        setHovered('Drag to rotate · scroll or pinch to zoom');
      } else {
        setHovered(atomDescription(molecule, atom, runtime.layer, charges, piSystems));
      }
    };
    const onPointerLeave = () => {
      setHovered('Drag to rotate · scroll or pinch to zoom');
      setOrbitalHover(null);
    };
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
      orbitalMeshes: [],
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
    const meshes = populateMolecule(
      runtime.moleculeGroup,
      molecule,
      geometry.positions,
      charges,
      piSystems,
      layer,
      representation,
    );
    runtime.atomMeshes = meshes.atoms;
    runtime.orbitalMeshes = meshes.orbitals;
    setHovered('Drag to rotate · scroll or pinch to zoom');
    setOrbitalHover(null);
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
        {orbitalHover === null ? null : (
          <aside
            className="molecule-viewer-orbital-tooltip"
            style={{ left: orbitalHover.left, top: orbitalHover.top }}
          >
            <strong>Orbital {orbitalHover.id}</strong>
            <span>{orbitalHover.atomCount} atoms</span>
            <span>{orbitalHover.electronCount} electrons</span>
          </aside>
        )}
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
    return <span className="viewer-legend">Clouds show bonds, lone pairs and delocalized π electrons</span>;
  }
  if (layer === 'orbitals') {
    return <span className="viewer-legend">{hasOrbitals ? 'One hue per π system · light/dark = opposite phase' : 'No π system in this molecule'}</span>;
  }
  return <span className="viewer-legend">C dark · H white · O red · N blue</span>;
}

function populateMolecule(
  group: THREE.Group,
  molecule: Molecule,
  positions: ReadonlyMap<AtomId, THREE.Vector3>,
  charges: ReadonlyMap<AtomId, number>,
  piSystems: ReturnType<typeof conjugatedPiSystems>,
  layer: MoleculeViewerLayer,
  representation: MoleculeRepresentation,
): { atoms: THREE.Mesh[]; orbitals: THREE.Mesh[] } {
  const atomMeshes: THREE.Mesh[] = [];
  let orbitalMeshes: THREE.Mesh[] = [];
  const showBonds = representation === 'ball-stick' || layer === 'orbitals';

  if (showBonds) {
    for (const id of molecule.bonds()) {
      const bond = molecule.getBond(id);
      const first = positions.get(bond.source)!;
      const second = positions.get(bond.target)!;
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

  if (layer === 'density') addBondClouds(group, molecule, positions);

  for (const atom of molecule.atoms()) {
    const view = molecule.getAtom(atom);
    const point = positions.get(atom)!;
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

    if (layer === 'density') addLonePairs(group, molecule, atom, positions);
  }

  if (layer === 'density') addPiElectronClouds(group, molecule, positions, piSystems);
  if (layer === 'orbitals') orbitalMeshes = addPiOrbitals(group, molecule, positions, piSystems);
  return { atoms: atomMeshes, orbitals: orbitalMeshes };
}

const PI_SYSTEM_COLORS = [0x3978c5, 0xa34a9d, 0x24866d, 0xc66b24, 0x7053bd, 0x147f9c] as const;

function addBondClouds(group: THREE.Group, molecule: Molecule, positions: ReadonlyMap<AtomId, THREE.Vector3>): void {
  for (const id of molecule.bonds()) {
    const { source, target, order } = molecule.getBond(id);
    const cloud = cylinderBetween(positions.get(source)!, positions.get(target)!, 0.13 + order * 0.025, 0x7e9bc2);
    (cloud.material as THREE.MeshStandardMaterial).dispose();
    cloud.material = new THREE.MeshPhongMaterial({ color: 0x7e9bc2, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    cloud.renderOrder = 1;
    group.add(cloud);
  }
}

function addLonePairs(group: THREE.Group, molecule: Molecule, atom: AtomId, positions: ReadonlyMap<AtomId, THREE.Vector3>): void {
  const count = displayedLonePairCount(molecule, atom);
  if (count === 0) return;
  const center = positions.get(atom)!;
  const directions = lonePairDirections(molecule, atom, positions);
  directions.forEach((direction) => {
    const side = direction.clone()
      .cross(Math.abs(direction.z) < 0.8 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0))
      .normalize();
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 18, 12),
      new THREE.MeshPhongMaterial({ color: 0xe2b53f, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    lobe.scale.set(0.7, 1.35, 0.7);
    lobe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    lobe.position.copy(center).addScaledVector(direction, 0.52);
    lobe.renderOrder = 4;
    group.add(lobe);
    for (const offset of [-1, 1]) {
      const electron = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x654600 }));
      electron.position.copy(center).addScaledVector(direction, 0.66).addScaledVector(side, offset * 0.055);
      electron.renderOrder = 5;
      group.add(electron);
    }
  });
}

function addPiElectronClouds(group: THREE.Group, molecule: Molecule, positions: ReadonlyMap<AtomId, THREE.Vector3>, systems: ReturnType<typeof conjugatedPiSystems>): void {
  const normals = piSystemNormals(molecule, systems, positions);
  systems.forEach((system, systemIndex) => {
    if (system.atoms.length < 2) return;
    const normal = normals[systemIndex]!;
    const color = PI_SYSTEM_COLORS[systemIndex % PI_SYSTEM_COLORS.length]!;
    addMergedPiSurfaces(group, system.atoms, positions, normal, [color, color], 0.2, 0.72, 3);
  });
}

function addPiOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  positions: ReadonlyMap<AtomId, THREE.Vector3>,
  systems: ReturnType<typeof conjugatedPiSystems>,
): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  const normals = piSystemNormals(molecule, systems, positions);
  systems.forEach((system, systemIndex) => {
    const normal = normals[systemIndex]!;
    const base = new THREE.Color(PI_SYSTEM_COLORS[systemIndex % PI_SYSTEM_COLORS.length]!);
    const colors = ([-1, 1] as const).map((phase) => (
      base.clone().offsetHSL(0, phase < 0 ? 0.08 : -0.08, phase < 0 ? -0.13 : 0.18).getHex()
    )) as [number, number];
    const surfaces = addMergedPiSurfaces(group, system.atoms, positions, normal, colors, 0.5, 0.58, 4);
    for (const surface of surfaces) {
      surface.userData.piOrbital = {
        id: `π${systemIndex + 1}`,
        atomCount: system.atoms.length,
        electronCount: system.electronCount,
      };
      result.push(surface);
    }
  });
  return result;
}

/**
 * Build one smooth lobe with marching cubes, then mirror its geometry for the
 * opposite side of the system plane. This halves the expensive field work.
 */
function addMergedPiSurfaces(
  group: THREE.Group,
  atoms: readonly AtomId[],
  positions: ReadonlyMap<AtomId, THREE.Vector3>,
  normal: THREE.Vector3,
  colors: readonly [negative: number, positive: number],
  opacity: number,
  radius: number,
  renderOrder: number,
): [negative: THREE.Mesh, positive: THREE.Mesh] {
  // Offset each lobe by its isolated isosurface radius so opposite phases
  // barely meet at the molecular plane instead of overlapping visibly.
  const atomCenters = atoms.map((atom) => positions.get(atom)!);
  const systemCenter = atomCenters.reduce(
    (sum, point) => sum.add(point),
    new THREE.Vector3(),
  ).multiplyScalar(1 / atomCenters.length);
  const centers = atomCenters.map((point) => point.clone().addScaledVector(normal, piLobeOffset(radius)));
  const isolation = PI_SURFACE_ISOLATION;
  const subtract = PI_SURFACE_SUBTRACT;
  // A Three.js metaball's positive field extends beyond its requested
  // isosurface to sqrt(strength/subtract). Bound that complete support; the
  // old 1.4 * radius padding clipped benzene and naphthalene.
  const supportRadius = metaballSupportRadius(radius, isolation, subtract);
  const bounds = new THREE.Box3().setFromPoints(centers).expandByScalar(supportRadius * 1.05);
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = Math.max(1.8, bounds.getSize(new THREE.Vector3()).x, bounds.getSize(new THREE.Vector3()).y, bounds.getSize(new THREE.Vector3()).z);
  const positiveMaterial = piSurfaceMaterial(colors[1], opacity);
  const surface = new MarchingCubes(piSurfaceResolution(extent), positiveMaterial, false, false, 30_000);
  surface.isolation = isolation;
  surface.position.copy(center);
  surface.scale.setScalar(extent / 2);
  const strength = (surface.isolation + subtract) * (radius / extent) ** 2;
  for (const point of centers) {
    surface.addBall(
      (point.x - center.x) / extent + 0.5,
      (point.y - center.y) / extent + 0.5,
      (point.z - center.z) / extent + 0.5,
      strength,
      subtract,
    );
  }
  surface.update();
  surface.renderOrder = renderOrder;

  // The field geometry is local to the scaled MarchingCubes mesh. Reflect a
  // compact copy across the molecular plane and reverse triangle winding so
  // both lobes retain outward-facing normals without another field traversal.
  const localPlanePoint = systemCenter.clone().sub(center).multiplyScalar(2 / extent);
  const negativeGeometry = mirroredGeometry(surface.geometry, localPlanePoint, normal);
  const negative = new THREE.Mesh(negativeGeometry, piSurfaceMaterial(colors[0], opacity));
  negative.position.copy(center);
  negative.scale.setScalar(extent / 2);
  negative.renderOrder = renderOrder;
  group.add(negative);
  group.add(surface);
  return [negative, surface];
}

function piSurfaceMaterial(color: number, opacity: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    shininess: 65,
    side: THREE.DoubleSide,
  });
}

/** Copy and reflect only the vertices emitted by MarchingCubes. */
function mirroredGeometry(
  source: THREE.BufferGeometry,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): THREE.BufferGeometry {
  const sourcePositions = source.getAttribute('position');
  const sourceNormals = source.getAttribute('normal');
  const count = source.drawRange.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();

  for (let triangle = 0; triangle < count; triangle += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      // Reflection reverses handedness; swap the final two vertices to keep
      // the copied triangle front-facing.
      const sourceIndex = triangle + (corner === 1 ? 2 : corner === 2 ? 1 : 0);
      point.fromBufferAttribute(sourcePositions, sourceIndex);
      const planeDistance = (point.x - planePoint.x) * planeNormal.x
        + (point.y - planePoint.y) * planeNormal.y
        + (point.z - planePoint.z) * planeNormal.z;
      point.addScaledVector(planeNormal, -2 * planeDistance);
      vertexNormal.fromBufferAttribute(sourceNormals, sourceIndex);
      vertexNormal.addScaledVector(planeNormal, -2 * vertexNormal.dot(planeNormal));
      const targetIndex = triangle + corner;
      const offset = targetIndex * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
      normals[offset] = vertexNormal.x;
      normals[offset + 1] = vertexNormal.y;
      normals[offset + 2] = vertexNormal.z;
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  result.setDrawRange(0, count);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
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
    const index = systems.findIndex((system) => system.atoms.includes(atom));
    return `${name} · ${index >= 0 ? `π system ${index + 1} · ${systems[index]!.electronCount} electrons` : 'no π orbital'}`;
  }
  return name;
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
