// The routines' page UI, on Night glass like the rest:
//   - the routines card (from the dock's note button): each routine with
//     its style, its best stars, Learn and Play, and a Slower toggle for Play
//   - while a routine runs, the cue card top left: the cue to do now (a
//     picture and plain words, for your hands when the camera runs, for the
//     mouse and keys when not) and the routine's progress. In Play the
//     count-in beats first, then the coming cues slide along a lane towards
//     the line where they are due. A cue that counts sparkles gold.
//   - at the end, the stars (Play) or a little celebration (Learn), with
//     Again and Next
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { COLOURS, DOCK_BOTTOM, DOCK_HEIGHT, frameRect, GUTTER } from "./layout";
import { STYLE } from "./music";
import { bestStars, closeFinish, startRoutine } from "./RoutinePlayer";
import { nextRoutineId, ROUTINES, routineById, type CueKind } from "./routines";
import { clockNow, dj } from "./state";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ACCENT = "#f4d968";
/** The finish card stays up this long (ms). */
const FINISH_FOR = 6000;
/** Play's lane shows this many beats ahead. */
const LANE_BEATS = 8;

export const ROUTINE_CSS = `
.rt-card { position: absolute; pointer-events: auto; border-radius: 18px; padding: 10px;
  display: flex; flex-direction: column; gap: 6px; animation: vl-fade 220ms ${EASE} both; }
.rt-row { display: flex; align-items: center; gap: 8px; }
.rt-row .rt-title { flex: 1; font: 600 14px/1.2 system-ui, -apple-system, sans-serif; padding-left: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-row .rt-title small { display: block; font: 600 10px/1.2 system-ui, -apple-system, sans-serif; opacity: .55; }
.rt-small { pointer-events: auto; border: 1px solid rgb(235 246 253 / .22); background: rgb(255 255 255 / .08);
  color: #fff; border-radius: 999px; height: 32px; padding: 0 12px; cursor: pointer; flex: none;
  font: 600 12px/1 system-ui, -apple-system, sans-serif; transition: transform 160ms ease-out; }
.rt-small:active { transform: scale(0.95); }
.rt-small:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}; outline: none; }
.rt-small.play { background: ${ACCENT}; color: #232528; border-color: transparent; }
.rt-small.on { box-shadow: inset 0 0 0 1.5px ${ACCENT}; }
.rt-best { display: flex; gap: 1px; margin-right: 2px; flex: none; }
.rt-cue { position: absolute; left: ${GUTTER}px; top: ${GUTTER}px; width: 230px; pointer-events: none;
  border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px;
  animation: vl-fade 260ms ${EASE} both; }
.rt-head { display: flex; align-items: center; gap: 12px; }
.rt-pic { position: relative; width: 60px; height: 60px; border-radius: 16px; flex: none; display: grid; place-items: center;
  background: rgb(242 178 28 / .2); color: ${COLOURS.ghost}; }
.rt-words { font: 650 14px/1.25 system-ui, -apple-system, sans-serif; }
.rt-words small { display: block; margin-top: 3px; font: 600 11px/1.2 system-ui, -apple-system, sans-serif; color: rgb(255 255 255 / .6); }
.rt-count { font: 700 40px/1 system-ui, -apple-system, sans-serif; color: ${ACCENT}; width: 60px; text-align: center; }
.rt-lane { position: relative; height: 30px; border-radius: 10px; background: rgb(255 255 255 / .06); overflow: hidden; }
.rt-lane .rt-hit { position: absolute; left: 14px; top: 3px; bottom: 3px; width: 2px; border-radius: 2px; background: ${ACCENT}; opacity: .8; }
.rt-lane .rt-chip { position: absolute; top: 3px; width: 24px; height: 24px; margin-left: -12px; border-radius: 8px;
  display: grid; place-items: center; background: rgb(255 255 255 / .12); color: #fff; }
.rt-lane .rt-chip.now { background: rgb(244 217 104 / .3); color: ${ACCENT}; }
.rt-lane .rt-chip.done { background: rgb(244 217 104 / .55); color: #232528; }
.rt-lane .rt-chip.miss { opacity: .3; }
.rt-bar { height: 4px; border-radius: 4px; background: rgb(255 255 255 / .14); overflow: hidden; }
.rt-bar > div { height: 100%; background: ${ACCENT}; transform-origin: 0 50%; transition: transform 200ms linear; }
.rt-spark { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px; border-radius: 50%;
  background: ${ACCENT}; box-shadow: 0 0 8px ${ACCENT}; pointer-events: none; opacity: 0;
  animation: rt-spark 620ms ${EASE} both; }
@keyframes rt-spark { from { opacity: 1; transform: rotate(var(--a)) translateX(10px) scale(1); }
  to { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(.4); } }
.rt-flash { position: absolute; inset: 0; border-radius: inherit; background: ${ACCENT}; pointer-events: none;
  animation: rt-flash 520ms ${EASE} both; }
@keyframes rt-flash { from { opacity: .55; } to { opacity: 0; } }
.rt-finish { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto;
  display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 22px;
  animation: rt-pop 420ms ${EASE} both; }
@keyframes rt-pop { from { opacity: 0; transform: translate(-50%, 10px) scale(.92); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.rt-finish .rt-sparks { position: absolute; left: 50%; top: 50%; pointer-events: none; }
.rt-icon { pointer-events: auto; width: 40px; height: 40px; border-radius: 50%; border: 0;
  background: rgb(255 255 255 / .1); color: #fff; display: grid; place-items: center; cursor: pointer;
  transition: transform 160ms ease-out; }
.rt-icon:active { transform: scale(0.94); }
.rt-icon:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}; outline: none; }
@media (prefers-reduced-motion: reduce) { .rt-card, .rt-finish, .rt-cue, .rt-spark, .rt-flash { animation: none; } }
`;

const Svg = ({
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
export const NoteIcon = () => (
  <Svg>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Svg>
);
export const StopRoutineIcon = () => (
  <Svg>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
  </Svg>
);
const AgainIcon = () => (
  <Svg>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
const NextIcon = () => (
  <Svg>
    <path d="M6 5.5l9 6.5-9 6.5z" fill="currentColor" />
    <path d="M18 5v14" />
  </Svg>
);

/** A cue's picture. */
export const CueIcon = ({
  kind,
  size = 20,
}: {
  kind: CueKind;
  size?: number;
}) => {
  const pad = (n: string) => (
    <Svg size={size}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        style={{ font: "700 11px system-ui, sans-serif" }}
      >
        {n}
      </text>
    </Svg>
  );
  const fader = (x: number) => (
    <Svg size={size}>
      <path d="M3 12h18" opacity=".6" />
      <rect x={x - 2.5} y="7.5" width="5" height="9" rx="1.2" />
    </Svg>
  );
  const knob = (a: number) => (
    <Svg size={size}>
      <circle cx="12" cy="12" r="7" />
      <path
        d={`M12 12L${(12 + 5 * Math.sin(a)).toFixed(2)} ${(12 - 5 * Math.cos(a)).toFixed(2)}`}
      />
    </Svg>
  );
  switch (kind) {
    case "scratch":
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="8.5" opacity=".6" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6.5 8a7 7 0 0 1 11 0M15.5 5.5L17.5 8l-3 .5" />
        </Svg>
      );
    case "brake":
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="8.5" opacity=".6" />
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
        </Svg>
      );
    case "fill":
      return pad("1");
    case "echo":
      return pad("2");
    case "riser":
      return pad("3");
    case "chop":
      return pad("4");
    case "drop":
      return (
        <Svg size={size}>
          <path d="M12 3v15M6.5 12.5L12 18l5.5-5.5M5 21h14" />
        </Svg>
      );
    case "xfadeA":
      return fader(5);
    case "xfadeB":
      return fader(19);
    case "xfadeMid":
      return fader(12);
    case "filterLow":
      return knob(-2.2);
    case "filterHigh":
      return knob(2.2);
    default:
      return knob(0);
  }
};

/** What each cue asks, for your hands and for the mouse and keys. */
const WORDS: Record<CueKind, { hands: string; mouse: string; label: string }> =
  {
    scratch: {
      hands: "Wave your right palm to scratch",
      mouse: "Drag the right deck's record to scratch",
      label: "Scratch",
    },
    brake: {
      hands: "Make a fist with your right hand to brake",
      mouse: "Hold the right deck's record still to brake",
      label: "Brake",
    },
    fill: {
      hands: "Hold up 1 finger for a fill",
      mouse: "Tap pad 1 (or press 1)",
      label: "Fill",
    },
    echo: {
      hands: "Hold up 2 fingers for the echo",
      mouse: "Tap pad 2 (or press 2)",
      label: "Echo",
    },
    riser: {
      hands: "Hold up 3 fingers for the riser",
      mouse: "Tap pad 3 (or press 3)",
      label: "Riser",
    },
    chop: {
      hands: "Hold up 4 fingers for the vocal chop",
      mouse: "Tap pad 4 (or press 4)",
      label: "Vocal chop",
    },
    drop: {
      hands: "Both palms up high, then pull them down fast",
      mouse: "Press D to drop",
      label: "Drop",
    },
    xfadeA: {
      hands: "Move your left hand to your left: deck A",
      mouse: "Slide the crossfader to A",
      label: "Crossfader A",
    },
    xfadeB: {
      hands: "Move your left hand to your right: deck B",
      mouse: "Slide the crossfader to B",
      label: "Crossfader B",
    },
    xfadeMid: {
      hands: "Left hand back to the middle: both decks",
      mouse: "Crossfader back to the middle",
      label: "Both decks",
    },
    filterLow: {
      hands: "Lower your left hand: low-pass",
      mouse: "Turn the filter down",
      label: "Low-pass",
    },
    filterHigh: {
      hands: "Raise your left hand: high-pass",
      mouse: "Turn the filter up",
      label: "High-pass",
    },
    filterOpen: {
      hands: "Left hand to the middle: filter open",
      mouse: "Filter back to the middle",
      label: "Filter open",
    },
  };

const STAR =
  "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";
const Star = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width={34} height={34} aria-hidden="true">
    <path
      d={STAR}
      fill={on ? ACCENT : "rgb(255 255 255 / .18)"}
      stroke={on ? ACCENT : "rgb(255 255 255 / .45)"}
      strokeWidth={1.2}
      strokeLinejoin="round"
    />
  </svg>
);
const SmallStar = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden="true">
    <path d={STAR} fill={on ? ACCENT : "rgb(255 255 255 / .22)"} />
  </svg>
);

/** A burst of gold sparks (replayed when `seq` changes). */
const Sparks = ({
  seq,
  count = 10,
  reach = 46,
}: {
  seq: number;
  count?: number;
  reach?: number;
}) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <span
        key={`${seq}-${i}`}
        className="rt-spark"
        style={
          {
            "--a": `${(360 * i) / count + (seq % 2) * 18}deg`,
            "--d": `${reach * (0.75 + 0.25 * ((i * 7) % 3))}px`,
            animationDelay: `${(i % 3) * 30}ms`,
          } as CSSProperties
        }
      />
    ))}
  </>
);

/** Redraws the caller often while `on`. */
const useTicker = (on: boolean, ms = 50) => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = window.setInterval(() => tick((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [on, ms]);
};

/** The cue card: the cue to do now, while a routine runs. */
const CueCard = ({ camera, width }: { camera: boolean; width: number }) => {
  const s = dj.session;
  useTicker(!!s);
  const { seq } = dj.cueFx;
  const firstSeq = useRef(seq);
  if (!s) return null;
  const now = clockNow();
  const i = s.current(now);
  const { cues } = s.routine;
  const c = cues[i] ?? null;
  const countIn = s.mode === "play" ? Math.ceil(-s.beatAt(now)) : 0;
  const sparkled = seq !== firstSeq.current;
  const words = c ? WORDS[c.kind] : null;
  let say = "";
  if (words) say = camera ? words.hands : words.mouse;
  const beat = s.beatAt(now);
  return (
    <div
      className="rt-cue vl-glass"
      style={{ width }}
      data-hud="cue-card"
      data-cue={c?.kind ?? ""}
      role="status"
      aria-label={words ? words.label : s.routine.title}
    >
      <div className="rt-head">
        {countIn > 0 ? (
          <span className="rt-count">{countIn}</span>
        ) : (
          <span className="rt-pic">
            {c ? <CueIcon kind={c.kind} size={34} /> : null}
            {sparkled ? <span key={seq} className="rt-flash" /> : null}
            {sparkled ? <Sparks seq={seq} /> : null}
          </span>
        )}
        <div className="rt-words">
          {say}
          <small>
            {s.mode === "learn" ? "Learn" : "Play"} · {s.routine.title}
          </small>
        </div>
      </div>
      {s.mode === "play" ? (
        <div className="rt-lane" aria-hidden="true">
          <span className="rt-hit" />
          {cues.map((q, k) => {
            const ahead = q.beat - beat;
            if (ahead < -1 || ahead > LANE_BEATS) return null;
            const left = 14 + (ahead / LANE_BEATS) * (width - 58);
            const r = s.results[k];
            let cls = "";
            if (r === "miss") cls = "miss";
            else if (r) cls = "done";
            else if (k === i) cls = "now";
            return (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={k}
                className={`rt-chip ${cls}`}
                style={{ left }}
              >
                <CueIcon kind={q.kind} size={15} />
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="rt-bar" aria-hidden="true">
        <div style={{ transform: `scaleX(${s.progress(now)})` }} />
      </div>
    </div>
  );
};

/** The routines card, the cue card and the finish card. */
export const RoutineUI = ({
  width,
  height,
  camera,
}: {
  width: number;
  height: number;
  /** The camera runs (the cues speak of your hands; else of the mouse and keys). */
  camera: boolean;
}) => {
  const frame = frameRect(width, height);
  const tall = height > width;
  const fin = dj.finish;
  const finishedAt = fin?.at ?? null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (finishedAt === null) return undefined;
    const t = window.setTimeout(() => {
      closeFinish();
      tick((n) => n + 1);
    }, FINISH_FOR);
    return () => window.clearTimeout(t);
  }, [finishedAt]);
  const best = dj.card === "routines" ? bestStars() : {};
  const above = `calc(env(safe-area-inset-bottom, 0px) + ${DOCK_BOTTOM + DOCK_HEIGHT + 12}px)`;

  return (
    <>
      {dj.session ? (
        <CueCard
          camera={camera}
          width={Math.min(230, frame.left - GUTTER - 10)}
        />
      ) : null}

      {dj.card === "routines" && !dj.session ? (
        <div
          className="rt-card vl-glass"
          data-hud="routine-card"
          role="dialog"
          aria-label="Routines"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            bottom: above,
            ...(tall
              ? { width: "calc(100% - 32px)", maxWidth: 380 }
              : { minWidth: 360 }),
          }}
        >
          {ROUTINES.map((r) => (
            <div className="rt-row" key={r.id}>
              <span className="rt-title">
                {r.title}
                <small>
                  {STYLE[r.style].label} · {r.bars} bars
                </small>
              </span>
              <span
                className="rt-best"
                aria-label={`Best: ${best[r.id] ?? 0} of 3 stars`}
              >
                {[1, 2, 3].map((k) => (
                  <SmallStar key={k} on={k <= (best[r.id] ?? 0)} />
                ))}
              </span>
              <button
                type="button"
                className="rt-small"
                data-hud={`learn-${r.id}`}
                onClick={() => startRoutine(r.id, "learn")}
              >
                Learn
              </button>
              <button
                type="button"
                className="rt-small play"
                data-hud={`play-${r.id}`}
                onClick={() => startRoutine(r.id, "play")}
              >
                Play
              </button>
            </div>
          ))}
          <div className="rt-row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`rt-small ${dj.slow ? "on" : ""}`}
              data-hud="slower"
              aria-pressed={dj.slow}
              onClick={() => {
                dj.slow = !dj.slow;
                dj.changed();
              }}
            >
              Slower
            </button>
          </div>
        </div>
      ) : null}

      {fin ? (
        <div
          data-hud="finish"
          className="rt-finish vl-glass"
          role="status"
          style={
            tall
              ? { top: frame.top + frame.height + 24 }
              : {
                  top: GUTTER,
                  left: GUTTER,
                  transform: "none",
                  animation: "vl-fade 420ms both",
                }
          }
        >
          <span className="rt-sparks" aria-hidden="true">
            <Sparks seq={fin.at} count={16} reach={110} />
          </span>
          <span
            className="rt-row"
            style={{ gap: 4 }}
            aria-label={
              fin.mode === "play"
                ? `${fin.stars} of 3 stars`
                : `${routineById(fin.id)?.title ?? ""}: learnt`
            }
          >
            {[1, 2, 3].map((k) => (
              <Star key={k} on={k <= fin.stars} />
            ))}
          </span>
          <button
            type="button"
            className="rt-icon"
            data-hud="again"
            aria-label="Again"
            onClick={() => startRoutine(fin.id, fin.mode)}
          >
            <AgainIcon />
          </button>
          <button
            type="button"
            className="rt-icon"
            data-hud="next"
            aria-label="Next routine"
            onClick={() => startRoutine(nextRoutineId(fin.id), fin.mode)}
          >
            <NextIcon />
          </button>
        </div>
      ) : null}
    </>
  );
};
