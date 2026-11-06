// Thin guides drawn over your camera in the corner, so you can see where
// your mixer hand plays: a filter bar up the left side (its open middle band
// marked, high-pass above, low-pass below; a dot at the filter now) and a
// crossfader line along the bottom of the mixer hand's half (A to B, a dot
// at the crossfader now). Subtle gold, mostly see-through; brighter while
// the mixer hand has hold of them. A small tag at the panel's foot names
// what your hands just did (Scratch, Brake, Echo, Drop …). Drawn in the
// picture's own frame (the same cover crop as the corner camera), so the
// guides sit where your hand plays them.
import { useEffect, useRef } from "react";

import { hands } from "./Hands";
import { MIXER_ZONE } from "./handPlay";
import { COLOURS } from "./layout";
import { dj } from "./state";

/** How see-through the guides are (idle, held); where the lines sit on the picture. */
const GUIDE = { alpha: 0.35, held: 0.75, dot: 0.9, barX: 0.035, lineY: 0.95 };
/** The tag shows this long after an action (s), fading over the last part. */
const TAG = { show: 0.9, fade: 0.3 };

/** The same crop as the corner camera's (CameraFrame.tsx): picture → panel. */
const cropMid = (k: number) => Math.min(0.5 + 0.12, 1 - 0.5 * k);
/** A point on the picture (0..1 across, 0..1 down) → on the panel (0..1, down). */
export const toPanel = (
  x: number,
  y: number,
  panelAspect: number,
  screenAspect: number,
) => {
  const up = 1 - y;
  if (panelAspect > screenAspect) {
    const k = screenAspect / panelAspect;
    return { x, y: 1 - (0.5 + (up - cropMid(k)) / k) };
  }
  return { x: 0.5 + ((x - 0.5) * screenAspect) / panelAspect, y };
};

/** The filter's place up the picture (0 top … 1 bottom). */
const filterY = (f: number) => {
  const z = MIXER_ZONE;
  if (f > 0) return z.open[0] - f * (z.open[0] - z.high);
  if (f < 0) return z.open[1] - f * (z.low - z.open[1]);
  return (z.open[0] + z.open[1]) / 2;
};

export const CameraGuides = ({
  rect,
  screen,
  shown,
}: {
  rect: { left: number; top: number; width: number; height: number };
  screen: { width: number; height: number };
  shown: boolean;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef({ rect, screen });
  geo.current = { rect, screen };

  useEffect(() => {
    let raf = 0;
    let hold = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const { rect: r, screen: s } = geo.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      const pa = r.width / Math.max(1, r.height);
      const sa = s.width / Math.max(1, s.height);
      const at = (x: number, y: number) => {
        const p = toPanel(x, y, pa, sa);
        return { x: p.x * w, y: p.y * h };
      };
      const line = Math.max(1, dpr);
      hold += ((hands.engaged ? 1 : 0) - hold) * 0.15;
      const alpha = GUIDE.alpha + (GUIDE.held - GUIDE.alpha) * hold;
      const z = MIXER_ZONE;
      g.strokeStyle = COLOURS.ghost;
      g.fillStyle = COLOURS.ghost;
      g.lineWidth = line;
      g.lineCap = "round";

      // The filter bar (at the panel's left edge, however the picture is cropped).
      const bx = GUIDE.barX * w;
      const yTop = at(0.5, z.high).y;
      const yBottom = at(0.5, z.low).y;
      const y0 = at(0.5, z.open[0]).y;
      const y1 = at(0.5, z.open[1]).y;
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(bx, yTop);
      g.lineTo(bx, yBottom);
      g.stroke();
      // The open band: a thicker, dimmer stretch.
      g.globalAlpha = alpha * 0.6;
      g.lineWidth = 4 * dpr;
      g.beginPath();
      g.moveTo(bx, y0);
      g.lineTo(bx, y1);
      g.stroke();
      g.lineWidth = line;
      // High-pass above (a rising tick), low-pass below (a falling one).
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(bx - 3 * dpr, yTop + 3 * dpr);
      g.lineTo(bx, yTop);
      g.lineTo(bx + 3 * dpr, yTop + 3 * dpr);
      g.moveTo(bx - 3 * dpr, yBottom - 3 * dpr);
      g.lineTo(bx, yBottom);
      g.lineTo(bx + 3 * dpr, yBottom - 3 * dpr);
      g.stroke();
      const fy = at(0.5, filterY(dj.filter)).y;
      g.globalAlpha = hands.engaged ? GUIDE.dot : alpha;
      g.fillStyle = COLOURS.filter;
      g.beginPath();
      g.arc(bx, fy, 2.8 * dpr, 0, Math.PI * 2);
      g.fill();

      // The crossfader line along the bottom of the mixer hand's half.
      const a = at(z.left, GUIDE.lineY);
      const b = at(z.right, GUIDE.lineY);
      const m = at((z.left + z.right) / 2, GUIDE.lineY);
      g.globalAlpha = alpha;
      g.fillStyle = COLOURS.ghost;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.moveTo(m.x, m.y - 3 * dpr);
      g.lineTo(m.x, m.y + 3 * dpr);
      g.stroke();
      g.font = `700 ${Math.round(7 * dpr)}px system-ui, -apple-system, sans-serif`;
      g.textAlign = "center";
      g.fillStyle = COLOURS.teal;
      g.fillText("A", a.x, a.y - 4 * dpr);
      g.fillStyle = COLOURS.magenta;
      g.fillText("B", b.x, b.y - 4 * dpr);
      const xd = at(z.left + (z.right - z.left) * dj.xfade, GUIDE.lineY);
      g.globalAlpha = hands.engaged ? GUIDE.dot : alpha;
      g.fillStyle = COLOURS.ghost;
      g.beginPath();
      g.arc(xd.x, xd.y, 2.8 * dpr, 0, Math.PI * 2);
      g.fill();

      // The tag: what your hands did last (or are doing).
      const now = performance.now() / 1000;
      let label = "";
      let k = 0;
      if (hands.dropArmed) {
        label = "Drop ↓";
        k = 0.6 + 0.4 * Math.sin(now * 8);
      } else {
        const since = now - hands.action.at;
        if (since < TAG.show) {
          label = hands.action.label;
          k = Math.min(1, (TAG.show - since) / TAG.fade);
        }
      }
      if (label && k > 0.01) {
        g.font = `650 ${Math.round(10 * dpr)}px system-ui, -apple-system, sans-serif`;
        const tw = g.measureText(label).width + 14 * dpr;
        const th = 18 * dpr;
        const tx = w / 2 - tw / 2;
        const ty = h - th - 6 * dpr;
        g.globalAlpha = 0.8 * k;
        g.fillStyle = "rgb(20 20 24)";
        g.beginPath();
        g.roundRect(tx, ty, tw, th, th / 2);
        g.fill();
        g.globalAlpha = k;
        g.fillStyle = COLOURS.ghost;
        g.textBaseline = "middle";
        g.fillText(label, w / 2, ty + th / 2 + 0.5 * dpr);
        g.textBaseline = "alphabetic";
      }
      g.globalAlpha = 1;
      g.lineCap = "butt";
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-hud="camera-guides"
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: 16,
        pointerEvents: "none",
        opacity: shown ? 1 : 0,
        transition: "opacity 300ms ease-out",
      }}
    />
  );
};
