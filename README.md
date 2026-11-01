# Kitchen Saathi — demo MVP

**Menu in. Order plan out.** A phone-first web app that helps hostel, PG and mess kitchen managers decide what to buy. You plan a meal, the app works out quantities from your own recipe rates, checks them against usable stock, and gives you an order to edit and send on WhatsApp.

> This is a demo with sample data (Sunrise Boys Hostel, Sector 51, Gurugram). Every dish, rate and stock figure is editable.

## Run it

You need Python 3.9 or newer. It uses only the standard library, so there's nothing to install. Run this from this folder:

```bash
python server.py
```

Then open **http://localhost:5173** (use `localhost`, not `127.0.0.1`, or Google will refuse the origin). A 360–430 px window or your browser's device toolbar shows it as on a phone.

Without a Google Client ID the app runs in demo mode. Demo data lives only in that browser.

## Google sign-in

### Turn it on (about 5 minutes, done once)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email, and add yourself (and anyone testing) under *Test users*.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` and `http://localhost`
   - Leave redirect URIs empty. The app uses Google's popup button, not redirects.
4. Copy the Client ID (`…apps.googleusercontent.com`). Make a `.env` file in this folder (copy `.env.example`) containing:

   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

5. Restart `python server.py`. It prints `Google sign-in: on`. Reload the page and tap **Continue with Google**.

While the consent screen is in *Testing*, only the test users you added can sign in. Publish the app on the consent screen to open it to everyone.

### How it works

1. Google's button (Google Identity Services) signs you in and gives the browser an **ID token**, a JWT signed by Google.
2. The browser sends it to `POST /api/auth/google`. `server.py` checks the **RS256 signature** against Google's published keys (fetched from `googleapis.com/oauth2/v3/certs` and cached as Google's headers allow). Then it checks the **issuer**, that the **audience** is your Client ID, and that it hasn't **expired**. Anything else gets a 401.
3. The server starts a **session**: a random 256-bit token in an `HttpOnly; SameSite=Lax` cookie, valid 30 days. Only its SHA-256 hash is stored. Sign-out deletes it on the server.
4. Your kitchen (plans, recipes, stock) is saved **on the server under your Google account** (`data/kitchen_saathi.db`, SQLite). So it follows you to any browser or phone that reaches this server. The browser keeps a copy, so a dropped connection doesn't lose edits; they sync when the server is back.

Built-in protections: state-changing requests must be JSON from this same origin (CSRF guard). A Content-Security-Policy allows only this app and Google's sign-in scripts. Only `index.html`, `css/` and `js/` are served; `server.py`, `.env` and `data/` never are.

### Before putting it on the internet

- Serve it over **HTTPS** (behind Caddy, nginx or a host that terminates TLS), set `SECURE_COOKIES=1`, and add the `https://` origin to the OAuth client.
- `HOST=0.0.0.0` makes it listen beyond this machine. Only do that behind HTTPS.
- Each account has one kitchen, and the last save wins. Two people sharing one kitchen (manager + cook on different phones) would need kitchen membership. That's the natural next step.
- Back up `data/kitchen_saathi.db`. If it sits in a OneDrive or Dropbox folder, point `DATA_DIR` somewhere outside the synced folder.

## The flow

| Screen | What you see |
|---|---|
| Sign in | Google, or try the demo |
| Setup | Kitchen name → usual number of people (first run only) |
| Today | One line per meal: *Not planned* / *Draft* / *Ordered*. Cook alerts on top |
| 1 Plan | Today / Tomorrow / date chips, meal chips, dish list (recent first, searchable), people stepper with presets |
| 2 Quantities | One line per ingredient. Tap one to see *rate × people* per dish and change the rate |
| 3 Stock | Usable stock with one status (icon + word + colour). Tap for need / recorded / usable, date, *Count it anyway*, *Recount* |
| 4 Order | Needed − usable, rounded up to how it's sold. ± steppers, tap an item for the maths or to remove it, add items, Share on WhatsApp / Copy |
| Cook | Today's plan dish by dish, large figures, a **Missing** button that alerts the manager |

Manager / Cook switch: top bar. Language (EN / हिं): top bar. Account, reset and empty-state shortcuts: tap the avatar.

## Code map

```
server.py             static files + Google token verification + sessions + kitchen storage
.env.example          settings template (GOOGLE_CLIENT_ID, PORT, SECURE_COOKIES)
index.html            shell + script order (plain scripts; bump ?v= after edits)
css/tokens.css        colours, fonts, spacing (contrast ratios noted inline)
css/app.css           components
js/auth.js            Google button, server session, demo session
js/i18n.js            English + Hindi copy, device language setting
js/seed.js            demo dishes, per-cover rates, stock register
js/calc.js            pure maths: dates, units, needs, stock, draft, order text
js/store.js           kitchen state: server for Google accounts (cached locally), browser for demo
js/ui.js              icons, number animation, toast, sheet, progress bar, squiggle
js/app.js             router, sign-in gate, top bar, account sheet
js/screens/*.js       login, onboarding, home, plan, calculate, stock, draft, cook
```

### Rules the maths follows

- **Need** = Σ over dishes of (rate per person × people).
- **Usable stock** = recorded stock converted to the recipe unit. It counts as 0 if the units can't be compared (kg vs L), and stale stock counts as 0 unless you choose *Count it anyway*.
- **To buy** = need − usable, rounded **up** to the item's buying step.
- Your hand edits stay until people, dishes, rates or stock change the computed list. Items you added are always kept.

## Design

- **Palette.** Lime paper `#EEF6C9`, ink `#111111`, one sun-yellow accent `#FFD43B`, on a peach → coral backdrop (desktop). Status colours: green / amber / red, always paired with an icon and a word. All text is AA or better (ratios are in `tokens.css`).
- **Type.** **Inter Tight** (800–900, tight tracking) for headings and figures, with tabular numerals. **Inter** for text. **Anek Devanagari** covers Hindi at matching weights. Tracking is reset in Hindi so the headline stroke (shirorekha) stays joined.
- **Signature.** Thin black rules and a hand-drawn yellow squiggle. The squiggle underlines the brand on sign-in and draws itself under **Order** when the draft is ready. Figures flash yellow and count up or down when people change. Reduced motion shows the end state instantly.
- **Less on screen.** Each screen answers one question with one list. Explanations (the maths, stock dates, unit problems) open in a sheet only when you tap.

## Five things to test with a real kitchen manager

1. Do they think in "grams per person", "kg per 100 people", or batches? Watch them change one rate unaided.
2. Do they trust *Stale* / *Use soon*? What do they actually do with the stale paneer?
3. Does rounding to buying steps match their vendor? Compare the order with last week's real WhatsApp order.
4. Time plan-to-share standing in the kitchen, one-handed, against their current WhatsApp habit.
5. Does the cook open the Cook view in Hindi, and does **Missing** replace the phone call?
