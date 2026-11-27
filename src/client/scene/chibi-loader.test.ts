import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyChibiColors,
  CHIBI_PIVOTS,
  instantiateChibiRig,
} from "./chibi-loader.js";

const ALL_CHIBI_NODE_NAMES = [
  "Chân mày phải",
  "Chân mày trái",
  "Chân phải",
  "Chân trái",
  "Cánh tay và bàn tay phải",
  "Cánh tay và bàn tay trái",
  "Cổ",
  "Giày • thân và mũi phải",
  "Giày • thân và mũi trái",
  "Giày • viền đế phải",
  "Giày • viền đế trái",
  "Giày • đế cao su phải",
  "Giày • đế cao su trái",
  "Lọn ngắn • đỉnh trái",
  "Lọn tóc vểnh trên trán",
  "Lớp ngoài phải • mái vòng",
  "Lớp ngoài trái • móc dưới",
  "Lớp ngoài trái • móc giữa",
  "Mái 01 • cánh trái",
  "Mái 02 • nhánh giữa dài",
  "Mái 03 • nhánh giữa ngắn",
  "Mái 04 • cánh phải",
  "Mắt phải",
  "Mắt trái",
  "Nền tóc",
  "Nụ cười",
  "Quần short • gấu lật phải",
  "Quần short • gấu lật trái",
  "Quần short • thân liền hai ống",
  "Tai phải",
  "Tai trái",
  "Tóc bên trái • lọn dưới",
  "Tóc bên trái • lọn vểnh",
  "Tóc gáy • giữa",
  "Tóc gáy • phải",
  "Tóc gáy • trái",
  "Tóc mai phải",
  "Tóc mai trái",
  "Tóc sau phải • dưới",
  "Tóc sau trái • dưới",
  "Tóc thái dương • phải sau",
  "Tóc thái dương • trái sau",
  "Tóc vểnh trái",
  "Tất xanh • phải",
  "Tất xanh • trái",
  "Áo thun • bo cổ tròn",
  "Áo thun • tay phải",
  "Áo thun • tay trái",
  "Áo thun • thân và gấu",
  "Đầu • da và sắc má",
  "Đỉnh tóc • xoáy sau",
] as const;

describe("Chibi 3D articulated rig", () => {
  it("maps all 51 named GLB meshes into articulated limb pivots and applies outfit tones cleanly", () => {
    const template = new THREE.Group();
    const sharedGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const shirtMat = new THREE.MeshStandardMaterial({
      name: "Áo thun • trắng sữa",
      color: "#d8d6d2",
    });
    const collarMat = new THREE.MeshStandardMaterial({
      name: "Bo cổ • trắng ngà",
      color: "#cfc5bc",
    });
    const sockMat = new THREE.MeshStandardMaterial({
      name: "Tất • xanh xô thơm",
      color: "#4d7573",
    });
    const hairMat = new THREE.MeshStandardMaterial({
      name: "Tóc • than đen",
      color: "#22242a",
    });

    for (const name of ALL_CHIBI_NODE_NAMES) {
      const sanitized = name.replace(/ /g, "_");
      const mat = name.startsWith("Áo thun • bo")
        ? collarMat
        : name.startsWith("Áo thun")
          ? shirtMat
          : name.startsWith("Tất")
            ? sockMat
            : hairMat;
      const mesh = new THREE.Mesh(sharedGeo, mat);
      mesh.name = name.startsWith("Giày • thân") ? `${sanitized}_1` : sanitized;
      mesh.position.set(0.1, 0.5, 0);
      template.add(mesh);
    }
    template.updateMatrixWorld(true);

    const rig = instantiateChibiRig(template);

    expect(rig.torso.children).toHaveLength(3);
    expect(rig.head.children).toHaveLength(32);
    expect(rig.leftArm.children).toHaveLength(2);
    expect(rig.rightArm.children).toHaveLength(2);
    expect(rig.leftLeg.children).toHaveLength(6);
    expect(rig.rightLeg.children).toHaveLength(6);
    expect(rig.eyes).toHaveLength(2);
    expect(rig.brows).toHaveLength(2);

    // Check relative pivot offset preserves world rest pose.
    const legChild = rig.leftLeg.children[0];
    expect(legChild.position.x).toBeCloseTo(0.1 - CHIBI_PIVOTS.leftLeg[0], 5);

    // Tinting outfit materials must not mutate template materials.
    applyChibiColors(rig, 1, {
      skin: "chibi",
      tone: "crimson",
      hat: "none",
      eyewear: "none",
      gear: "none",
    });
    expect(rig.shirtMaterials[0]?.color.getHexString()).not.toBe(
      shirtMat.color.getHexString(),
    );
    expect(shirtMat.color.getHexString()).toBe("d8d6d2");

    sharedGeo.dispose();
    shirtMat.dispose();
    collarMat.dispose();
    sockMat.dispose();
    hairMat.dispose();
    for (const mat of rig.clonedMaterials) mat.dispose();
  });
});
