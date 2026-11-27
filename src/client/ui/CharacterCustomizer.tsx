import { Canvas, useFrame } from "@react-three/fiber";
import {
  type MutableRefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import {
  CHARACTER_SKINS,
  DEFAULT_COSMETICS,
  EYEWEAR_ACCESSORIES,
  GEAR_ACCESSORIES,
  HAT_ACCESSORIES,
  OUTFIT_TONES,
  type PlayerCosmetics,
  type Seat,
} from "../../shared/engine/index.js";
import { useLocale } from "../i18n.js";
import PawnModel from "../scene/PawnModel.js";
import ActionButton from "./ActionButton.js";
import { PLAYER_COLORS } from "./board-display.js";
import {
  eyewearLabel,
  gearLabel,
  hatLabel,
  OUTFIT_TONE_HEX,
  randomCosmetics,
  skinLabel,
  toneLabel,
} from "./cosmetics-store.js";
import Icon from "./Icon.js";
import PlayerAvatar from "./PlayerAvatar.js";
import "./CharacterCustomizer.css";

type CustomizerSection = "skin" | "tone" | "hat" | "eyewear" | "gear";

function TonePreviewSwatch({
  seat,
  tone,
}: {
  seat: Seat;
  tone: (typeof OUTFIT_TONES)[number];
}) {
  const hex = tone === "seat" ? PLAYER_COLORS[seat] : OUTFIT_TONE_HEX[tone];
  return (
    <span
      className="customizer-swatch"
      style={{ background: hex }}
      aria-hidden="true"
    />
  );
}

function TurntablePawn({
  seat,
  cosmetics,
  dragYaw,
}: {
  seat: Seat;
  cosmetics: PlayerCosmetics;
  dragYaw: MutableRefObject<number | null>;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_state, delta) => {
    if (!group.current) return;
    if (dragYaw.current !== null) group.current.rotation.y = dragYaw.current;
    else group.current.rotation.y += delta * 0.9;
  });
  return (
    <group ref={group} position={[0, -0.34, 0]}>
      <PawnModel seat={seat} cosmetics={cosmetics} showPedestal animated />
    </group>
  );
}

export default function CharacterCustomizerDialog({
  open,
  seat,
  playerName,
  value,
  onClose,
  onApply,
}: {
  open: boolean;
  seat: Seat;
  playerName: string;
  value: PlayerCosmetics;
  onClose: () => void;
  onApply: (cosmetics: PlayerCosmetics) => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState<PlayerCosmetics>(value);
  const [section, setSection] = useState<CustomizerSection>("skin");
  const dragYaw = useRef<number | null>(null);
  const dragging = useRef<{ x: number; startYaw: number } | null>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  const sections: readonly { id: CustomizerSection; label: string }[] = [
    { id: "skin", label: t("Skin", "Skin", "Skin nhân vật") },
    { id: "tone", label: t("Couleur", "Color", "Màu áo") },
    { id: "hat", label: t("Chapeau", "Hat", "Mũ / Đội đầu") },
    { id: "eyewear", label: t("Lunettes", "Glasses", "Kính") },
    { id: "gear", label: t("Accessoire", "Gear", "Phụ kiện") },
  ];

  return (
    <dialog
      ref={dialog}
      className="customizer-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="customizer-head">
        <div>
          <span className="travel-stamp">
            {t("Atelier du pion", "Character Studio", "Tùy chỉnh nhân vật")}
          </span>
          <h2 id={titleId}>{playerName}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Fermer", "Close", "Đóng")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="customizer-body">
        <div className="customizer-stage">
          <div
            className="customizer-3d-frame"
            onPointerDown={(event) => {
              dragging.current = {
                x: event.clientX,
                startYaw: dragYaw.current ?? 0.5,
              };
            }}
            onPointerMove={(event) => {
              if (!dragging.current) return;
              dragYaw.current =
                dragging.current.startYaw +
                (event.clientX - dragging.current.x) * 0.015;
            }}
            onPointerUp={() => {
              dragging.current = null;
            }}
            onPointerLeave={() => {
              dragging.current = null;
            }}
          >
            {open && (
              <Canvas
                dpr={[1, 1.5]}
                camera={{ position: [0.65, 0.56, 1.25], fov: 36 }}
                gl={{
                  antialias: true,
                  alpha: true,
                  toneMapping: THREE.NeutralToneMapping,
                }}
                onCreated={({ camera }) => camera.lookAt(0, 0.04, 0)}
              >
                <ambientLight intensity={1.15} />
                <directionalLight position={[-2, 4, 3]} intensity={1.35} />
                <directionalLight position={[2, 1.5, 2.5]} intensity={0.5} />
                <hemisphereLight args={["#eef8ff", "#c4bda2", 0.9]} />
                <TurntablePawn
                  seat={seat}
                  cosmetics={draft}
                  dragYaw={dragYaw}
                />
              </Canvas>
            )}
          </div>
          <div className="customizer-2d-badge">
            <PlayerAvatar seat={seat} cosmetics={draft} />
            <div className="customizer-summary">
              <strong>{skinLabel(draft.skin)}</strong>
              <span>
                {draft.hat !== "none"
                  ? hatLabel(draft.hat)
                  : toneLabel(draft.tone)}
                {draft.eyewear !== "none"
                  ? ` · ${eyewearLabel(draft.eyewear)}`
                  : ""}
                {draft.gear !== "none" ? ` · ${gearLabel(draft.gear)}` : ""}
              </span>
            </div>
          </div>
          <div className="customizer-quick-actions">
            <button
              type="button"
              className="button secondary customizer-mini-btn"
              onClick={() => setDraft(randomCosmetics())}
            >
              <Icon name="dice" size={16} />
              {t("Aléatoire", "Random", "Ngẫu nhiên")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setDraft(DEFAULT_COSMETICS)}
            >
              {t("Réinitialiser", "Reset", "Mặc định")}
            </button>
          </div>
        </div>

        <div className="customizer-controls">
          <div className="customizer-tabs" role="tablist">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                className={`customizer-tab ${section === item.id ? "active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="customizer-grid" role="tabpanel">
            {section === "skin" &&
              CHARACTER_SKINS.map((skin) => (
                <button
                  key={skin}
                  type="button"
                  className={`customizer-option ${draft.skin === skin ? "selected" : ""}`}
                  aria-pressed={draft.skin === skin}
                  onClick={() => setDraft((prev) => ({ ...prev, skin }))}
                >
                  <PlayerAvatar
                    seat={seat}
                    cosmetics={{ ...draft, skin, hat: "none" }}
                  />
                  <span>{skinLabel(skin)}</span>
                </button>
              ))}

            {section === "tone" &&
              OUTFIT_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={`customizer-option ${draft.tone === tone ? "selected" : ""}`}
                  aria-pressed={draft.tone === tone}
                  onClick={() => setDraft((prev) => ({ ...prev, tone }))}
                >
                  <TonePreviewSwatch seat={seat} tone={tone} />
                  <span>{toneLabel(tone)}</span>
                </button>
              ))}

            {section === "hat" &&
              HAT_ACCESSORIES.map((hat) => (
                <button
                  key={hat}
                  type="button"
                  className={`customizer-option ${draft.hat === hat ? "selected" : ""}`}
                  aria-pressed={draft.hat === hat}
                  onClick={() => setDraft((prev) => ({ ...prev, hat }))}
                >
                  <PlayerAvatar seat={seat} cosmetics={{ ...draft, hat }} />
                  <span>{hatLabel(hat)}</span>
                </button>
              ))}

            {section === "eyewear" &&
              EYEWEAR_ACCESSORIES.map((eyewear) => (
                <button
                  key={eyewear}
                  type="button"
                  className={`customizer-option ${draft.eyewear === eyewear ? "selected" : ""}`}
                  aria-pressed={draft.eyewear === eyewear}
                  onClick={() => setDraft((prev) => ({ ...prev, eyewear }))}
                >
                  <PlayerAvatar seat={seat} cosmetics={{ ...draft, eyewear }} />
                  <span>{eyewearLabel(eyewear)}</span>
                </button>
              ))}

            {section === "gear" &&
              GEAR_ACCESSORIES.map((gear) => (
                <button
                  key={gear}
                  type="button"
                  className={`customizer-option ${draft.gear === gear ? "selected" : ""}`}
                  aria-pressed={draft.gear === gear}
                  onClick={() => setDraft((prev) => ({ ...prev, gear }))}
                >
                  <PlayerAvatar seat={seat} cosmetics={{ ...draft, gear }} />
                  <span>{gearLabel(gear)}</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="customizer-footer">
        <button type="button" className="text-button" onClick={onClose}>
          {t("Annuler", "Cancel", "Hủy")}
        </button>
        <ActionButton
          type="button"
          className="button primary"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          <Icon name="check" size={18} />
          {t("Appliquer", "Apply", "Áp dụng")}
        </ActionButton>
      </div>
    </dialog>
  );
}
