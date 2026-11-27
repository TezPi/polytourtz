import * as THREE from "three";
import type { PlayerCosmetics, Seat } from "../../shared/engine/index.js";
import { PLAYER_COLORS } from "../ui/board-display.js";
import { OUTFIT_TONE_HEX } from "../ui/cosmetics-store.js";

export const CHIBI_MODEL_URL = "/models/nhan-vat-chibi.glb";

/** World-space anatomical pivots relative to the raw Chibi GLB origin (soles at y=0). */
export const CHIBI_PIVOTS = {
  pelvis: [0, 0.3, 0] as const,
  headInPelvis: [0, 0.32, 0] as const,
  leftArmInPelvis: [-0.122, 0.255, 0.004] as const,
  rightArmInPelvis: [0.124, 0.255, 0.004] as const,
  leftLeg: [-0.075, 0.27, 0] as const,
  rightLeg: [0.077, 0.27, 0] as const,
} as const;

type LimbBucket =
  | "head"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg"
  | "torso";

const LEFT_ARM_NAMES = new Set([
  "Cánh tay và bàn tay trái",
  "Áo thun • tay trái",
]);
const RIGHT_ARM_NAMES = new Set([
  "Cánh tay và bàn tay phải",
  "Áo thun • tay phải",
]);
const LEFT_LEG_NAMES = new Set([
  "Chân trái",
  "Quần short • gấu lật trái",
  "Tất xanh • trái",
  "Giày • thân và mũi trái",
  "Giày • viền đế trái",
  "Giày • đế cao su trái",
]);
const RIGHT_LEG_NAMES = new Set([
  "Chân phải",
  "Quần short • gấu lật phải",
  "Tất xanh • phải",
  "Giày • thân và mũi phải",
  "Giày • viền đế phải",
  "Giày • đế cao su phải",
]);
const HEAD_EXACT_NAMES = new Set([
  "Cổ",
  "Đầu • da và sắc má",
  "Chân mày phải",
  "Chân mày trái",
  "Mắt phải",
  "Mắt trái",
  "Nụ cười",
  "Tai phải",
  "Tai trái",
  "Nền tóc",
]);
const HEAD_PREFIXES = [
  "Mái ",
  "Tóc ",
  "Lọn ",
  "Lớp ngoài",
  "Đỉnh tóc",
] as const;

function normalizePartName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\s+\d+$/, "")
    .trim();
}

function classifyNode(rawName: string): LimbBucket {
  const name = normalizePartName(rawName);
  if (LEFT_ARM_NAMES.has(name)) return "leftArm";
  if (RIGHT_ARM_NAMES.has(name)) return "rightArm";
  if (LEFT_LEG_NAMES.has(name)) return "leftLeg";
  if (RIGHT_LEG_NAMES.has(name)) return "rightLeg";
  if (
    HEAD_EXACT_NAMES.has(name) ||
    HEAD_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    return "head";
  }
  return "torso";
}

export type ChibiBrow = {
  readonly node: THREE.Object3D;
  readonly baseY: number;
};

export type ChibiEye = {
  readonly node: THREE.Object3D;
  readonly baseScaleY: number;
};

export type ChibiRigInstance = {
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly leftArm: THREE.Group;
  readonly rightArm: THREE.Group;
  readonly leftLeg: THREE.Group;
  readonly rightLeg: THREE.Group;
  readonly eyes: readonly ChibiEye[];
  readonly brows: readonly ChibiBrow[];
  readonly shirtMaterials: readonly THREE.MeshStandardMaterial[];
  readonly collarMaterials: readonly THREE.MeshStandardMaterial[];
  readonly sockMaterials: readonly THREE.MeshStandardMaterial[];
  readonly baseShirtColor: THREE.Color;
  readonly baseCollarColor: THREE.Color;
  readonly baseSockColor: THREE.Color;
  readonly clonedMaterials: readonly THREE.Material[];
};

const PIVOT_ORIGIN: Record<LimbBucket, THREE.Vector3> = {
  torso: new THREE.Vector3(...CHIBI_PIVOTS.pelvis),
  head: new THREE.Vector3(
    CHIBI_PIVOTS.pelvis[0] + CHIBI_PIVOTS.headInPelvis[0],
    CHIBI_PIVOTS.pelvis[1] + CHIBI_PIVOTS.headInPelvis[1],
    CHIBI_PIVOTS.pelvis[2] + CHIBI_PIVOTS.headInPelvis[2],
  ),
  leftArm: new THREE.Vector3(
    CHIBI_PIVOTS.pelvis[0] + CHIBI_PIVOTS.leftArmInPelvis[0],
    CHIBI_PIVOTS.pelvis[1] + CHIBI_PIVOTS.leftArmInPelvis[1],
    CHIBI_PIVOTS.pelvis[2] + CHIBI_PIVOTS.leftArmInPelvis[2],
  ),
  rightArm: new THREE.Vector3(
    CHIBI_PIVOTS.pelvis[0] + CHIBI_PIVOTS.rightArmInPelvis[0],
    CHIBI_PIVOTS.pelvis[1] + CHIBI_PIVOTS.rightArmInPelvis[1],
    CHIBI_PIVOTS.pelvis[2] + CHIBI_PIVOTS.rightArmInPelvis[2],
  ),
  leftLeg: new THREE.Vector3(...CHIBI_PIVOTS.leftLeg),
  rightLeg: new THREE.Vector3(...CHIBI_PIVOTS.rightLeg),
};

let templatePromise: Promise<THREE.Group> | null = null;

export function loadChibiTemplate(): Promise<THREE.Group> {
  if (templatePromise) return templatePromise;
  templatePromise = import("three/examples/jsm/loaders/GLTFLoader.js").then(
    ({ GLTFLoader }) =>
      new Promise<THREE.Group>((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
          CHIBI_MODEL_URL,
          (gltf) => {
            gltf.scene.updateMatrixWorld(true);
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            templatePromise = null;
            reject(error);
          },
        );
      }),
  );
  return templatePromise;
}

const TINTABLE_SHIRT_NAME = "Áo thun • trắng sữa";
const TINTABLE_COLLAR_NAME = "Bo cổ • trắng ngà";
const TINTABLE_SOCK_NAME = "Tất • xanh xô thơm";

/** Builds a clean independent rig instance sharing GPU geometries cleanly. */
export function instantiateChibiRig(template: THREE.Group): ChibiRigInstance {
  const buckets: Record<LimbBucket, THREE.Group> = {
    torso: new THREE.Group(),
    head: new THREE.Group(),
    leftArm: new THREE.Group(),
    rightArm: new THREE.Group(),
    leftLeg: new THREE.Group(),
    rightLeg: new THREE.Group(),
  };
  const eyes: ChibiEye[] = [];
  const brows: ChibiBrow[] = [];
  const shirtMaterials = new Set<THREE.MeshStandardMaterial>();
  const collarMaterials = new Set<THREE.MeshStandardMaterial>();
  const sockMaterials = new Set<THREE.MeshStandardMaterial>();
  const materialClones = new Map<THREE.Material, THREE.Material>();
  const baseShirtColor = new THREE.Color("#d8d6d2");
  const baseCollarColor = new THREE.Color("#cfc5bc");
  const baseSockColor = new THREE.Color("#4d7573");

  function cloneTintableMaterial(mat: THREE.Material): THREE.Material {
    if (
      mat.name !== TINTABLE_SHIRT_NAME &&
      mat.name !== TINTABLE_COLLAR_NAME &&
      mat.name !== TINTABLE_SOCK_NAME
    ) {
      return mat;
    }
    const existing = materialClones.get(mat);
    if (existing) return existing;
    const cloned = mat.clone();
    materialClones.set(mat, cloned);
    if (cloned instanceof THREE.MeshStandardMaterial) {
      if (mat.name === TINTABLE_SHIRT_NAME) {
        baseShirtColor.copy(cloned.color);
        shirtMaterials.add(cloned);
      } else if (mat.name === TINTABLE_COLLAR_NAME) {
        baseCollarColor.copy(cloned.color);
        collarMaterials.add(cloned);
      } else if (mat.name === TINTABLE_SOCK_NAME) {
        baseSockColor.copy(cloned.color);
        sockMaterials.add(cloned);
      }
    }
    return cloned;
  }

  template.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const bucket = classifyNode(node.name);
    const pivot = PIVOT_ORIGIN[bucket];
    const clonedMesh = new THREE.Mesh(
      node.geometry,
      Array.isArray(node.material)
        ? node.material.map(cloneTintableMaterial)
        : cloneTintableMaterial(node.material),
    );
    clonedMesh.name = node.name;
    clonedMesh.castShadow = true;
    clonedMesh.receiveShadow = false;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    node.getWorldPosition(worldPos);
    node.getWorldQuaternion(worldQuat);
    node.getWorldScale(worldScale);
    clonedMesh.position.copy(worldPos).sub(pivot);
    clonedMesh.quaternion.copy(worldQuat);
    clonedMesh.scale.copy(worldScale);

    const partName = normalizePartName(node.name);
    if (partName === "Mắt phải" || partName === "Mắt trái") {
      eyes.push({ node: clonedMesh, baseScaleY: clonedMesh.scale.y });
    } else if (partName === "Chân mày phải" || partName === "Chân mày trái") {
      brows.push({ node: clonedMesh, baseY: clonedMesh.position.y });
    }
    buckets[bucket].add(clonedMesh);
  });

  return {
    torso: buckets.torso,
    head: buckets.head,
    leftArm: buckets.leftArm,
    rightArm: buckets.rightArm,
    leftLeg: buckets.leftLeg,
    rightLeg: buckets.rightLeg,
    eyes,
    brows,
    shirtMaterials: [...shirtMaterials],
    collarMaterials: [...collarMaterials],
    sockMaterials: [...sockMaterials],
    baseShirtColor,
    baseCollarColor,
    baseSockColor,
    clonedMaterials: [...materialClones.values()],
  };
}

/** Applies custom outfit tones and subtle seat team identification to a Chibi rig. */
export function applyChibiColors(
  rig: ChibiRigInstance,
  seat: Seat,
  cosmetics: PlayerCosmetics,
): void {
  const seatColor = new THREE.Color(PLAYER_COLORS[seat]);
  const white = new THREE.Color("#ffffff");

  if (cosmetics.tone === "seat") {
    for (const mat of rig.shirtMaterials) {
      mat.color.copy(rig.baseShirtColor);
    }
    for (const mat of rig.collarMaterials) {
      mat.color.copy(rig.baseCollarColor).lerp(seatColor, 0.35);
    }
    for (const mat of rig.sockMaterials) {
      mat.color.copy(rig.baseSockColor).lerp(seatColor, 0.35);
    }
    return;
  }

  const toneColor = new THREE.Color(OUTFIT_TONE_HEX[cosmetics.tone]);
  for (const mat of rig.shirtMaterials) {
    mat.color.copy(toneColor);
  }
  for (const mat of rig.collarMaterials) {
    mat.color.copy(toneColor).lerp(white, 0.42);
  }
  for (const mat of rig.sockMaterials) {
    mat.color.copy(rig.baseSockColor).lerp(toneColor, 0.35);
  }
}
