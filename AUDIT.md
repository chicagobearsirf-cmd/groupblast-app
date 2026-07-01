# GroupBlast Pre-Ship Audit — 2026-06-30 (Windows build, commit cb36e59)

Verdict at time of writing: **NO-GO** until the three blockers below are fixed.
Most findings are in shared code (`electron/main.cjs`, `src/local-api/server.ts`,
`src/routes/auth-callback.tsx`, group/import logic) and apply to **both the
Windows and Mac builds** unless noted otherwise.

## Blockers (must fix before shipping either platform)

- [ ] **Local API exposed to the LAN.** `electron/main.cjs` spawns Vite (port
      8080) without restricting it to loopback, and Vite's `/api` proxy
      forwards to the Express API. Verified: a LAN-facing address could reach
      `/api/health` through the Vite proxy even though the Express server
      itself correctly refuses non-loopback connections on port 3001.
      Fix: spawn Vite with `--host 127.0.0.1` (or set `server.host` in
      `vite.config.ts`) to match the Express server's binding.
      **Platform: both.**

- [ ] **First launch after install can fail.** Cold Vite dependency
      pre-bundling can exceed the hardcoded 90s `waitForServer` timeout in
      `electron/main.cjs`, producing a native "Could not start the app"
      error dialog on a user's very first launch. Second launch (warm cache)
      is fine. Fix: raise the first-run timeout and/or show a "first run can
      take a few minutes" message instead of failing at 90s; consider
      pre-warming the cache during build/install.
      **Platform: both** (Mac likely has the same 90s timeout constant).

- [ ] **Playwright's browser isn't part of the install.** The installer/app
      bundles the Playwright JS driver but not the Chromium binary it drives
      (lives outside `node_modules`, in the OS Playwright cache). Fresh
      machines hit `Executable doesn't exist` on "Connect Facebook" until
      someone manually runs `npx playwright install chromium`. Fix: bundle
      Chromium as an `extraResource` in electron-builder config, or run
      `playwright install chromium` on first launch with a visible progress
      indicator. **Platform: both** — Mac needs its own Chromium bundle
      target too (Playwright downloads platform-specific browsers).

## High priority

- [ ] **No single-instance lock.** `electron/main.cjs` never calls
      `app.requestSingleInstanceLock()`. Launching a second instance while
      one is running fails that instance's own Vite server
      (`Port 8080 is already in use`), and both windows end up silently
      sharing whichever instance's servers actually bound. Closing the
      "wrong" window kills the backend for the other one, with no clear
      error. Fix: add `requestSingleInstanceLock()`, focus the existing
      window on relaunch. **Platform: both.**

## UX feedback (from live testing, non-blocking but should ship with the fixes above)

- [ ] Auto-imported Facebook groups require a manual confirm step before
      being added — should import directly, and let the user delete
      unwanted groups afterward instead of gating on a confirmation screen.
- [ ] Group auto-categorization leaves too many groups "Uncategorized" —
      needs smarter categorization (e.g., should recognize "AI"-focused
      groups as a category/niche).
- [ ] After selecting groups to post to, the UI doesn't clearly prompt the
      user to click "Start" — needs a clearer call-to-action.
- [ ] The `auth-callback` success page ("You're logged in!") should tell the
      user to switch back to the app and close the tab, e.g. "Continue in
      the GroupBlast app — you can close this page."
      (`src/routes/auth-callback.tsx`)

## Minor / later

- `asar` packaging is disabled (electron-builder itself warns this is
  "strongly not recommended") — app source ships as plain readable/writable
  files rather than packed. Not urgent, worth revisiting for tamper
  resistance later. **Platform: both.**

## Passed / verified clean

- Build steps (install → `@electron/rebuild` → `npm run build` →
  `electron:build:win`) completed with no errors. Installer 156.7 MB,
  correctly unsigned (SmartScreen warning is expected/normal).
- Login via magic link works end-to-end: browser → Supabase → session-relay
  POST → Electron app picks it up automatically within seconds.
- Session persists across a full quit/relaunch.
- Multiple launch/quit/relaunch cycles: no crashes, no orphaned processes,
  fast warm-start (~2.4s once the Vite cache is warm).
- No secrets committed to the repo; `.env.local` correctly gitignored.
- Facebook group URLs are validated server-side with an anchored regex
  (`^https?://(www\.)?facebook\.com/groups/`) before storage — can't be
  spoofed with lookalike domains.
- `GROUPBLAST_DATA_DIR` resolves to the user-writable AppData folder, not
  the install directory.
- `better-sqlite3` native module loads correctly in the packaged app.
- **Core flow verified end-to-end on this build**: connect Facebook → import
  groups → compose → one-group test post completed successfully.

## Build info (Windows)

- Commit tested: `cb36e59`
- Installer SHA256: `b0ef93f49e280df5a365d095ed00ac649d1a0b48ee39c36a84ceaa0ca80a17c0`

## Pricing / trial changes (2026-06-30, post-audit) — apply to Mac build too

Implemented in `supabase/migrations/202606300003_trial_4days_and_promo.sql`,
`src/hooks/use-plan-status.ts`, `src/components/TrialGate.tsx`. Pure Supabase
+ React changes — **no Electron/platform-specific code involved, so the Mac
app gets this automatically once it's on the same Supabase project and this
commit.** Nothing to port separately.

- [x] Trial shortened from 10 days to 4 days (only affects *new* signups —
      existing in-flight trials keep their original `trial_ends_at`).
- [x] Trial-ended screen now shows the $97/month price.
- [x] Promo-code mechanism added: `promo_codes` table +
      `apply_promo_code()` RPC. Seeded with **`MILITARY10`  = 10% off**
      ($87.30/mo). Rename/adjust the code or percentage by editing the
      `insert into public.promo_codes` row in the migration (or updating the
      row directly in Supabase) — no app redeploy needed for future codes,
      just add rows to `promo_codes`.
- [ ] **Payment collection is still NOT automated.** There's no Stripe (or
      other processor) integration yet — "Contact us to subscribe" still
      just sends an email (now includes the promo code in the subject line
      if one was applied), and you still have to manually set
      `user_plans.plan = 'active'` after being paid. Wire up real billing
      before relying on this for revenue at scale.
- [ ] Military/first responder discount has **no identity verification** —
      it's a trust-based code, same as a typical SaaS promo code. Revisit if
      abuse becomes a problem.
