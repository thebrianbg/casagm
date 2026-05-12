# Casa GM

> **"Home, managed."** — A family hub PWA for the Guerra family.
> Named after **G**rant and **M**iles. Built for Brian (brian@brianguerra.com) and Lindsay (lbofman@gmail.com).

---

## What this is

A Progressive Web App (PWA) installable on two iPhones as a home-screen app. It's a shared family dashboard covering documents, calendar, reminders, and more. Data is stored in Supabase and syncs in real time between both phones.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | No framework, no build step |
| Auth | Supabase Auth | Magic link OTP — no passwords |
| Database | Supabase (Postgres) | Real-time sync via postgres_changes |
| Push notifications | Web Push API + VAPID | Edge functions send via npm:web-push |
| Hosting | Vercel | Auto-deploys on git push |
| Repo | GitHub — thebrianbg/casagm | |

---

## File structure

```
casagm/
├── index.html              # App shell — lock screen + all sections + modal
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker — network-first for JS/CSS, cache-first otherwise
├── css/
│   └── app.css             # All styles — design tokens, layout, components
├── js/
│   ├── config.js           # Supabase URL + anon key + VAPID public key + allowed emails
│   ├── auth.js             # Supabase client, DB cache, real-time sync, Auth lock screen
│   └── app.js              # All UI — Home, Docs, Cal, Tasks, NotifInbox, Modal, App router
├── icons/
│   ├── icon.svg            # Master icon (navy bg, gold house, GM in door)
│   ├── icon-192.png        # Generated PNG — needed for PWA install
│   ├── icon-512.png        # Generated PNG — needed for PWA install
│   ├── apple-touch-icon.png # 180×180 — needed for iOS home screen
│   └── generate-icons.html # Open in browser to generate the PNGs above
└── supabase/
    └── functions/
        ├── notify-reminders/   # Daily digest — cron fires at 9am + 5pm ET
        └── notify-new-item/    # Real-time — fires via DB webhook on insert
```

> **Script load order in index.html matters:**
> `supabase CDN → config.js → app.js → auth.js`
> `auth.js` defines `sb` (Supabase client) and `DB` globally, used by `app.js`.

---

## Local development

No build step needed — just serve the folder over HTTP:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The service worker requires HTTP (not `file://`).

> **Auth note:** Magic links redirect to `window.location.origin`. When developing locally, temporarily add `http://localhost:8080` to Supabase → Authentication → URL Configuration → Redirect URLs.

---

## Deployment

Hosted on Vercel, connected to the `main` branch of `thebrianbg/casagm`.

```bash
git add .
git commit -m "your message"
git push   # Vercel auto-deploys in ~30s
```

Vercel URL: check the Vercel dashboard under the `casagm` project.

> **Edge functions** must be redeployed separately via the Supabase dashboard (Edge Functions → function → Code → Edit). The CLI is not installed.

---

## Supabase

**Project:** casagm
**Project ID:** pezrffldzfjimvngsobx
**Region:** us-east-1 (East US)
**Dashboard:** https://supabase.com/dashboard/project/pezrffldzfjimvngsobx

### Tables

| Table | Key columns | RLS |
|---|---|---|
| `events` | id, title, date (text YYYY-MM-DD), all_day, time, person (me/partner/family), location, notes | auth users only |
| `reminders` | id, title, due_date, assignee (me/partner/both), category, done, done_at | auth users only |
| `docs` | id, name, category, type (link/file), url, file_name, file_type, file_data (base64), notes | auth users only |
| `push_subscriptions` | id, user_id, endpoint, p256dh, auth, created_at | own rows only (`auth.uid() = user_id`) |
| `notifications` | id, title, body, created_at | public read (`using (true)`), service role inserts |

Real-time enabled via:
```sql
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table reminders;
alter publication supabase_realtime add table docs;
```

### Auth

- Provider: Email (magic link OTP — 8-digit code)
- Allowed emails: `brian@brianguerra.com`, `lbofman@gmail.com`
- Whitelist enforced in `js/config.js` → `ALLOWED_EMAILS`
- Redirect URL configured in Supabase → Authentication → URL Configuration

### Credentials (in js/config.js)

```js
const SUPABASE_URL = 'https://pezrffldzfjimvngsobx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Shs0StpKkllEweXFKvHXAA_KihOxixI';
const ALLOWED_EMAILS = ['brian@brianguerra.com', 'lbofman@gmail.com'];
const VAPID_PUBLIC_KEY = 'BCcVZSSg7f5yJuQIzDCgyEH_V5BAd8YvBF1D6w7H9VRW6_eYvxjuAuR8s34nNHiqx1xXLoCbzjoRxo-6A82GLg4';
```

> The publishable key is safe to be public (designed for browser use with RLS enabled).

### Edge functions

| Function | Trigger | Purpose |
|---|---|---|
| `notify-reminders` | pg_cron: 9am + 5pm ET | Sends push for all reminders due today or overdue |
| `notify-new-item` | DB webhook on INSERT to `events` + `reminders` | Sends push immediately when partner adds an item |

Both functions use `VAPID_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` secrets (set in Supabase → Settings → Edge Functions).

Both functions log sent notifications to the `notifications` table for the in-app inbox.

### Database webhooks

Two webhooks fire `notify-new-item` on INSERT:
- Table: `reminders` → `https://pezrffldzfjimvngsobx.supabase.co/functions/v1/notify-new-item`
- Table: `events` → `https://pezrffldzfjimvngsobx.supabase.co/functions/v1/notify-new-item`

---

## How auth works

1. User opens app → sees navy lock screen
2. Enters email → Supabase sends an 8-digit OTP code
3. Enters code → session established
4. Email checked against `ALLOWED_EMAILS` → if not on list, signed out immediately
5. On return visits → session persists; iOS Face ID unlocks the phone
6. Sign out available in gear icon → Settings

---

## How real-time sync works

After sign-in, `DB.subscribe()` opens a Supabase WebSocket channel listening for `postgres_changes` on events, reminders, and docs. When Lindsay adds a reminder on her phone, Brian's phone receives the change and re-renders automatically.

---

## How push notifications work

1. User enables notifications in gear → Settings → Notifications
2. Browser subscription saved to `push_subscriptions` table
3. Two triggers send pushes:
   - **Daily digest**: pg_cron calls `notify-reminders` at 9am + 5pm ET
   - **Real-time**: DB webhook calls `notify-new-item` on every INSERT to events/reminders
4. All sent notifications are logged to the `notifications` table
5. Bell icon on home screen shows history; red dot appears for unread

> **iOS quirk**: `navigator.serviceWorker.ready` can hang on iOS PWA. All notification status checks use browser-only APIs (no Supabase queries) and include timeouts. The `notifications` inbox uses plain `fetch` instead of the Supabase JS client to avoid token refresh hangs.

---

## App versioning

`APP_VERSION` constant in `js/app.js` (currently `2.7`). Visible at the bottom of gear → Settings. Bump this with every deploy so users can confirm they're on the latest version.

The service worker is `casagm-v13`. Bump the cache name in `sw.js` when you need to force a full cache eviction.

**Auto-update:** The app detects SW controller changes on `visibilitychange` and auto-reloads. Users should rarely need to manually "Check for Updates" anymore.

---

## Design system

**Colors**
- Navy: `#1a2e5a` (primary, headers, buttons)
- Navy dark: `#0f1c38` (gradients)
- Gold: `#d4a843` (accent, lock screen button)
- Gold light: `#e8c96e`
- Gold pale: `#fdf6e3` (backgrounds)

**Typography:** System font stack (`-apple-system, BlinkMacSystemFont, SF Pro Text`)

**Components (all in app.css):**
- `.card` — white rounded card with border + shadow
- `.bottom-sheet` — modal that slides up from the bottom
- `.nav-item` — bottom nav tab
- `.fi` / `.fl` / `.fg` — form input / label / group
- `.btn-save` — primary CTA button
- `.empty` — empty state container
- `.home-bar` — compact navy header on home screen
- `.notif-item` — row in notification history sheet

**Person color coding in calendar:**
- Brian (me): navy `#1a2e5a`
- Lindsay (partner): purple `#7c3aed`
- Family: green `#10b981`

---

## Settings

User-configurable settings (stored in `localStorage` per device, not synced):
- `name1` — Brian's display name (default: "Brian")
- `name2` — Lindsay's display name (default: "Lindsay")
- `family` — Family name shown in header (default: "Guerra")

Accessible via gear icon on the home screen.

---

## iOS / PWA notes

- `viewport-fit=cover` + `env(safe-area-inset-*)` for notch/home indicator support
- `apple-mobile-web-app-capable` — runs fullscreen when installed
- `apple-mobile-web-app-status-bar-style: black-translucent` — status bar overlays app
- PNG icons required for iOS home screen (generate from `icons/generate-icons.html`)
- Height set via JS `--vh` variable (`window.innerHeight`) to avoid iOS CSS `100dvh` quirks
- SW does network-first for JS/CSS so updates are instant on next load
- If app seems stuck on old code: force-close from iOS app switcher and reopen

**To install on iPhone:** Open Vercel URL in Safari → Share → Add to Home Screen

---

## Roadmap

### Planned
- [ ] **Lists** — Groceries, Errands, Fox Chase (NJ home), 100 Barclay (NYC apt), To Discuss
- [ ] **Google Calendar sync** — Two-way sync via Google Calendar API

### Coming soon
- [ ] Budget — track spending together
- [ ] Meal Planner — weekly meal planning
- [ ] Health — medical records & history
- [ ] Photos — share family memories

---

## Commands reference

```bash
# Local dev
npx serve .

# Deploy
git add . && git commit -m "message" && git push

# Send a test push notification (requires service role key)
# Insert reminder, invoke notify-reminders, delete reminder
```
