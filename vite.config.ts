// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Packaged desktop builds run from a read-only install dir, so the Electron
    // shell redirects Vite's dep-optimization cache to a writable per-user path.
    cacheDir: process.env.VITE_CACHE_DIR || undefined,
    server: {
      // Bind to loopback only. The packaged app spawns this dev server; without
      // this, Vite listens on all interfaces and its /api proxy would expose the
      // local Facebook-automation API (port 3001) to anyone on the LAN.
      host: "127.0.0.1",
      proxy: {
        "/api": "http://localhost:3001",
      },
    },
    optimizeDeps: {
      // Pre-bundle UI deps discovered on inner routes so Vite doesn't
      // re-optimize mid-session (which briefly double-loads React and
      // flashes the error boundary on first navigation).
      include: [
        "sonner",
        "clsx",
        "class-variance-authority",
        "tailwind-merge",
        "@radix-ui/react-slot",
        "@radix-ui/react-progress",
        "@radix-ui/react-separator",
        "@radix-ui/react-dialog",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-select",
        "@radix-ui/react-label",
        "@radix-ui/react-switch",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
