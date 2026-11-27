import type { PlayerCosmetics, Seat } from "../../shared/engine/index.js";
import { resolveCosmetics } from "../../shared/engine/index.js";
import { PLAYER_COLORS } from "../ui/board-display.js";
import { resolveBodyColor } from "../ui/cosmetics-store.js";
import ChibiCharacter from "./ChibiCharacter.js";

function DefaultHat({
  seat,
  skin,
  seatColor,
}: {
  seat: Seat;
  skin: PlayerCosmetics["skin"];
  seatColor: string;
}) {
  if (skin === "ninja") {
    return (
      <group>
        <mesh position={[0, 0.545, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.162, 0.065, 16]} />
          <meshStandardMaterial color={seatColor} roughness={0.65} />
        </mesh>
        <mesh position={[-0.08, 0.54, -0.17]} rotation={[0.4, -0.2, -0.25]}>
          <boxGeometry args={[0.04, 0.025, 0.14]} />
          <meshStandardMaterial color={seatColor} roughness={0.65} />
        </mesh>
        <mesh position={[0.05, 0.52, -0.17]} rotation={[0.55, 0.25, 0.2]}>
          <boxGeometry args={[0.04, 0.025, 0.13]} />
          <meshStandardMaterial color={seatColor} roughness={0.65} />
        </mesh>
      </group>
    );
  }
  if (skin === "astronaut") {
    return (
      <group>
        <mesh position={[0, 0.485, 0]}>
          <sphereGeometry args={[0.195, 16, 12]} />
          <meshStandardMaterial
            color="#d8f3ff"
            transparent
            opacity={0.34}
            roughness={0.12}
          />
        </mesh>
        <mesh position={[0, 0.365, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.145, 0.02, 8, 18]} />
          <meshStandardMaterial color={seatColor} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  if (skin === "robot") {
    return (
      <group>
        <mesh position={[0, 0.66, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.016, 0.1, 8]} />
          <meshStandardMaterial
            color="#8ea0ae"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <sphereGeometry args={[0.036, 10, 8]} />
          <meshBasicMaterial color={seatColor} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (skin === "cat") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.095, 0.625, 0.01]}
            rotation={[0, 0, -side * 0.24]}
          >
            <mesh castShadow>
              <coneGeometry args={[0.058, 0.125, 4]} />
              <meshStandardMaterial color="#e69a57" roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.01, 0.024]}>
              <coneGeometry args={[0.032, 0.075, 4]} />
              <meshStandardMaterial color="#f5a8b8" roughness={0.75} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (skin === "pirate") {
    return (
      <group>
        <mesh position={[0, 0.56, 0]} castShadow>
          <cylinderGeometry args={[0.155, 0.162, 0.08, 14]} />
          <meshStandardMaterial color="#be3d24" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.605, 0]} castShadow>
          <sphereGeometry
            args={[0.158, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshStandardMaterial color="#be3d24" roughness={0.7} />
        </mesh>
      </group>
    );
  }
  if (skin === "royal") {
    return (
      <group>
        <mesh position={[0, 0.59, 0]} castShadow>
          <cylinderGeometry args={[0.135, 0.115, 0.075, 10]} />
          <meshStandardMaterial
            color="#f4bd3c"
            metalness={0.45}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.625, 0.11]}>
          <sphereGeometry args={[0.024, 8, 6]} />
          <meshBasicMaterial color={seatColor} />
        </mesh>
      </group>
    );
  }
  if (skin === "tycoon") {
    return (
      <group>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.175, 0.175, 0.022, 16]} />
          <meshStandardMaterial color="#1e2a36" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.68, 0]} castShadow>
          <cylinderGeometry args={[0.118, 0.125, 0.145, 14]} />
          <meshStandardMaterial color="#1e2a36" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.625, 0]}>
          <cylinderGeometry args={[0.126, 0.126, 0.032, 14]} />
          <meshStandardMaterial color={seatColor} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.57, 0]} castShadow>
        {seat === 2 ? (
          <coneGeometry args={[0.18, 0.24, 4]} />
        ) : seat === 3 ? (
          <boxGeometry args={[0.26, 0.11, 0.24]} />
        ) : (
          <sphereGeometry
            args={[0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
        )}
        <meshStandardMaterial color={seatColor} roughness={0.6} />
      </mesh>
      {seat === 0 && (
        <mesh position={[0, 0.582, 0.15]}>
          <boxGeometry args={[0.23, 0.024, 0.14]} />
          <meshStandardMaterial color={seatColor} />
        </mesh>
      )}
      {seat === 1 && (
        <mesh position={[0, 0.564, 0.154]}>
          <boxGeometry args={[0.22, 0.045, 0.025]} />
          <meshStandardMaterial color="#fffaf0" />
        </mesh>
      )}
    </group>
  );
}

export function CustomHat({
  hat,
  seatColor,
}: {
  hat: PlayerCosmetics["hat"];
  seatColor: string;
}) {
  switch (hat) {
    case "crown":
      return (
        <group position={[0, 0.615, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.108, 0.08, 8]} />
            <meshStandardMaterial
              color="#f4bd3c"
              metalness={0.5}
              roughness={0.3}
            />
          </mesh>
          {[0, 1, 2, 3, 4].map((index) => {
            const angle = (index / 5) * Math.PI * 2;
            return (
              <mesh
                key={index}
                position={[
                  Math.sin(angle) * 0.105,
                  0.055,
                  Math.cos(angle) * 0.105,
                ]}
                castShadow
              >
                <coneGeometry args={[0.032, 0.065, 4]} />
                <meshStandardMaterial
                  color="#f4bd3c"
                  metalness={0.5}
                  roughness={0.3}
                />
              </mesh>
            );
          })}
          <mesh position={[0, 0.005, 0.12]}>
            <sphereGeometry args={[0.024, 8, 6]} />
            <meshBasicMaterial color="#e04352" />
          </mesh>
        </group>
      );
    case "tophat":
      return (
        <group>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.185, 0.185, 0.024, 16]} />
            <meshStandardMaterial color="#1d2733" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.69, 0]} castShadow>
            <cylinderGeometry args={[0.118, 0.125, 0.165, 14]} />
            <meshStandardMaterial color="#1d2733" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.63, 0]}>
            <cylinderGeometry args={[0.128, 0.128, 0.035, 14]} />
            <meshStandardMaterial color={seatColor} roughness={0.45} />
          </mesh>
        </group>
      );
    case "cap":
      return (
        <group>
          <mesh position={[0, 0.565, 0]} castShadow>
            <sphereGeometry
              args={[0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial color={seatColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.578, 0.15]}>
            <boxGeometry args={[0.22, 0.024, 0.14]} />
            <meshStandardMaterial color={seatColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.022, 8, 6]} />
            <meshStandardMaterial color="#fffaf0" />
          </mesh>
        </group>
      );
    case "wizard":
      return (
        <group position={[0, 0.59, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.21, 0.22, 0.022, 16]} />
            <meshStandardMaterial color="#4c3b8e" roughness={0.65} />
          </mesh>
          <mesh
            position={[0, 0.135, -0.015]}
            rotation={[-0.12, 0, 0]}
            castShadow
          >
            <coneGeometry args={[0.135, 0.27, 12]} />
            <meshStandardMaterial color="#4c3b8e" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.132, 0.136, 0.036, 14]} />
            <meshStandardMaterial color="#f4bd3c" roughness={0.4} />
          </mesh>
        </group>
      );
    case "headphones":
      return (
        <group>
          <mesh position={[0, 0.51, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.165, 0.02, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#273645" roughness={0.45} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.168, 0.49, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.062, 0.062, 0.048, 12]} />
                <meshStandardMaterial color="#273645" roughness={0.45} />
              </mesh>
              <mesh
                position={[side * 0.026, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.042, 0.042, 0.01, 12]} />
                <meshBasicMaterial color={seatColor} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "halo":
      return (
        <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.135, 0.02, 10, 24]} />
          <meshBasicMaterial color="#ffe066" toneMapped={false} />
        </mesh>
      );
    case "propeller":
      return (
        <group>
          <mesh position={[0, 0.565, 0]} castShadow>
            <sphereGeometry
              args={[0.166, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial color="#2d9f7e" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.73, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.04, 8]} />
            <meshStandardMaterial color="#f4bd3c" />
          </mesh>
          <mesh position={[0, 0.755, 0]} rotation={[0, 0.4, 0]}>
            <boxGeometry args={[0.24, 0.014, 0.036]} />
            <meshStandardMaterial color="#be3d24" roughness={0.45} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

export function Eyewear({ eyewear }: { eyewear: PlayerCosmetics["eyewear"] }) {
  switch (eyewear) {
    case "shades":
      return (
        <group position={[0, 0.495, 0.148]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.056, 0, 0]}>
              <boxGeometry args={[0.082, 0.05, 0.025]} />
              <meshStandardMaterial
                color="#141e27"
                metalness={0.35}
                roughness={0.2}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.008, 0]}>
            <boxGeometry args={[0.045, 0.014, 0.02]} />
            <meshStandardMaterial color="#141e27" />
          </mesh>
        </group>
      );
    case "monocle":
      return (
        <group position={[0.054, 0.495, 0.155]}>
          <mesh>
            <torusGeometry args={[0.034, 0.008, 8, 16]} />
            <meshStandardMaterial
              color="#f4bd3c"
              metalness={0.65}
              roughness={0.25}
            />
          </mesh>
          <mesh>
            <circleGeometry args={[0.03, 14]} />
            <meshStandardMaterial
              color="#c8ecff"
              transparent
              opacity={0.42}
              roughness={0.1}
            />
          </mesh>
        </group>
      );
    case "visor":
      return (
        <mesh position={[0, 0.498, 0.145]}>
          <boxGeometry args={[0.22, 0.052, 0.048]} />
          <meshBasicMaterial color="#3ee8ff" toneMapped={false} />
        </mesh>
      );
    case "round":
      return (
        <group position={[0, 0.495, 0.153]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.054, 0, 0]}>
              <torusGeometry args={[0.034, 0.007, 8, 16]} />
              <meshStandardMaterial
                color="#334857"
                metalness={0.4}
                roughness={0.3}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.006, 0]}>
            <boxGeometry args={[0.042, 0.01, 0.01]} />
            <meshStandardMaterial color="#334857" />
          </mesh>
        </group>
      );
    case "star":
      return (
        <group position={[0, 0.495, 0.15]}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.058, 0, 0]}
              rotation={[0, 0, Math.PI / 5]}
            >
              <cylinderGeometry args={[0.045, 0.045, 0.018, 5]} />
              <meshBasicMaterial color="#ffd447" toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0.005, 0]}>
            <boxGeometry args={[0.04, 0.012, 0.016]} />
            <meshBasicMaterial color="#ffd447" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

export function Gear({
  gear,
  seatColor,
}: {
  gear: PlayerCosmetics["gear"];
  seatColor: string;
}) {
  switch (gear) {
    case "wings":
      return (
        <group position={[0, 0.31, -0.14]}>
          {[-1, 1].map((side) => (
            <group
              key={side}
              position={[side * 0.13, 0.03, -0.02]}
              rotation={[0.25, side * -0.4, side * -0.35]}
            >
              <mesh castShadow>
                <boxGeometry args={[0.17, 0.095, 0.024]} />
                <meshStandardMaterial color="#fffaf2" roughness={0.45} />
              </mesh>
              <mesh position={[side * 0.03, -0.06, -0.005]}>
                <boxGeometry args={[0.12, 0.065, 0.02]} />
                <meshStandardMaterial color="#eef6ff" roughness={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "cape":
      return (
        <mesh position={[0, 0.25, -0.145]} rotation={[0.22, 0, 0]} castShadow>
          <boxGeometry args={[0.24, 0.27, 0.024]} />
          <meshStandardMaterial color={seatColor} roughness={0.75} />
        </mesh>
      );
    case "jetpack":
      return (
        <group position={[0, 0.28, -0.14]}>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.06, 0, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.044, 0.048, 0.19, 10]} />
                <meshStandardMaterial
                  color="#b7c6d4"
                  metalness={0.55}
                  roughness={0.3}
                />
              </mesh>
              <mesh position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.036, 0.075, 8]} />
                <meshBasicMaterial color="#ff9329" toneMapped={false} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.03, 0.02]}>
            <boxGeometry args={[0.15, 0.06, 0.035]} />
            <meshStandardMaterial color={seatColor} roughness={0.5} />
          </mesh>
        </group>
      );
    case "bowtie":
      return (
        <group position={[0, 0.365, 0.138]}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.034, 0, 0]}
              rotation={[0, 0, (side * Math.PI) / 2]}
            >
              <coneGeometry args={[0.032, 0.056, 4]} />
              <meshStandardMaterial color="#e04352" roughness={0.5} />
            </mesh>
          ))}
          <mesh>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshStandardMaterial color="#f4bd3c" />
          </mesh>
        </group>
      );
    case "scarf":
      return (
        <group>
          <mesh position={[0, 0.365, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.118, 0.03, 8, 18]} />
            <meshStandardMaterial color={seatColor} roughness={0.85} />
          </mesh>
          <mesh position={[0.055, 0.275, 0.135]} rotation={[-0.18, 0, -0.15]}>
            <boxGeometry args={[0.055, 0.15, 0.026]} />
            <meshStandardMaterial color={seatColor} roughness={0.85} />
          </mesh>
        </group>
      );
    case "shield":
      return (
        <group position={[0, 0.29, -0.145]} rotation={[-0.12, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.135, 0.135, 0.03, 14]} />
            <meshStandardMaterial
              color="#c8d6e2"
              metalness={0.45}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0, -0.018]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.01, 12]} />
            <meshStandardMaterial color={seatColor} roughness={0.5} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

export default function PawnModel({
  seat,
  cosmetics: rawCosmetics,
  control,
  showPedestal = true,
  active = false,
  animated = false,
}: {
  seat: Seat;
  cosmetics?: PlayerCosmetics | null;
  control?: "human" | "bot" | null;
  showPedestal?: boolean;
  active?: boolean;
  animated?: boolean;
}) {
  const cosmetics = resolveCosmetics(seat, control, rawCosmetics);
  const seatColor = PLAYER_COLORS[seat];
  const bodyColor = resolveBodyColor(seat, cosmetics);
  const skinColor =
    cosmetics.skin === "robot"
      ? "#b8c7d4"
      : cosmetics.skin === "cat"
        ? "#ffd9a8"
        : "#f7c88b";
  const armColor =
    cosmetics.skin === "astronaut"
      ? "#edf2f7"
      : cosmetics.skin === "robot"
        ? "#93a5b3"
        : bodyColor;

  const primitiveBody = (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.065, 0.12, 0.025]} castShadow>
            <boxGeometry args={[0.085, 0.11, 0.12]} />
            <meshStandardMaterial
              color={cosmetics.skin === "robot" ? "#4e6272" : "#294758"}
            />
          </mesh>
          <mesh
            position={[side * 0.17, 0.29, 0]}
            rotation={[0, 0, side * 0.27]}
            castShadow
          >
            <capsuleGeometry args={[0.05, 0.16, 3, 8]} />
            <meshStandardMaterial
              color={armColor}
              metalness={cosmetics.skin === "robot" ? 0.35 : 0}
              roughness={cosmetics.skin === "robot" ? 0.45 : 0.7}
            />
          </mesh>
          <mesh position={[side * 0.19, 0.19, 0.014]}>
            <sphereGeometry args={[0.053, 8, 6]} />
            <meshStandardMaterial color={skinColor} />
          </mesh>
        </group>
      ))}
      {/* Torso */}
      <mesh position={[0, 0.28, 0]} castShadow>
        {cosmetics.skin === "robot" ? (
          <boxGeometry args={[0.25, 0.26, 0.22]} />
        ) : (
          <capsuleGeometry args={[0.135, 0.13, 4, 10]} />
        )}
        <meshStandardMaterial
          color={bodyColor}
          metalness={cosmetics.skin === "robot" ? 0.38 : 0}
          roughness={cosmetics.skin === "robot" ? 0.4 : 0.75}
        />
      </mesh>

      {/* Skin chest details */}
      {cosmetics.skin === "tycoon" && (
        <group>
          <mesh position={[0, 0.295, 0.125]}>
            <boxGeometry args={[0.08, 0.16, 0.02]} />
            <meshStandardMaterial color="#fffaf2" />
          </mesh>
          <mesh position={[0, 0.29, 0.136]}>
            <boxGeometry args={[0.028, 0.13, 0.012]} />
            <meshStandardMaterial color={seatColor} />
          </mesh>
        </group>
      )}
      {cosmetics.skin === "astronaut" && (
        <group>
          <mesh position={[0, 0.29, 0.13]}>
            <boxGeometry args={[0.11, 0.085, 0.022]} />
            <meshStandardMaterial color={seatColor} />
          </mesh>
          {cosmetics.gear === "none" && (
            <mesh position={[0, 0.29, -0.14]} castShadow>
              <boxGeometry args={[0.16, 0.19, 0.08]} />
              <meshStandardMaterial color="#d9e3ec" roughness={0.6} />
            </mesh>
          )}
        </group>
      )}
      {cosmetics.skin === "robot" && (
        <mesh position={[0, 0.29, 0.114]}>
          <cylinderGeometry args={[0.042, 0.042, 0.016, 12]} />
          <meshBasicMaterial color={seatColor} toneMapped={false} />
        </mesh>
      )}
      {cosmetics.skin === "pirate" && (
        <mesh position={[0, 0.275, 0.13]} rotation={[0, 0, -0.6]}>
          <boxGeometry args={[0.042, 0.26, 0.022]} />
          <meshStandardMaterial color="#f4bd3c" roughness={0.45} />
        </mesh>
      )}
      {cosmetics.skin === "royal" && (
        <mesh position={[0, 0.365, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.026, 8, 16]} />
          <meshStandardMaterial color="#fffaf0" roughness={0.85} />
        </mesh>
      )}
      {cosmetics.skin === "cat" && (
        <mesh position={[0, 0.355, 0.132]}>
          <sphereGeometry args={[0.028, 8, 6]} />
          <meshStandardMaterial
            color="#f4bd3c"
            metalness={0.5}
            roughness={0.3}
          />
        </mesh>
      )}

      {/* Head */}
      <mesh position={[0, 0.48, 0]} castShadow>
        {cosmetics.skin === "robot" ? (
          <boxGeometry args={[0.25, 0.22, 0.23]} />
        ) : (
          <sphereGeometry args={[0.155, 12, 9]} />
        )}
        <meshStandardMaterial
          color={skinColor}
          metalness={cosmetics.skin === "robot" ? 0.35 : 0}
          roughness={cosmetics.skin === "robot" ? 0.45 : 0.8}
        />
      </mesh>

      {/* Ninja lower face mask */}
      {cosmetics.skin === "ninja" && (
        <mesh position={[0, 0.44, 0.025]}>
          <cylinderGeometry args={[0.145, 0.132, 0.095, 14]} />
          <meshStandardMaterial color="#253143" roughness={0.8} />
        </mesh>
      )}

      {/* Eyes */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * 0.054,
            0.495,
            cosmetics.skin === "robot" ? 0.12 : 0.14,
          ]}
        >
          <sphereGeometry args={[0.018, 6, 5]} />
          <meshBasicMaterial
            color={cosmetics.skin === "robot" ? "#5cf0ff" : "#173b45"}
          />
        </mesh>
      ))}

      {/* Mouth */}
      {cosmetics.skin !== "ninja" && cosmetics.skin !== "robot" && (
        <mesh position={[0, 0.443, 0.149]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.037, 0.007, 4, 8, Math.PI]} />
          <meshBasicMaterial color="#944f35" />
        </mesh>
      )}

      {/* Hat slot */}
      {cosmetics.hat === "none" ? (
        <DefaultHat seat={seat} skin={cosmetics.skin} seatColor={seatColor} />
      ) : (
        <CustomHat hat={cosmetics.hat} seatColor={seatColor} />
      )}

      {/* Eyewear slot */}
      <Eyewear eyewear={cosmetics.eyewear} />

      {/* Back / neck gear slot */}
      <Gear gear={cosmetics.gear} seatColor={seatColor} />
    </group>
  );

  return (
    <group>
      {active && showPedestal && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.245, 24]} />
          <meshBasicMaterial color="#ffcf59" toneMapped={false} />
        </mesh>
      )}
      <group>
        {showPedestal && (
          <>
            <mesh position={[0, 0.005, 0]} castShadow>
              <cylinderGeometry args={[0.19, 0.2, 0.07, 16]} />
              <meshStandardMaterial color={seatColor} />
            </mesh>
            <mesh position={[0, 0.046, 0]}>
              <cylinderGeometry args={[0.153, 0.153, 0.019, 16]} />
              <meshStandardMaterial color="#fffaf0" />
            </mesh>
          </>
        )}
        {cosmetics.skin === "chibi" ? (
          <ChibiCharacter
            seat={seat}
            cosmetics={cosmetics}
            seatColor={seatColor}
            showPedestal={showPedestal}
            active={active}
            animated={animated}
            fallback={primitiveBody}
          />
        ) : (
          primitiveBody
        )}
      </group>
    </group>
  );
}
