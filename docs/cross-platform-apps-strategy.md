# Cross-Platform Apps Strategy (Android, iOS, Windows, macOS)

> Saved: 2026-07-22  
> Status: Planning — not implemented yet  
> Context: KhataLens currently ships as a **React 19 + Vite web app** (`frontend/`) with **FastAPI + Supabase** backend. No Capacitor, Tauri, Electron, or React Native setup exists in the repo today.

## Summary

Ship all four platforms from **one UI codebase**, with different native “shells” around the existing web app. Backend stays unchanged (`https://khatalens.com` API + Supabase).

| Platform | Recommended approach | Why |
|----------|----------------------|-----|
| **Android + iOS** | **Capacitor** wrapping existing React app | Reuses 90%+ of current UI; native camera/files for scan |
| **Windows + macOS** | **Tauri 2** (or Electron) wrapping `frontend/dist` | CA desktop workflow: Excel, PDF, Tally XML |
| **Optional quick win** | **PWA** | Installable web; no store; limited on iOS |

**Avoid for v1:** React Native / Flutter — full UI rewrite for grids, uploads, and flows already built in React.

---

## Architecture

```
React 19 + Vite + Tailwind (frontend/)
        │
        ├── Capacitor → Android APK/AAB
        ├── Capacitor → iOS (TestFlight / App Store)
        ├── Tauri 2   → Windows .exe / .msi
        └── Tauri 2   → macOS .dmg (notarized)

All clients → FastAPI API + Supabase Auth/DB (unchanged)
```

---

## Phase 1 — Mobile (Android + iOS) with Capacitor

### Setup (in `frontend/`)

```bash
cd frontend
npm install @capacitor/core @capacitor/cli
npx cap init "KhataLens" com.khatalens.app
npm install @capacitor/android @capacitor/ios
npm install @capacitor/camera @capacitor/filesystem @capacitor/app @capacitor/browser

npm run build
npx cap add android
npx cap add ios
npx cap sync

npx cap open android   # Android Studio → APK/AAB
npx cap open ios       # Xcode → TestFlight / App Store
```

### App changes required

| Web today | Mobile need |
|-----------|-------------|
| `<input type="file">` for scan | `@capacitor/camera` + `@capacitor/filesystem` |
| Supabase auth | Same; OAuth needs **deep links** (`com.khatalens.app://`) |
| Large reconciliation grid | **Mobile layouts** — simplified lists, not 1000-row desktop grid |
| `getApiUrl()` | Per-build env: `VITE_API_URL=https://khatalens.com` |

### Store requirements

- **Google Play:** Developer account (~$25 one-time), AAB, privacy policy, data safety form
- **Apple:** Developer account ($99/year), App Review, privacy labels, camera/photo usage strings in `Info.plist`

---

## Phase 2 — Desktop (Windows + macOS) with Tauri 2

Two different Tauri surfaces (do not conflate):

| Surface | Folder | Role |
|---------|--------|------|
| **Tally Bridge companion** (ship first) | [`bridge/`](../bridge/) | Thin tray/setup UI: device pair, poll export jobs, POST XML to local Tally (`127.0.0.1:9000`). **Not** a full KhataLens shell. |
| **Full desktop shell** (later) | wraps `frontend/dist` | CA desk: Excel, PDF, reconcile UI offline-capable |

Details for Bridge: [tally-bridge.md](./tally-bridge.md). Cloud never dials Tally; Bridge is the only process that talks to Tally Request Server.

### Full shell setup (when needed)

```bash
# Add to existing Vite project or create tauri-app
npm install --save-dev @tauri-apps/cli

npm run build          # Vite → dist/
npm run tauri build    # .exe (Windows) / .dmg (macOS)
```

Configure Tauri `devUrl` / `frontendDist` to point at Vite output.

### Desktop-specific features

| Feature | Approach |
|---------|----------|
| Open/save Excel, XML | Tauri file dialog + `@tauri-apps/plugin-fs` |
| Auto-update | Tauri updater or MSIX (Windows) |
| Auth / OAuth | Custom URL scheme or system browser + redirect |
| Notifications | Optional (batch scan complete) |
| Tally push | **Bridge companion** only — see Phase 2 table above |

### Distribution

- **Windows:** `.msi` / MSIX / signed `.exe` (code signing cert for SmartScreen trust); Bridge MSI from `bridge/src-tauri`
- **macOS:** Notarized `.dmg` (Apple Developer + notarization in CI); Bridge macOS later (P4)

---

## Phase 3 — PWA (optional bridge)

Add web app manifest + service worker for “Install app” in Chrome/Edge.

- **Pros:** Days not weeks; same deploy pipeline
- **Cons:** iOS limits background, filesystem, push; not in App Store

Use as interim before native apps, not full replacement for camera-heavy scan.

---

## Recommended build order (KhataLens)

CA usage pattern: desktop for reconcile/Tally/Excel; mobile for invoice capture.

```
1. Capacitor Android (internal APK)     → camera scan on phone
2. Tauri Windows                        → desktop CA workflow
3. Capacitor iOS + TestFlight
4. Tauri macOS + notarization
5. Play Store + App Store polish
```

---

## Shared codebase rules

1. **Platform detection** — e.g. `src/lib/platform.ts`:
   ```ts
   import { Capacitor } from '@capacitor/core';
   export const isNative = Capacitor.isNativePlatform();
   export const isMobile =
     isNative &&
     (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android');
   ```
2. **Adaptive UI** — mobile routes for Scan/Invoices; full grid on desktop/Tauri
3. **Single API layer** — keep `getApiUrl()` + Supabase; no duplicate business logic in native shells
4. **CI** — GitHub Actions: `build web` → `cap sync` → `tauri build` (macOS runner for Mac builds)

---

## Rough effort (1 dev, part-time)

| Deliverable | Estimate |
|-------------|----------|
| Capacitor Android MVP (login, scan, invoices) | 2–3 weeks |
| Tauri Windows (wrap existing app) | 1–2 weeks |
| iOS + store compliance | +2–3 weeks |
| macOS notarized build | +1 week |
| Mobile-optimized reconciliation UI | +2–4 weeks |

---

## Do not do initially

- Rebuild in React Native/Flutter unless offline-native performance is mandatory everywhere
- Run FastAPI/LLM extraction on-device — keep AI on server (credits, consistency)
- Ship desktop reconciliation grid unchanged on phone

---

## Smallest useful first slice in this repo

1. Add **Capacitor** to `frontend/`
2. Wire **Scan page** to native camera on mobile
3. Produce **Android debug APK** for internal testing
4. Add **Tauri Windows** wrapping the same build for CA desktop testing

---

## Related KhataLens docs

- [CLAUDE.md](../CLAUDE.md) — stack overview
- [docs/12_Tax_Liability_Predictor.md](12_Tax_Liability_Predictor.md) — GSTR-1 Excel (web feature)
- [no-llm-hybrid-product-architecture.md](./no-llm-hybrid-product-architecture.md) — deterministic core + optional Smart Scan
- Scan/export overhaul: `docs/superpowers/plans/2026-07-22-scan-extraction-export-overhaul.md`

---

## Resume

When ready to implement, say: **“Start Capacitor Android scaffold”** or **“Start Tauri Windows scaffold”**.
