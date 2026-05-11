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
| Auth | Supabase Auth | Magic link — no passwords |
| Database | Supabase (Postgres) | Real-time sync via postgres_changes |
| Hosting | Vercel | Auto-deploys on git push |
| Repo | GitHub — thebrianbg/casagm | |

---

## File structure

```
casagm/
├── index.html              # App shell — lock screen + all 5 sections + modal
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache-first, offline support)
├── css/
│   └── app.css             # All styles — design tokens, layout, components
├── js/
│   ├── config.js           # Supabase URL + anon key + allowed emails (edit this)
│   ├── auth.js             # Supabase client, DB cache, real-time sync, Auth lock screen
│   └── app.js              # All UI — Home, Docs, Cal, Tasks, More, Modal, App router
└── icons/
    ├── icon.svg            # Master icon (navy bg, gold house, GM in door)
    ├── icon-192.png        # Generated PNG — needed for PWA install
    ├── icon-512.png        # Generated PNG — needed for PWA install
    ├── apple-touch-icon.png # 180×180 — needed for iOS home screen
    └── generate-icons.html # Open in browser to generate the PNGs above
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

---

## Supabase

**Project:** casagm
**Project ID:** pezrffldzfjimvngsobx
**Region:** us-east-1 (East US)
**Dashboard:** https://supabase.com/dashboard/project/pezrffldzfjimvngsobx

### Tables

| Table | Key columns |
|---|---|
| `events` | id, title, date (text YYYY-MM-DD), all_day, time, person (me/partner/family), location, notes |
| `reminders` | id, title, due_date, assignee (me/partner/both), category, done, done_at |
| `docs` | id, name, category, type (link/file), url, file_name, file_type, file_data (base64), notes |

All tables have RLS enabled. Policy: any authenticated user has full read/write access (shared family data).

Real-time enabled via:
```sql
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table reminders;
alter publication supabase_realtime add table docs;
```

### Auth

- Provider: Email (magic links only)
- Allowed emails: `brian@brianguerra.com`, `lbofman@gmail.com`
- Whitelist is enforced in `js/config.js` → `ALLOWED_EMAILS` (client-side check + Supabase signs them out if not on the list)
- Redirect URL configured in Supabase → Authentication → URL Configuration

### Credentials (in js/config.js)

```js
const SUPABASE_URL = 'https://pezrffldzfjimvngsobx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Shs0StpKkllEweXFKvHXAA_KihOxixI';
const ALLOWED_EMAILS = ['brian@brianguerra.com', 'lbofman@gmail.com'];
```

> The publishable key is safe to be public (it's designed for browser use with RLS enabled).

---

## How auth works

1. User opens app → sees navy lock screen
2. Enters email → Supabase sends a magic link
3. Taps link in email → redirected back to app, session established
4. Email checked against `ALLOWED_EMAILS` → if not on list, signed out immediately
5. On return visits → session persists; iOS Face ID unlocks the phone/browser which restores the session
6. Sign out available in More → Settings

---

## How real-time sync works

After sign-in, `DB.subscribe()` opens a Supabase WebSocket channel listening for `postgres_changes` on all three tables. When Lindsay adds a reminder on her phone, Brian's phone receives the change and re-renders the current section automatically. No polling, no refresh needed.

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

Editable in More → Settings.

---

## iOS / PWA notes

- `viewport-fit=cover` + `env(safe-area-inset-*)` for notch/home indicator support
- `apple-mobile-web-app-capable` — runs fullscreen when installed
- `apple-mobile-web-app-status-bar-style: black-translucent` — status bar overlays app
- PNG icons required for iOS home screen (generate from `icons/generate-icons.html`)
- Service worker caches all static assets for offline use

**To install on iPhone:** Open Vercel URL in Safari → Share → Add to Home Screen

---

## Roadmap

### Planned
- [ ] **Google Calendar sync** — Two-way sync via Google Calendar API (browser OAuth). User connects their Google account in More → Settings. Events flow between Casa GM and Google Calendar. Requires Google Cloud project + OAuth client ID. *(Implementation ready to start — see spawned task)*

### Coming soon (placeholders in More tab)
- [ ] Groceries — shared shopping lists
- [ ] Budget — track spending together
- [ ] Meal Planner — weekly meal planning
- [ ] Health — medical records & history
- [ ] Photos — share family memories
- [ ] Push Notifications — reminder alerts to phone

---

## Commands reference

```bash
# Local dev
npx serve .

# Deploy
git add . && git commit -m "message" && git push

# Check git status
git log --oneline -5
```
