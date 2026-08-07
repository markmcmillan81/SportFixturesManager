# FlexPlay — Multi-Sport Fixtures Manager

Run Americano, Mexicano, round-robin leagues, groups + knockout, straight knockout, Swiss and ladder
formats for any sport, from a phone, with no signal.

No build step, no dependencies, no server. It is plain HTML, CSS and JavaScript — open `index.html`
and it runs.

---

## Deploying it (GitHub → Netlify → your phone)

### 1. Push to GitHub

From the folder containing this README:

```bash
git init
git add .
git commit -m "FlexPlay v1"
git branch -M main
git remote add origin https://github.com/markmcmillan81/SportFixturesManager.git
git push -u origin main
```

If the repo already has commits, `git pull --rebase origin main` first.

### 2. Connect Netlify

1. Go to app.netlify.com → **Add new site** → **Import an existing project** → **GitHub**.
2. Pick `markmcmillan81/SportFixturesManager`.
3. Build settings:
   - **Build command:** leave empty
   - **Publish directory:** `.` — or `app` if you pushed the whole project folder rather than the
     contents of `app/`
4. **Deploy**. You get a URL like `flexplay-abc123.netlify.app`.
5. Optional: **Domain settings → Add custom domain** for something like `flexplay.app`.

Every future `git push` redeploys automatically.

### 3. Put it on your phone (no App Store)

- **iPhone:** open the URL in **Safari** (it must be Safari) → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Install app** / **Add to Home screen**.

It gets its own icon, opens full-screen with no browser bar, and works with no signal.

> When you deploy a new version, bump `CACHE` in `sw.js` (e.g. `flexplay-v2`). Installed devices
> only pick up new code when that string changes.

---

## What is in v1

| Area | State |
| --- | --- |
| Americano | Live generation, rotating partners, greedy no-repeat pairing |
| Mexicano | Live generation from the running table (1 & 4 v 2 & 3, switchable) |
| Round robin league | Full schedule drawn up front (circle method) |
| Groups + knockout | Snaked groups, organiser sets how many advance, bracket auto-drawn |
| Straight knockout | Seeded bracket with automatic byes |
| Swiss | Paired on record each round, rematches avoided |
| Ladder | Winners move up a court, losers down |
| Player database | Permanent reference per player; matches, wins, points for/against accrue across events and sports |
| Approvals queue | Built and working — fills once a backend is connected |
| Spectator link | Snapshot link today; real-time once a backend is connected |
| Offline | Full offline use via service worker; all data in `localStorage` |
| Drop-outs | Organiser chooses per case: walkover, void, or remove from future rounds |

**Tie-breaks:** points → points difference → head-to-head → points scored.

**Scoring:** Americano and Mexicano score individual points (your score *is* your points).
Every other format uses 3 / 1 / 0.

---

## Adding a backend later

Everything the app writes goes through `js/store.js`, and every mutation is appended to an outbox.
To make the app multi-device — live spectator boards, players submitting scores from their own
phones — implement two functions and set one flag:

```js
// js/store.js
const Backend = {
  enabled: true,
  async push(ops) { /* send ops to Supabase/Firebase */ },
  async pull()    { /* return { events, players } */ }
};
```

Nothing else in the app changes. `Store.sync()` is already called when the device comes back online.

**Supabase is the cheaper path** (free Postgres + realtime subscriptions). You would need three
tables — `events`, `players`, `results` — plus row-level security keyed on an organiser id.

---

## File map

```
index.html            App shell + PWA meta
manifest.webmanifest  Home-screen install metadata
sw.js                 Service worker (offline cache) — bump CACHE on each release
netlify.toml          Netlify config
css/app.css           Modernist design tokens + components
js/engines.js         All fixture generation + standings maths. Pure, no DOM.
js/store.js           localStorage persistence, player records, backend seam
js/ui.js              Screens, routing, event handling
icons/                Placeholder app icons — replace with your logo
```

## Replacing the icons

Swap `icons/icon-192.png`, `icons/icon-512.png` and `icons/icon-maskable-512.png` with your logo at
those exact sizes and filenames. The maskable one needs ~20% clear padding around the mark, because
Android crops it to a circle or squircle.

## Data safety

All data lives in this browser's `localStorage`. Clearing site data deletes it. **Share → Export
data** downloads a JSON backup; **Import** restores it. Take a backup before a big event.
