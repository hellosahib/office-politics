# Office Politics

**Play it now:** https://hellosahib.github.io/office-politics/ (deployed from `main` by GitHub Actions).

A 3–4 player strategy game about winning over the employees of a company, one department at a time:
play influence cards, survive events, plant moles, and become CEO (Takeover) or win the vote (Election).
Rules: [docs/SPEC.md](docs/SPEC.md). Every implementation choice: [docs/DECISIONS.md](docs/DECISIONS.md).

## Local development

```sh
npm install
npm run dev      # http://localhost:5173 — hot-seat and bots work with no setup
npm test         # vitest
npm run sim      # headless bot-vs-bot games (balance testing)
```

## Online play (Firebase, optional)

Online rooms use Firestore + Anonymous Auth, client-side only (D2). Without config the game
simply hides the online option.

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database →** pick a location, **production mode**.
4. Put your project id in `.firebaserc` (replace `your-firebase-project-id`), then deploy the rules:
   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules
   ```
5. **Project settings → Your apps → Add app → Web.** Copy `.env.example` to `.env.local` and fill
   the `VITE_FIREBASE_*` values from the web config. Restart `npm run dev`.

Data model: `rooms/{code}` (lobby, seed, `actionCount`) and `rooms/{code}/actions/{seq}` (append-only
action log every client replays). See the header of `firestore.rules`.

Local emulators instead of a real project: `npx firebase emulators:start --only auth,firestore`
and set `VITE_FIREBASE_EMULATOR=1` in `.env.local` (any non-empty values for the other keys,
project id `demo-…`).

## Deploying to thegeekdogs.com (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and publishes on every push to `main` (or manually
via *Actions → Deploy to GitHub Pages → Run workflow*). The build uses a **relative base path**, so
the same artifact works at a subdomain root, under a subpath, or at the default
`https://<user>.github.io/<repo>/` URL with no configuration.

`thegeekdogs.com` is currently served by the GitHub Pages site of the project repo
`hellosahib/thegeekdogs`, behind Cloudflare DNS. Because the custom domain sits on a *project*
repo (not a `hellosahib.github.io` user site), a second repo does **not** automatically appear
under `thegeekdogs.com/<repo>/`. The recommended option therefore is a subdomain (D35).

**Recommended: subdomain — `https://play.thegeekdogs.com/`** (existing site untouched)
1. Create the repo (e.g. `hellosahib/office-politics`) and push this project to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.** The first run publishes to
   `https://hellosahib.github.io/office-politics/` — already playable.
3. **Settings → Pages → Custom domain:** `play.thegeekdogs.com` → Save.
4. Cloudflare DNS for `thegeekdogs.com`: add `CNAME  play  →  hellosahib.github.io`
   (proxy status can stay "DNS only"; proxied also works). Wait for the Pages check to pass, then
   tick **Enforce HTTPS**.
5. **Settings → Secrets and variables → Actions → Secrets:** `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
   (optional: `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`). Re-run the workflow.
6. Firebase **Authentication → Settings → Authorized domains:** add `play.thegeekdogs.com`
   (and `hellosahib.github.io` if you use that URL).

Any subdomain name works (`officepolitics.`, `games.` …); only steps 3–4 and 6 change.

**Alternative: subpath — `https://thegeekdogs.com/office-politics/`**
Only possible by publishing this game's `dist/` *into* the `hellosahib/thegeekdogs` repo (e.g. a
workflow step that pushes `dist/` to a `office-politics/` folder of that repo with a deploy key).
It couples the two sites' deployments and risks overwriting each other; not set up. Ask if you
want it.

**Alternative: Firebase Hosting** — `npx firebase deploy --only hosting` publishes `dist/`
(`firebase.json`); point a subdomain at it from the Firebase console instead of GitHub.

## How to play

On your turn:
- **Event** — reveal an event card; vote or choose how your department responds.
- **Refresh & pay** — influence resets to your rank's maximum; pay management cost for your departments.
- **Draw** — 4 influence cards; negotiate and trade saved cards with the table.
- **Focus** — choose **Manage** (your departments) or **Expand** (neutral and rival departments).
- **Play** — spend influence on cards; match an employee's traits for better odds. Win 3 of 4 employees to take a department.
- **Save & end** — keep up to 3 cards for 1 influence each, review the turn summary, pass the turn.
