// Scene.tsx — DJ Deck: two turntables and a mixer in a recording studio.
// The scene's code loads on its own, after the home page shows.
import { lazy, Suspense } from "react";

const DjScene = lazy(async () => ({
  default: (await import("./dj/DjScene")).DjScene,
}));

// Dev-only helpers. Lazy and behind a constant esbuild folds to false in
// production. Two rules: `process.env.NODE_ENV`, not `import.meta.env.DEV`;
// and write the check INSIDE the ternary — hoisted into a `const`, esbuild
// keeps the dead branch.
const DevDebug =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./dj/DevDebug"))
    : null;

export const Scene = () => (
  <>
    <Suspense fallback={null}>
      <DjScene />
    </Suspense>
    {DevDebug ? (
      <Suspense fallback={null}>
        <DevDebug />
      </Suspense>
    ) : null}
  </>
);
