// The page UI, minimal, on Night glass:
//   - your camera, top right (CameraFrame.tsx): tap it to tuck it away; a
//     small camera button then sits in the corner to bring it back
//   - one floating dock, bottom centre, icons only: the style (a card of four
//     beats), play / stop, the effects (a card of the four pads and the
//     drop), the view (front, player, close), day / night, and how to play.
//     A small label shows over a button on hover, or for a moment after a tap.
//   - the how-to-play steps (after Start, or from the dock)
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useXRReady } from "@vincentt-xr/sdk/low-level";

import {
  COLOURS,
  DOCK_BOTTOM,
  DOCK_HEIGHT,
  frameRect,
  GUTTER,
  pinToScreen,
  type View,
} from "./layout";
import { STYLE, STYLES, type StyleId } from "./music";
import {
  closeHowTo,
  dj,
  drop,
  INTRO_CARD_MS,
  nextView,
  pad,
  PAD_LABEL,
  PADS,
  setCard,
  setNight,
  setStyle,
  togglePlay,
  toggleCam,
  useDjVersion,
} from "./state";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ACCENT = "#f4d968";
/** After a tap the label stays this long (ms). */
const TAP_LABEL = 1000;

const CSS = `
.vl-root { position: absolute; inset: 0; pointer-events: none; color: #fff;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.vl-glass { background: rgb(35 37 40 / .64);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(235 246 253 / .18);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .22), 0 8px 24px rgb(0 0 0 / .22); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .vl-glass { background: rgb(35 37 40 / .82); } }
.vl-dock { position: absolute; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 0px) + ${DOCK_BOTTOM}px);
  display: flex; gap: 6px; padding: 6px; border-radius: 999px; pointer-events: auto; }
.vl-btn { pointer-events: auto; border: 0; padding: 0; margin: 0; color: inherit; position: relative;
  display: grid; place-items: center; cursor: pointer; outline: none; touch-action: manipulation;
  width: 44px; height: 44px; border-radius: 50%; background: transparent;
  transition: transform 160ms ease-out, background 200ms ${EASE}; }
.vl-btn:hover { background: rgb(255 255 255 / .08); }
.vl-btn:active { transform: scale(0.94); }
.vl-btn:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}; }
.vl-btn.on { color: ${ACCENT}; background: rgb(244 217 104 / .14); }
.vl-btn .vl-mark { position: absolute; bottom: 3px; right: 3px; width: 15px; height: 15px;
  border-radius: 50%; background: ${ACCENT}; color: #232528; display: grid; place-items: center;
  font: 700 9px/1 system-ui, -apple-system, sans-serif; }
.vl-tip { position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translate(-50%, 4px);
  padding: 6px 10px; border-radius: 10px; white-space: nowrap; opacity: 0; pointer-events: none;
  font: 600 12px/1 system-ui, -apple-system, sans-serif;
  transition: opacity 220ms ${EASE}, transform 220ms ${EASE}; }
.vl-tip.show { opacity: 1; transform: translate(-50%, 0); }
@media (hover: hover) { .vl-btn:hover .vl-tip { opacity: 1; transform: translate(-50%, 0); } }
.vl-cam { position: absolute; pointer-events: auto; border: 0; padding: 0; margin: 0;
  background: transparent; cursor: pointer; border-radius: 16px; outline: none; }
.vl-cam:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}; }
.vl-show { position: absolute; right: ${GUTTER}px; top: ${GUTTER}px; }
.vl-nocam { position: absolute; display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 16px; font: 600 12px/1.35 system-ui, -apple-system, sans-serif; color: rgb(255 255 255 / .9);
  animation: vl-fade 260ms ${EASE} both; }
.vl-nocam svg { flex: none; color: rgb(255 255 255 / .7); }
.vl-gone { opacity: 0; pointer-events: none; }
.vl-howto-back { position: absolute; inset: 0; pointer-events: auto; background: rgb(10 10 14 / .25);
  animation: vl-fade 260ms ${EASE} both; }
@keyframes vl-fade { from { opacity: 0; } to { opacity: 1; } }
.vl-howto { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  padding: 16px 18px; border-radius: 22px; display: flex; flex-direction: column; gap: 12px;
  width: min(360px, calc(100% - 32px)); animation: vl-pop2 360ms ${EASE} both; }
@keyframes vl-pop2 { from { opacity: 0; transform: translate(-50%, -46%) scale(.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
.vl-step { display: flex; align-items: center; gap: 14px; font: 600 15px/1.25 system-ui, -apple-system, sans-serif; }
.vl-step .vl-pic { flex: none; width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
  background: rgb(255 255 255 / .08); color: #fff; }
.vl-step .vl-num { color: ${ACCENT}; font-weight: 700; margin-right: 2px; }
.vl-count { position: absolute; left: 22px; right: 22px; bottom: -1px; height: 2px; border-radius: 2px;
  background: rgb(255 255 255 / .12); overflow: hidden; }
.vl-count > div { height: 100%; background: ${ACCENT}; transform-origin: 0 50%;
  animation: vl-count var(--vl-count) linear both; }
@keyframes vl-count { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.vl-leave, .vl-leave .vl-howto { animation: vl-out 320ms ${EASE} both; pointer-events: none; }
@keyframes vl-out { to { opacity: 0; } }
.vl-dock.pulse::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
  animation: vl-pulse 1500ms ${EASE} both; }
@keyframes vl-pulse { from { box-shadow: 0 0 0 0 rgb(244 217 104 / .6); }
  to { box-shadow: 0 0 0 22px rgb(244 217 104 / 0); } }
.vl-keys { display: inline-flex; gap: 3px; margin: 0 2px; }
.vl-keys kbd { font: 650 10px/1 system-ui, -apple-system, sans-serif; padding: 3px 4px; border-radius: 5px;
  background: rgb(255 255 255 / .12); color: #fff; }
.dj-card { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto;
  bottom: calc(env(safe-area-inset-bottom, 0px) + ${DOCK_BOTTOM + DOCK_HEIGHT + 12}px);
  padding: 10px; border-radius: 20px; display: flex; flex-direction: column; gap: 8px; align-items: center;
  animation: vl-fade 220ms ${EASE} both; max-width: calc(100% - 32px); }
.dj-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.dj-chip { pointer-events: auto; border: 0; margin: 0; cursor: pointer; color: #fff; min-width: 64px; height: 44px;
  padding: 0 12px; border-radius: 14px; background: rgb(255 255 255 / .08); outline: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  font: 650 13px/1 system-ui, -apple-system, sans-serif; transition: background 200ms ${EASE}, transform 160ms ease-out; }
.dj-chip small { font: 600 10px/1 system-ui, -apple-system, sans-serif; opacity: .6; }
.dj-chip:hover { background: rgb(255 255 255 / .14); }
.dj-chip:active { transform: scale(0.96); }
.dj-chip.on { background: rgb(244 217 104 / .22); color: ${ACCENT}; }
.dj-chip:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}; }
.dj-pad { width: 74px; height: 58px; border-radius: 14px; color: #1d1e22; }
.dj-pad small { opacity: .7; }
.dj-drop { width: 100%; height: 40px; flex-direction: row; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .vl-howto, .vl-howto-back, .vl-dock.pulse::after, .dj-card { animation: none; } }
`;
const Icon = ({
  children,
  size = 20,
}: {
  children: ReactNode;
  size?: number;
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const CameraIcon = () => (
  <Icon>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);
/** A camera, crossed out. */
const NoCameraIcon = () => (
  <Icon size={18}>
    <path d="M2.5 2.5l19 19" />
    <path d="M9 6h6.5L17 8h3a1 1 0 0 1 1 1v8.5M18 19H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3" />
    <path d="M10 10.6a3.5 3.5 0 0 0 4.4 4.4" />
  </Icon>
);
const HelpIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </Icon>
);
const ViewIcon = () => (
  <Icon>
    <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);
const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Icon>
);

// ---------------------------------------------------------------- how to play

/** A step picture: a 24 grid drawn large, with a lighter line. */
const Pic = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={40}
    height={40}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** A record turning, a hand's arc on it: scratch. */
const PicScratch = () => (
  <Pic>
    <circle cx="12" cy="12" r="9" opacity=".6" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M6.5 7.5a7.5 7.5 0 0 1 9.5-1.9" />
    <path d="M14.2 3.6l1.8 2-2.4.9" />
  </Pic>
);
/** A slider between two marks: the crossfader. */
const PicFader = () => (
  <Pic>
    <path d="M3 12h18" opacity=".6" />
    <rect x="9.5" y="8" width="5" height="8" rx="1.2" />
    <path d="M5 16.5l-2-2.5 2-2.5M19 16.5l2-2.5-2-2.5" opacity=".7" />
  </Pic>
);
/** A knob with its arc: the filter. */
const PicKnob = () => (
  <Pic>
    <circle cx="12" cy="13" r="5" />
    <path d="M12 13V9" />
    <path d="M5.2 18.5a8.5 8.5 0 1 1 13.6 0" opacity=".6" />
  </Pic>
);
/** Four pads. */
const PicPads = () => (
  <Pic>
    <rect x="3" y="4" width="8" height="7" rx="1.6" />
    <rect x="13" y="4" width="8" height="7" rx="1.6" />
    <rect x="3" y="13" width="8" height="7" rx="1.6" />
    <rect x="13" y="13" width="8" height="7" rx="1.6" opacity=".6" />
  </Pic>
);
/** Play and stop. */
const PicPlay = () => (
  <Pic>
    <path d="M5 5.5v13l10-6.5Z" />
    <path d="M18 6v12M21 6v12" opacity=".6" />
  </Pic>
);

type Step = { key: string; pic: ReactNode; text: ReactNode; tint?: string };
const STEPS: Step[] = [
  {
    key: "scratch",
    pic: <PicScratch />,
    text: "Drag a record round to scratch; hold it still to brake",
    tint: COLOURS.ghost,
  },
  {
    key: "fader",
    pic: <PicFader />,
    text: "Slide the crossfader between the two decks",
    tint: COLOURS.ghost,
  },
  {
    key: "knob",
    pic: <PicKnob />,
    text: "Drag the filter knob up or down",
    tint: COLOURS.filter,
  },
  {
    key: "pads",
    pic: <PicPads />,
    text: (
      <>
        Tap a pad or press
        <span className="vl-keys">
          <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd>
          <kbd>4</kbd>
        </span>
        ;
        <span className="vl-keys">
          <kbd>D</kbd>
        </span>
        drops the beat
      </>
    ),
    tint: COLOURS.pads[1],
  },
  {
    key: "play",
    pic: <PicPlay />,
    text: (
      <>
        <span className="vl-keys">
          <kbd>Space</kbd>
        </span>
        plays or stops;
        <span className="vl-keys">
          <kbd>←</kbd>
          <kbd>→</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
        </span>
        fader and filter
      </>
    ),
  },
];

/** The corner's words when there is no camera. */
const NO_CAMERA = "No camera: drag the records, the sliders and the pads";

// ---------------------------------------------------------------- the dock icons

/** A record: the style. */
const StyleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5" opacity=".6" />
  </Icon>
);
const PlayIcon = () => (
  <Icon>
    <path d="M8 5.5v13l10-6.5Z" />
  </Icon>
);
const StopIcon = () => (
  <Icon>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Icon>
);
/** Four pads: the effects. */
const FxIcon = () => (
  <Icon>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

const STYLE_MARK: Record<StyleId, string> = {
  house: "H",
  hiphop: "B",
  disco: "D",
  lofi: "L",
};
const VIEW_MARK: Record<View, string> = { front: "1", player: "2", close: "3" };
const VIEW_LABEL: Record<View, string> = {
  front: "View: Front",
  player: "View: Player",
  close: "View: Close",
};

type DockButton = {
  id: string;
  label: string;
  icon: ReactNode;
  on?: boolean;
  mark?: string;
  act: () => void;
};

export const Hud = () => {
  useDjVersion();
  const [tapped, setTapped] = useState<string | null>(null);
  const tapTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);
  // The first steps card closes by itself; a closing card fades out.
  const until = dj.howToUntil;
  useEffect(() => {
    if (until === null) return undefined;
    const t = window.setTimeout(
      () => closeHowTo(),
      Math.max(0, until - performance.now()),
    );
    return () => window.clearTimeout(t);
  }, [until]);
  const open = dj.howTo;
  const [leaving, setLeaving] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return undefined;
    wasOpen.current = open;
    setLeaving(!open);
    if (open) return undefined;
    const t = window.setTimeout(() => setLeaving(false), 320);
    return () => window.clearTimeout(t);
  }, [open]);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const frame = frameRect(width, height);
  const hidden = dj.camHidden;
  // No camera picture (none, or refused): the corner says how to play instead.
  const camera = useXRReady();
  const noCamera = dj.entered && !camera;

  const buttons: DockButton[] = [
    {
      id: "style",
      label: `Style: ${STYLE[dj.style].label}`,
      icon: <StyleIcon />,
      mark: STYLE_MARK[dj.style],
      on: dj.card === "style",
      act: () => setCard("style"),
    },
    {
      id: "play",
      label: dj.playing ? "Stop" : "Play",
      icon: dj.playing ? <StopIcon /> : <PlayIcon />,
      act: togglePlay,
    },
    {
      id: "fx",
      label: "Effects",
      icon: <FxIcon />,
      on: dj.card === "fx",
      act: () => setCard("fx"),
    },
    {
      id: "view",
      label: VIEW_LABEL[dj.view],
      icon: <ViewIcon />,
      mark: VIEW_MARK[dj.view],
      act: nextView,
    },
    {
      id: "light",
      label: dj.night ? "Night" : "Day",
      icon: dj.night ? <MoonIcon /> : <SunIcon />,
      act: () => setNight(!dj.night),
    },
    {
      id: "howto",
      label: "How to play",
      icon: <HelpIcon />,
      on: dj.howTo,
      act: () => {
        if (dj.howTo) {
          closeHowTo();
          return;
        }
        dj.howTo = true;
        dj.card = null;
        dj.changed();
      },
    },
  ];

  return (
    <Html
      fullscreen
      calculatePosition={pinToScreen}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: "none" }}
    >
      <style>{CSS}</style>
      <div className="vl-root">
        {noCamera ? (
          <div
            className="vl-nocam vl-glass"
            data-hud="no-camera"
            role="status"
            style={{
              right: GUTTER,
              top: GUTTER,
              width: Math.min(frame.width, 220),
            }}
          >
            <NoCameraIcon />
            <span>{NO_CAMERA}</span>
          </div>
        ) : null}
        <button
          type="button"
          data-hud="camera"
          className={`vl-cam ${hidden || noCamera ? "vl-gone" : ""}`}
          aria-label="Hide your camera"
          style={{
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
          }}
          onClick={toggleCam}
        />
        <button
          type="button"
          data-hud="camera-show"
          className={`vl-btn vl-glass vl-show ${hidden && !noCamera ? "" : "vl-gone"}`}
          aria-label="Show your camera"
          onClick={toggleCam}
        >
          <CameraIcon />
        </button>

        {dj.howTo || leaving ? (
          <div
            className={`vl-howto-back ${dj.howTo ? "" : "vl-leave"}`}
            data-hud="howto"
            role="presentation"
            onPointerDown={() => closeHowTo()}
          >
            <div
              className="vl-howto vl-glass"
              role="dialog"
              aria-label="How to play"
            >
              {dj.howTo && until !== null ? (
                <div
                  className="vl-count"
                  aria-hidden="true"
                  style={
                    {
                      "--vl-count": `${INTRO_CARD_MS}ms`,
                    } as CSSProperties
                  }
                >
                  <div />
                </div>
              ) : null}
              {STEPS.map((st, i) => (
                <div className="vl-step" key={st.key}>
                  <span
                    className="vl-pic"
                    style={st.tint ? { color: st.tint } : undefined}
                  >
                    {st.pic}
                  </span>
                  <span>
                    <span className="vl-num">{i + 1}</span> {st.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {dj.card === "style" && dj.entered ? (
          <div
            className="dj-card vl-glass"
            data-hud="style-card"
            role="dialog"
            aria-label="Style"
          >
            <div className="dj-row">
              {STYLES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`dj-chip ${dj.style === id ? "on" : ""}`}
                  aria-pressed={dj.style === id}
                  onClick={() => setStyle(id)}
                >
                  {STYLE[id].label}
                  <small>{STYLE[id].bpm} BPM</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {dj.card === "fx" && dj.entered ? (
          <div
            className="dj-card vl-glass"
            data-hud="fx-card"
            role="dialog"
            aria-label="Effects"
          >
            <div className="dj-row">
              {PADS.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className="dj-chip dj-pad"
                  style={{ background: COLOURS.pads[i] }}
                  onClick={() => pad(k)}
                >
                  {PAD_LABEL[k]}
                  <small>{k}</small>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="dj-chip dj-drop"
              onClick={() => drop()}
            >
              Drop
              <span className="vl-keys">
                <kbd>D</kbd>
              </span>
            </button>
          </div>
        ) : null}

        <div
          className={`vl-dock vl-glass ${dj.dockPulseAt !== null ? "pulse" : ""}`}
          data-hud="dock"
        >
          {buttons.map((b) => {
            const showTip = tapped === b.id;
            return (
              <button
                key={b.id}
                type="button"
                data-hud={b.id}
                className={`vl-btn ${b.on ? "on" : ""}`}
                aria-label={b.label}
                aria-pressed={b.on}
                onPointerUp={(e) => {
                  // On touch the label shows for a moment after the tap.
                  if (e.pointerType === "mouse") return;
                  setTapped(b.id);
                  window.clearTimeout(tapTimer.current);
                  tapTimer.current = window.setTimeout(
                    () => setTapped(null),
                    TAP_LABEL,
                  );
                }}
                onClick={b.act}
              >
                {b.icon}
                {b.mark ? <span className="vl-mark">{b.mark}</span> : null}
                <span className={`vl-tip vl-glass ${showTip ? "show" : ""}`}>
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Html>
  );
};
