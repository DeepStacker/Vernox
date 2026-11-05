/**
 * 3D model generation for AR. Imports three.js, so this module must only ever be loaded with a
 * dynamic import() when the customer taps "View in your room (AR)".
 *
 * Coordinates: metres, Y up, the piece faces +Z, the wall plane is z = 0 and the model origin is the centre
 * of the piece's face. That is the orientation model-viewer expects for `ar-placement="wall"`.
 */
import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Box3,
  Vector3,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { materialForFinish } from './materials';
import { DEFAULT_THICKNESS_MM, STANDOFF_MM, mountingLayout } from './outline';
import type { Outline } from './types';

const MM = 0.001;

export interface ModelRequest {
  outline: Outline;
  finish: string;
  thicknessMm?: number;
  round?: boolean;
}

/** Builds the scene graph: extruded plate (with any cut-outs) floating on four standoff spacers. */
export function buildPieceGroup({ outline, finish, thicknessMm = DEFAULT_THICKNESS_MM, round = false }: ModelRequest): Group {
  const material = materialForFinish(finish);
  const metal = new MeshStandardMaterial({ color: material.colour, metalness: material.metalness, roughness: material.roughness });
  const steel = new MeshStandardMaterial({ color: '#b8b8b8', metalness: 1, roughness: 0.35 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${outline.svgPath}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const group = new Group();
  group.name = 'vernox-piece';

  const plate = new Group();
  for (const path of data.paths) {
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new ExtrudeGeometry(shape, { depth: thicknessMm, bevelEnabled: false, curveSegments: 24 });
      const mesh = new Mesh(geometry, metal);
      mesh.name = 'plate';
      plate.add(mesh);
    }
  }
  // SVG is y-down in mm: flip to y-up, convert to metres, centre on the bounding box, lift off the wall by the spacers.
  plate.scale.set(MM, -MM, MM);
  plate.position.set((-outline.widthMm / 2) * MM, (outline.heightMm / 2) * MM, STANDOFF_MM * MM);
  group.add(plate);

  const layout = mountingLayout(outline.widthMm, outline.heightMm, round);
  const standoff = new CylinderGeometry(5 * MM, 5 * MM, STANDOFF_MM * MM, 20);
  standoff.rotateX(Math.PI / 2); // axis along Z
  for (const hole of layout.holes) {
    const mesh = new Mesh(standoff, steel);
    mesh.name = 'standoff';
    mesh.position.set((hole.x - outline.widthMm / 2) * MM, (outline.heightMm / 2 - hole.y) * MM, (STANDOFF_MM / 2) * MM);
    group.add(mesh);
  }
  return group;
}

/** Bounding box size in metres; used to sanity-check true scale. */
export function groupSizeMetres(group: Group): { x: number; y: number; z: number } {
  const size = new Box3().setFromObject(group).getSize(new Vector3());
  return { x: size.x, y: size.y, z: size.z };
}

export async function exportGlb(request: ModelRequest): Promise<ArrayBuffer> {
  const group = buildPieceGroup(request);
  const result = await new GLTFExporter().parseAsync(group, { binary: true });
  if (!(result instanceof ArrayBuffer)) throw new Error('GLB export returned JSON instead of binary');
  return result;
}

export async function exportUsdz(request: ModelRequest): Promise<Uint8Array> {
  const group = buildPieceGroup(request);
  const exporter = new USDZExporter();
  return exporter.parseAsync(group);
}

export interface BuiltModels {
  glbUrl: string;
  usdzUrl?: string;
}

const cache = new Map<string, Promise<BuiltModels>>();

export const modelCacheKey = (productKey: string, sizeKey: string, finish: string) => `${productKey}|${sizeKey}|${finish}`;

/**
 * Generates (or returns the cached) model files for a piece. Object URLs live as long as the page: the cache is
 * per (product, size, finish) and bounded by the handful of combinations a customer tries.
 */
export function getModels(key: string, request: ModelRequest, withUsdz: boolean): Promise<BuiltModels> {
  const hit = cache.get(key + (withUsdz ? '|u' : ''));
  if (hit) return hit;
  const promise = (async () => {
    const glb = await exportGlb(request);
    const models: BuiltModels = { glbUrl: URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' })) };
    if (withUsdz) {
      const usdz = await exportUsdz(request);
      models.usdzUrl = URL.createObjectURL(new Blob([usdz], { type: 'model/vnd.usdz+zip' }));
    }
    return models;
  })();
  cache.set(key + (withUsdz ? '|u' : ''), promise);
  promise.catch(() => cache.delete(key + (withUsdz ? '|u' : '')));
  return promise;
}
