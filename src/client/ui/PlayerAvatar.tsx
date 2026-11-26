import type { CSSProperties } from "react";
import { useState } from "react";
import {
  type PlayerCosmetics,
  resolveCosmetics,
  type Seat,
} from "../../shared/engine/index.js";
import { PLAYER_COLORS } from "./board-display.js";
import { resolveBodyColor } from "./cosmetics-store.js";
import "./PlayerAvatar.css";

/** Cosmetic appearance is independent of the player's seat and room role. */
export type AvatarAppearance =
  | { kind: "pawn" }
  | { kind: "portrait"; src: string };

function AvatarVector({
  seat,
  cosmetics,
}: {
  seat: Seat;
  cosmetics: PlayerCosmetics;
}) {
  const seatColor = PLAYER_COLORS[seat];
  const bodyColor = resolveBodyColor(seat, cosmetics);
  const skinColor =
    cosmetics.skin === "robot"
      ? "#b8c7d4"
      : cosmetics.skin === "cat"
        ? "#ffd9a8"
        : "#f5c289";
  const armColor =
    cosmetics.skin === "astronaut"
      ? "#edf2f7"
      : cosmetics.skin === "robot"
        ? "#93a5b3"
        : bodyColor;

  return (
    <svg
      className="avatar-svg"
      viewBox="0 0 64 76"
      width="64"
      height="76"
      aria-hidden="true"
    >
      {/* Back gear behind torso */}
      {cosmetics.gear === "wings" && (
        <g>
          <path
            d="M16 42 C5 34, 4 47, 15 53 L19 50 Z"
            fill="#fffaf2"
            stroke="#c5d7e5"
            strokeWidth="1.5"
          />
          <path
            d="M48 42 C59 34, 60 47, 49 53 L45 50 Z"
            fill="#fffaf2"
            stroke="#c5d7e5"
            strokeWidth="1.5"
          />
        </g>
      )}
      {cosmetics.gear === "cape" && (
        <path
          d="M18 42 L10 69 L54 69 L46 42 Z"
          fill={seatColor}
          opacity="0.92"
        />
      )}
      {cosmetics.gear === "jetpack" && (
        <g>
          <rect x="9" y="42" width="8" height="19" rx="3" fill="#9fb2c2" />
          <rect x="47" y="42" width="8" height="19" rx="3" fill="#9fb2c2" />
          <polygon points="10,61 16,61 13,68" fill="#ff9329" />
          <polygon points="48,61 54,61 51,68" fill="#ff9329" />
        </g>
      )}
      {cosmetics.gear === "shield" && (
        <g>
          <circle
            cx="50"
            cy="52"
            r="9"
            fill="#c8d6e2"
            stroke="#596d7e"
            strokeWidth="1.5"
          />
          <circle cx="50" cy="52" r="5" fill={seatColor} />
        </g>
      )}

      {/* Halo behind top of head */}
      {cosmetics.hat === "halo" && (
        <ellipse
          cx="32"
          cy="11"
          rx="14"
          ry="4"
          fill="none"
          stroke="#ffe066"
          strokeWidth="3"
        />
      )}

      {/* Astronaut helmet back bubble */}
      {cosmetics.skin === "astronaut" && cosmetics.hat === "none" && (
        <circle
          cx="32"
          cy="30"
          r="19"
          fill="#bfe8ff"
          fillOpacity="0.38"
          stroke="#88b8d0"
          strokeWidth="1.5"
        />
      )}

      {/* Arms */}
      <rect x="7" y="45" width="8" height="15" rx="4" fill={armColor} />
      <rect x="49" y="45" width="8" height="15" rx="4" fill={armColor} />
      <circle cx="11" cy="59" r="3.6" fill={skinColor} />
      <circle cx="53" cy="59" r="3.6" fill={skinColor} />

      {/* Torso */}
      <rect
        x="13"
        y="40"
        width="38"
        height="30"
        rx={cosmetics.skin === "robot" ? 6 : 11}
        fill={bodyColor}
      />

      {/* Skin torso details */}
      {cosmetics.skin === "tycoon" && (
        <g>
          <polygon points="26,40 38,40 32,57" fill="#fffaf2" />
          <polygon points="30,41 34,41 35,55 32,58 29,55" fill={seatColor} />
        </g>
      )}
      {cosmetics.skin === "astronaut" && (
        <rect x="24" y="46" width="16" height="9" rx="2.5" fill={seatColor} />
      )}
      {cosmetics.skin === "robot" && (
        <circle cx="32" cy="52" r="5" fill={seatColor} />
      )}
      {cosmetics.skin === "pirate" && (
        <path d="M16 42 L48 64 L44 68 L13 46 Z" fill="#f4bd3c" />
      )}
      {cosmetics.skin === "royal" && (
        <path
          d="M17 41 Q32 49 47 41"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="5"
          strokeLinecap="round"
        />
      )}
      {cosmetics.skin === "cat" && (
        <circle cx="32" cy="43" r="3.6" fill="#f4bd3c" />
      )}

      {/* Neck gear (scarf / bowtie) */}
      {cosmetics.gear === "scarf" && (
        <g>
          <rect x="19" y="38" width="26" height="7" rx="3.5" fill={seatColor} />
          <rect x="36" y="42" width="7" height="15" rx="3" fill={seatColor} />
        </g>
      )}
      {cosmetics.gear === "bowtie" && (
        <g transform="translate(32, 42)">
          <polygon points="-9,-4 0,0 -9,4" fill="#e04352" />
          <polygon points="9,-4 0,0 9,4" fill="#e04352" />
          <circle cx="0" cy="0" r="2.4" fill="#f4bd3c" />
        </g>
      )}

      {/* Pedestal trim bar at bottom */}
      <rect x="13" y="66" width="38" height="5" rx="2.5" fill={seatColor} />

      {/* Head */}
      <rect
        x="17"
        y="17"
        width="30"
        height="24"
        rx={cosmetics.skin === "robot" ? 6 : 12}
        fill={skinColor}
      />

      {/* Ninja mask */}
      {cosmetics.skin === "ninja" && (
        <rect x="17" y="29" width="30" height="12" rx="5" fill="#253143" />
      )}

      {/* Eyes */}
      <circle
        cx="26"
        cy="28"
        r="2.2"
        fill={cosmetics.skin === "robot" ? "#5cf0ff" : "#173b45"}
      />
      <circle
        cx="38"
        cy="28"
        r="2.2"
        fill={cosmetics.skin === "robot" ? "#5cf0ff" : "#173b45"}
      />

      {/* Smile */}
      {cosmetics.skin !== "ninja" && cosmetics.skin !== "robot" && (
        <path
          d="M27 34 Q32 38 37 34"
          fill="none"
          stroke="#944f35"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}

      {/* Eyewear */}
      {cosmetics.eyewear === "shades" && (
        <g>
          <rect x="19" y="24" width="11" height="7" rx="2" fill="#141e27" />
          <rect x="34" y="24" width="11" height="7" rx="2" fill="#141e27" />
          <line
            x1="30"
            y1="27"
            x2="34"
            y2="27"
            stroke="#141e27"
            strokeWidth="2"
          />
        </g>
      )}
      {cosmetics.eyewear === "monocle" && (
        <g>
          <circle
            cx="38"
            cy="28"
            r="4.5"
            fill="#bfeaff"
            fillOpacity="0.45"
            stroke="#f4bd3c"
            strokeWidth="1.6"
          />
          <line
            x1="42"
            y1="31"
            x2="42"
            y2="40"
            stroke="#f4bd3c"
            strokeWidth="1"
          />
        </g>
      )}
      {cosmetics.eyewear === "visor" && (
        <rect
          x="18"
          y="24"
          width="28"
          height="6.5"
          rx="3"
          fill="#3ee8ff"
          opacity="0.9"
        />
      )}
      {cosmetics.eyewear === "round" && (
        <g stroke="#294758" strokeWidth="1.5" fill="none">
          <circle cx="26" cy="28" r="4.3" />
          <circle cx="38" cy="28" r="4.3" />
          <line x1="30.3" y1="28" x2="33.7" y2="28" />
        </g>
      )}
      {cosmetics.eyewear === "star" && (
        <g fill="#ffd447" stroke="#c98512" strokeWidth="0.9">
          <circle cx="25.5" cy="28" r="4.8" />
          <circle cx="38.5" cy="28" r="4.8" />
          <line
            x1="30"
            y1="28"
            x2="34"
            y2="28"
            stroke="#c98512"
            strokeWidth="1.6"
          />
        </g>
      )}

      {/* Default hat per skin when hat === "none" */}
      {cosmetics.hat === "none" && cosmetics.skin === "classic" && (
        <path d="M16 21 C16 11, 48 11, 48 21 Z" fill={seatColor} />
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "ninja" && (
        <g>
          <rect x="16" y="16" width="32" height="6" rx="2" fill={seatColor} />
          <polygon points="48,18 57,14 55,22" fill={seatColor} />
        </g>
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "robot" && (
        <g>
          <line
            x1="32"
            y1="17"
            x2="32"
            y2="10"
            stroke="#738797"
            strokeWidth="2.5"
          />
          <circle cx="32" cy="8.5" r="3.2" fill={seatColor} />
        </g>
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "cat" && (
        <g>
          <polygon points="18,20 22,8 29,18" fill="#e69a57" />
          <polygon points="46,20 42,8 35,18" fill="#e69a57" />
          <polygon points="20,18 22,11 26,17" fill="#f5a8b8" />
          <polygon points="44,18 42,11 38,17" fill="#f5a8b8" />
        </g>
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "pirate" && (
        <path d="M16 21 C16 12, 48 12, 48 21 Z" fill="#be3d24" />
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "royal" && (
        <polygon
          points="20,19 20,10 26,14 32,7 38,14 44,10 44,19"
          fill="#f4bd3c"
        />
      )}
      {cosmetics.hat === "none" && cosmetics.skin === "tycoon" && (
        <g>
          <rect x="14" y="17" width="36" height="3.5" rx="1.5" fill="#1e2a36" />
          <rect x="21" y="5" width="22" height="13" rx="2" fill="#1e2a36" />
          <rect x="21" y="14" width="22" height="3" fill={seatColor} />
        </g>
      )}

      {/* Custom hats */}
      {cosmetics.hat === "crown" && (
        <g>
          <polygon
            points="19,19 19,9 26,14 32,6 38,14 45,9 45,19"
            fill="#f4bd3c"
          />
          <circle cx="32" cy="15" r="2.2" fill="#e04352" />
        </g>
      )}
      {cosmetics.hat === "tophat" && (
        <g>
          <rect x="14" y="17" width="36" height="3.5" rx="1.5" fill="#1d2733" />
          <rect x="20" y="4" width="24" height="14" rx="2" fill="#1d2733" />
          <rect x="20" y="14" width="24" height="3" fill={seatColor} />
        </g>
      )}
      {cosmetics.hat === "cap" && (
        <g>
          <path d="M16 21 C16 11, 48 11, 48 21 Z" fill={seatColor} />
          <rect x="28" y="18" width="22" height="4" rx="2" fill={seatColor} />
        </g>
      )}
      {cosmetics.hat === "wizard" && (
        <g>
          <ellipse cx="32" cy="18" rx="20" ry="3.5" fill="#4c3b8e" />
          <polygon points="19,18 32,2 45,18" fill="#4c3b8e" />
          <rect x="23" y="14" width="18" height="3" fill="#f4bd3c" />
        </g>
      )}
      {cosmetics.hat === "headphones" && (
        <g>
          <path
            d="M15 28 C15 11, 49 11, 49 28"
            fill="none"
            stroke="#273645"
            strokeWidth="3.5"
          />
          <rect x="11" y="23" width="6.5" height="11" rx="3" fill="#273645" />
          <rect x="46.5" y="23" width="6.5" height="11" rx="3" fill="#273645" />
          <rect x="12" y="26" width="2.5" height="5" rx="1" fill={seatColor} />
          <rect
            x="49.5"
            y="26"
            width="2.5"
            height="5"
            rx="1"
            fill={seatColor}
          />
        </g>
      )}
      {cosmetics.hat === "propeller" && (
        <g>
          <path d="M16 21 C16 11, 48 11, 48 21 Z" fill="#2d9f7e" />
          <line
            x1="32"
            y1="13"
            x2="32"
            y2="7"
            stroke="#f4bd3c"
            strokeWidth="2.5"
          />
          <rect x="21" y="5" width="22" height="3.2" rx="1.5" fill="#be3d24" />
        </g>
      )}
    </svg>
  );
}

export default function PlayerAvatar({
  seat,
  cosmetics,
  control = "human",
  appearance,
}: {
  seat: Seat;
  cosmetics?: PlayerCosmetics | null;
  control?: "human" | "bot" | null;
  /** Future avatar selections can supply a portrait to this shared renderer. */
  appearance?: AvatarAppearance;
}) {
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const portrait = appearance?.kind === "portrait" ? appearance.src : null;
  const showPortrait = Boolean(portrait && portrait !== failedPortrait);
  const resolved = resolveCosmetics(seat, control, cosmetics);
  return (
    <div
      className="player-avatar"
      data-avatar-kind={showPortrait ? "portrait" : "pawn"}
      aria-hidden="true"
      style={{ "--player-color": PLAYER_COLORS[seat] } as CSSProperties}
    >
      {showPortrait && portrait ? (
        <img
          className="avatar-portrait"
          src={portrait}
          alt=""
          onError={() => setFailedPortrait(portrait)}
        />
      ) : (
        <AvatarVector seat={seat} cosmetics={resolved} />
      )}
    </div>
  );
}
