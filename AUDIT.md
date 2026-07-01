# GroupBlast Pre-Ship Audit — 2026-06-30 (commit cb36e59, updated through d707090)

**Platform this audit was performed on: Windows 10 (build 19045).** All testing,
builds, and verification below — including the re-verification status noted in
each blocker — were done on a Windows machine only. No Mac testing has been
done; Mac-specific behavior is inferred from shared code, not observed.

Verdict at time of original writing: **NO-GO** until the three blockers below
were fixed. **Status update:** all 3 blockers + the single-instance-lock issue
were addressed in commit `eb12124` ("Fix 3 pre-ship blockers from audit") and
the Chromium-bundling fix, then re-verified on a fresh Windows rebuild at
commit `d707090` (pricing/trial commit, built on top of `3f1faf6`). See
"Re-verification" note under each item, and "Build info" below for the fresh
installer's hash. Most findings are in shared code (`electron/main.cjs`,
`src/local-api/server.ts`, `src/routes/auth-callback.tsx`, group/import logic)
and apply to **both the Windows and Mac builds** unless noted otherwise.

**Important scope note on this pass:** this re-verification round was run by
an AI agent with shell/file access only — no GUI, no email inbox, no Facebook
account access. It confirms the rebuild pipeline, the packaged installer
contents, and everything observable via CLI (health endpoint, port binding,
process behavior). It does **not** re-confirm the live end-to-end flow (magic
link email login → Facebook connect → group import → compose → post to a
real group) on this exact rebuild — that flow was previously verified once
on the older `cb36e59` build (see "Passed / verified clean" below) but needs
a human to re-run it on this rebuild before shipping, since a lot has changed
since (UI polish, Chromium bundling, single-instance lock, pricing/trial
changes).

## Blockers (must fix before shipping either platform)

- [x] **Local API exposed to the LAN.** `electron/main.cjs` spawns Vite (port
      8080) without restricting it to loopback, and Vite's `/api` proxy
      forwards to the Express API. Verified: a LAN-facing address could reach
      `/api/health` through the Vite proxy even though the Express server
      itself correctly refuses non-loopback connections on port 3001.
      **Fixed in `eb12124`** (Vite now spawned with `--host 127.0.0.1`).
      **Re-verified on Windows** at commit 3f1faf6: `netstat` confirms both
      port 3001 and port 8080 now listen on `127.0.0.1` only, not `0.0.0.0`.
      **Platform: both** (Mac not independently verified).

- [x] **First launch after install can fail.** Cold Vite dependency
      pre-bundling can exceed the hardcoded 90s `waitForServer` timeout in
      `electron/main.cjs`, producing a native "Could not start the app"
      error dialog on a user's very first launch. **Fixed in `eb12124`**
      (timeout raised 90s → 5min). Not yet independently re-timed against a
      truly cold cache on this pass, but the code fix is confirmed present.
      **Platform: both** (Mac likely has the same timeout constant; not
      independently verified on Mac).

- [x] **Playwright's browser isn't part of the install.** The installer/app
      bundles the Playwright JS driver but not the Chromium binary it drives
      (lives outside `node_modules`, in the OS Playwright cache). Fresh
      machines hit `Executable doesn't exist` on "Connect Facebook" until
      someone manually runs `npx playwright install chromium`. **Fixed**:
      Chromium is now bundled as an `extraResource` (`pw-browsers/`) and the
      API points at it via `PLAYWRIGHT_BROWSERS_PATH`. **Re-verified on
      Windows**: built with `PLAYWRIGHT_BROWSERS_PATH=$PWD\pw-browsers npx
      playwright install chromium` (690MB), packaged installer grew from
      ~156MB to 365MB, confirmed `chrome.exe` present in the installed app's
      `resources\pw-browsers\chromium-1228\chrome-win64\` — no manual
      `playwright install` needed on this fresh machine.
      **Platform: both** — Mac needs its OWN Chromium bundle built the same
      way (Playwright downloads platform-specific browsers; the Windows
      `pw-browsers` folder will not work on Mac). Not verified on Mac.

## High priority

- [x] **No single-instance lock.** `electron/main.cjs` never calls
      `app.requestSingleInstanceLock()`. Launching a second instance while
      one is running fails that instance's own Vite server
      (`Port 8080 is already in use`), and both windows end up silently
      sharing whichever instance's servers actually bound. Closing the
      "wrong" window kills the backend for the other one, with no clear
      error. **Fixed in `eb12124`** (`requestSingleInstanceLock()` added).
      **Re-verified on Windows**: launched a second instance while the first
      was running. Net functional result is correct — only one listener
      ended up on each of ports 3001/8080, the original window/session kept
      working, and the second process exited on its own with no crash and no
      orphaned window. **Minor cosmetic note**: the second instance's console
      still logs its own "Starting servers... All servers ready, loading
      app..." lines before it quits, meaning the lock check happens after
      that logging/startup work runs rather than short-circuiting
      immediately — harmless (no port conflict, no visible second window)
      but worth tightening later so a second launch exits instantly instead
      of doing wasted work first. **Platform: both** (Mac not independently
      verified). Note: visual "does the original window get focused"
      behavior was not confirmed (no GUI access this pass) — only the
      network/process-level outcome was checked.

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

### Original pass
- Commit tested: `cb36e59`
- Installer SHA256: `b0ef93f49e280df5a365d095ed00ac649d1a0b48ee39c36a84ceaa0ca80a17c0`
- Installer size: 156.7 MB (Chromium not yet bundled at this point)

### Rebuild re-verification pass (this update)
- Commit tested: `d707090` (pricing/trial commit, on top of `3f1faf6`)
- Installer: `dist-electron/GroupBlast Setup 0.1.0.exe`
- Installer SHA256: `8e349db7c3e0f245fc06f1bd39fada85e98459586a5fa06510a2f94220b340e7`
- Installer size: 382,553,283 bytes (~365 MiB / 383 MB) — up from 156.7 MB
  because Chromium is now bundled. Confirmed present at
  `resources/pw-browsers/chromium-1228/chrome-win64/chrome.exe` in the
  unpacked output, so a fresh machine needs no manual
  `npx playwright install chromium` step.
- Build pipeline (`npm install` → `@electron/rebuild -f -w better-sqlite3` →
  `playwright install chromium` into `pw-browsers/` → `npm run build` →
  `npm run electron:build:win`) completed with no errors.
- CLI-verifiable checks passed on the rebuilt app (run from
  `dist-electron/win-unpacked/GroupBlast.exe` directly, not through a full
  uninstall/reinstall cycle — that step needs a human at the Windows GUI):
  - `/api/health` responds `{"ok":true,...}` on both cold (~10s) and warm
    (~3s) launch.
  - `netstat` confirms both port 3001 and port 8080 listen on `127.0.0.1`
    only, never `0.0.0.0`.
  - Single-instance lock: see re-verification note above.
- **Not yet re-verified this pass** (needs a human, see scope note at top):
  installer GUI run + SmartScreen click-through, magic-link email login,
  Facebook Chromium login, group import, compose/schedule UI, and an actual
  post landing in a real Facebook group.

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

## Overall verdict

**Conditional GO for Windows testers**, with one condition: a human needs to
run the live end-to-end flow (magic-link login → Connect Facebook → import
groups → compose → post to one real group) once on this exact rebuild
(`d707090`, installer SHA256 `8e349db7c3e0f245fc06f1bd39fada85e98459586a5fa06510a2f94220b340e7`)
before wider distribution. Reasoning:

- All 4 blockers/high-priority items from the original audit are fixed in
  code and re-verified at the level this pass could check (build succeeds,
  Chromium is actually bundled, ports are loopback-only, single-instance
  lock produces no crash/conflict).
- The live account/GUI flow (email login, Facebook session, real group post)
  was verified once before on an older build (`cb36e59`) but not on this
  rebuild — a lot of relevant code has changed since (UI polish, Chromium
  bundling path, single-instance lock, pricing/trial gating), so it needs
  re-confirmation on real hardware with real accounts before shipping wider.
- Not verified on Mac at all — treat as Windows-only clearance.
