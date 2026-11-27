import { useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PlayerCosmetics, Seat } from "../../shared/engine/index.js";
import {
  applyChibiColors,
  CHIBI_PIVOTS,
  type ChibiRigInstance,
  instantiateChibiRig,
  loadChibiTemplate,
} from "./chibi-loader.js";
import { CustomHat, Eyewear, Gear } from "./PawnModel.js";

const CHIBI_SCALE = 0.72;
const PEDESTAL_TOP_Y = 0.055;

function shortestAngleDelta(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export default function ChibiCharacter({
  seat,
  cosmetics,
  seatColor,
  showPedestal = true,
  active = false,
  animated = false,
  fallback,
}: {
  seat: Seat;
  cosmetics: PlayerCosmetics;
  seatColor: string;
  showPedestal?: boolean;
  active?: boolean;
  animated?: boolean;
  fallback: ReactNode;
}) {
  const [template, setTemplate] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadChibiTemplate()
      .then((loaded) => {
        if (!cancelled) setTemplate(loaded);
      })
      .catch(() => {
        /* Keep stylized geometric pawn fallback when GLB cannot load. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rig = useMemo<ChibiRigInstance | null>(
    () => (template ? instantiateChibiRig(template) : null),
    [template],
  );

  useEffect(() => {
    if (!rig) return;
    applyChibiColors(rig, seat, cosmetics);
  }, [rig, seat, cosmetics]);

  useEffect(
    () => () => {
      if (!rig) return;
      for (const mat of rig.clonedMaterials) mat.dispose();
    },
    [rig],
  );

  const facingRef = useRef<THREE.Group>(null);
  const pelvisRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  const motion = useRef({
    initialized: false,
    prevWorld: new THREE.Vector3(),
    prevVy: 0,
    walkPhase: seat * 1.1,
    walkBlend: 0,
    airBlend: 0,
    activeBlend: 0,
    landingSquash: 0,
    stillTime: 1,
    yaw: 0,
  });

  const tmpWorld = useMemo(() => new THREE.Vector3(), []);
  const tmpDelta = useMemo(() => new THREE.Vector3(), []);
  const tmpParentQuat = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ clock }, rawDelta) => {
    const facing = facingRef.current;
    const pelvis = pelvisRef.current;
    const head = headRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    const leftLeg = leftLegRef.current;
    const rightLeg = rightLegRef.current;
    if (
      !rig ||
      !facing ||
      !pelvis ||
      !head ||
      !leftArm ||
      !rightArm ||
      !leftLeg ||
      !rightLeg
    ) {
      return;
    }

    const dt = Math.min(Math.max(rawDelta, 1 / 120), 0.1);
    const m = motion.current;
    facing.getWorldPosition(tmpWorld);

    let horizSpeed = 0;
    let vy = 0;
    if (!m.initialized) {
      m.prevWorld.copy(tmpWorld);
      m.initialized = true;
    } else {
      tmpDelta.copy(tmpWorld).sub(m.prevWorld);
      m.prevWorld.copy(tmpWorld);
      if (dt > 0) {
        horizSpeed = Math.hypot(tmpDelta.x, tmpDelta.z) / dt;
        vy = tmpDelta.y / dt;
      }
      if (m.prevVy < -1.2 && vy >= -0.35) {
        m.landingSquash = Math.min(1, Math.abs(m.prevVy) * 0.22);
      }
      m.prevVy = vy;
    }

    const moving = horizSpeed > 0.2;
    const airborne = Math.abs(vy) > 0.75;

    if (moving && facing.parent) {
      facing.parent.getWorldQuaternion(tmpParentQuat).invert();
      tmpDelta.y = 0;
      tmpDelta.applyQuaternion(tmpParentQuat);
      if (tmpDelta.lengthSq() > 1e-6) {
        const targetYaw = Math.atan2(tmpDelta.x, tmpDelta.z);
        m.yaw += shortestAngleDelta(m.yaw, targetYaw) * Math.min(1, dt * 14);
      }
      m.stillTime = 0;
    } else {
      m.stillTime += dt;
      if (m.stillTime > 0.35) {
        m.yaw += shortestAngleDelta(m.yaw, 0) * Math.min(1, dt * 6);
      }
    }

    const blendRate = Math.min(1, dt * 12);
    m.walkBlend += ((moving ? 1 : 0) - m.walkBlend) * blendRate;
    m.airBlend += ((airborne ? 1 : 0) - m.airBlend) * Math.min(1, dt * 10);
    m.activeBlend +=
      ((active && animated && !moving ? 1 : 0) - m.activeBlend) *
      Math.min(1, dt * 6);
    m.landingSquash = Math.max(0, m.landingSquash - dt * 4.5);

    if (moving) {
      m.walkPhase += dt * (8 + Math.min(horizSpeed * 1.6, 10));
    }

    const t = animated || moving || airborne ? clock.elapsedTime : 0;
    const seatPhase = seat * 1.35;

    // Gentle idle breathing + look-around + cheerful active-turn bounce
    const idlePlay = animated ? 1 - Math.min(1, m.walkBlend + m.airBlend) : 0;
    const breath = idlePlay * Math.sin(t * 2.2 + seatPhase);
    const activeHop = m.activeBlend * Math.abs(Math.sin(t * 4.2 + seatPhase));
    const lookYaw = idlePlay * Math.sin(t * 0.85 + seatPhase) * 0.1;
    const activeTilt = m.activeBlend * Math.sin(t * 2.1 + seatPhase) * 0.08;

    // Locomotion stride
    const stride = m.walkBlend * Math.sin(m.walkPhase);
    const stepLift = m.walkBlend * Math.abs(Math.sin(m.walkPhase));

    // Squash & stretch
    const stretch =
      m.airBlend * Math.min(0.11, Math.max(-0.06, vy * 0.025)) -
      m.landingSquash * 0.14;
    const scaleY = 1 + stretch + breath * 0.015;
    const scaleXZ = 1 - stretch * 0.55 - breath * 0.008;
    facing.scale.set(
      CHIBI_SCALE * scaleXZ,
      CHIBI_SCALE * scaleY,
      CHIBI_SCALE * scaleXZ,
    );
    facing.rotation.y = m.yaw;

    // Pelvis motion
    pelvis.position.y =
      CHIBI_PIVOTS.pelvis[1] + stepLift * 0.032 + activeHop * 0.035;
    pelvis.rotation.set(
      m.walkBlend * 0.12 - m.airBlend * 0.08,
      stride * 0.09,
      activeTilt * 0.45,
    );

    // Head stabilization + playful nod/tilt
    head.rotation.set(
      -m.walkBlend * 0.06 + breath * 0.035 - activeHop * 0.04,
      lookYaw - stride * 0.05,
      activeTilt,
    );

    // Legs swing oppositely cleanly around hip joints
    const leftKneeSwing = stride * 0.78 - m.airBlend * 0.35;
    const rightKneeSwing = -stride * 0.78 - m.airBlend * 0.25;
    leftLeg.rotation.set(leftKneeSwing, 0, -m.airBlend * 0.08);
    rightLeg.rotation.set(rightKneeSwing, 0, m.airBlend * 0.08);

    // Arms swing oppositely; raise happily on big leaps / active turn
    const restArmZ = 0.11 + breath * 0.025;
    const activeWave =
      m.activeBlend * (0.28 + Math.sin(t * 6.5 + seatPhase) * 0.22);
    leftArm.rotation.set(
      -stride * 0.68 - m.airBlend * 0.4,
      0,
      restArmZ + m.airBlend * 0.55,
    );
    rightArm.rotation.set(
      stride * 0.68 - m.airBlend * 0.4 - m.activeBlend * 0.35,
      0,
      -(restArmZ + m.airBlend * 0.55 + activeWave),
    );

    // Expressive periodic eye blinks + raised brows when hopping/active
    const blinkCycle = (t + seat * 0.9) % 3.9;
    const eyeSquint =
      animated && blinkCycle < 0.14
        ? 0.12 + 0.88 * Math.abs((blinkCycle - 0.07) / 0.07)
        : 1;
    for (const eye of rig.eyes) {
      eye.scale.y = eyeSquint;
    }
    const browLift = m.airBlend * 0.012 + m.activeBlend * 0.006;
    for (const { node, baseY } of rig.brows) {
      node.position.y = baseY + browLift;
    }
  });

  if (!rig) {
    return <>{fallback}</>;
  }

  return (
    <group
      ref={facingRef}
      position={[0, showPedestal ? PEDESTAL_TOP_Y : 0, 0]}
      scale={CHIBI_SCALE}
    >
      <group ref={pelvisRef} position={[...CHIBI_PIVOTS.pelvis]}>
        <primitive object={rig.torso} />
        <group position={[0, -0.165, 0]} scale={1.12}>
          <Gear gear={cosmetics.gear} seatColor={seatColor} />
        </group>
        <group ref={headRef} position={[...CHIBI_PIVOTS.headInPelvis]}>
          <primitive object={rig.head} />
          {cosmetics.hat !== "none" && (
            <group position={[0, -0.42, -0.015]} scale={1.3}>
              <CustomHat hat={cosmetics.hat} seatColor={seatColor} />
            </group>
          )}
          {cosmetics.eyewear !== "none" && (
            <group
              position={[0, 0.142 - 0.495 * 1.38, -0.015]}
              scale={[1.38, 1.38, 1.15]}
            >
              <Eyewear eyewear={cosmetics.eyewear} />
            </group>
          )}
        </group>
        <group ref={leftArmRef} position={[...CHIBI_PIVOTS.leftArmInPelvis]}>
          <primitive object={rig.leftArm} />
        </group>
        <group ref={rightArmRef} position={[...CHIBI_PIVOTS.rightArmInPelvis]}>
          <primitive object={rig.rightArm} />
        </group>
      </group>
      <group ref={leftLegRef} position={[...CHIBI_PIVOTS.leftLeg]}>
        <primitive object={rig.leftLeg} />
      </group>
      <group ref={rightLegRef} position={[...CHIBI_PIVOTS.rightLeg]}>
        <primitive object={rig.rightLeg} />
      </group>
    </group>
  );
}
