# openGym, personal fork: setup on OpenMediaVault + Portainer + Tailscale

This fork adds four things to openGym:

| Addition | Where | What it does |
|---|---|---|
| **Nutrition** | Home card, `/nutrition` | Food log per meal, daily calories/protein/carbs/fat against training-day and rest-day targets (ranges, ceilings), net carbs for keto, barcode scanning and online search (Open Food Facts, South African products first), a built-in list of staples, saved foods and saved meals, copy the day before, a 7-day view |
| **Protocol** | Home card, `/protocol` | Compounds with dose, schedule (weekdays, every N days, days on/off, as needed), start and end dates and phases; today's doses with one-tap logging, draw volume from vial strength, injection-site rotation, 14-day adherence, weekly totals; blood work panels with ranges you can set from your lab report, charts per marker and flags; blood pressure log with 7-day average |
| **Apple Workout on Start** | Settings → Workout → Start an Apple Workout | Starting a session runs an iOS Shortcut that starts a *Traditional Strength Training* workout on your Apple Watch, so Apple Fitness (and Discovery Vitality, which reads it) records the session |
| **Claude as the AI Coach, with your nutrition and protocol** | Plan → Coach | The Coach (Anthropic provider) now also reads two weeks of macro totals against your targets, your running compounds and logged doses, your last two blood panels and blood pressure. It treats the protocol as context: it never suggests doses |

Both new screens are modules: **Settings → Modules** switches them on or off like the built-in ones. Everything syncs between your devices the same way the rest of openGym does.

---

## 1. Put the fork on GitHub

Portainer builds the images from a Git repository, so the fork needs to live in one (a private repo is fine).

1. On GitHub, open https://github.com/DuarteSantos8/openGym and click **Fork** (private is fine). Call it whatever you like, e.g. `opengym`.
2. On any computer with git:
   ```bash
   git clone https://github.com/<you>/opengym.git
   cd opengym
   git am /path/to/opengym-fork.patch      # the patch file from this delivery
   git push
   ```
   (Or ask Claude to push it for you once the fork exists.)

## 2. Prepare Tailscale (one time)

In the Tailscale admin console (https://login.tailscale.com/admin):

1. **DNS** page: make sure **MagicDNS** is on, and under **HTTPS Certificates** click **Enable HTTPS**. Note your tailnet name shown there, e.g. `tail1a2b3c.ts.net`.
2. **Settings → Keys → Generate auth key**. Not reusable, not ephemeral is right. Copy the `tskey-auth-…` value.

The stack runs its own small Tailscale container, so the app gets its own address,
`https://opengym.<your-tailnet>.ts.net`, with a real certificate. Your existing Tailscale setup is untouched,
and nothing is exposed to the internet.

## 3. Make a folder on the OMV box

In OMV, pick a shared folder for app data, e.g. `/srv/dev-disk-by-uuid-XXXX/appdata/opengym`.
The stack creates `data/`, `coach-auth/` and `tailscale/` inside it. **Back up `data/`**: it is
everything (profiles, workouts, food log, protocol).

## 4. Deploy in Portainer

**Stacks → Add stack**

- Name: `opengym`
- Build method: **Repository**
- Repository URL: `https://github.com/<you>/opengym` (for a private repo, turn on *Authentication* with a GitHub personal access token that can read it)
- Repository reference: `refs/heads/main`
- Compose path: `portainer-stack.yml`
- **Environment variables**:

| Name | Value |
|---|---|
| `TS_AUTHKEY` | the `tskey-auth-…` key |
| `TS_TAILNET` | e.g. `tail1a2b3c.ts.net` |
| `DATA_PATH` | e.g. `/srv/dev-disk-by-uuid-XXXX/appdata/opengym` |
| `LAN_PORT` | optional, default `8085` |
| `API_TARGET` | leave unset (see the Coach section) |

**Deploy the stack.** The first build takes a few minutes (it compiles the app on the box).
Later, **Pull and redeploy** in the stack's page picks up new commits.

## 5. First sign-in

1. On your iPhone, have the Tailscale app connected.
2. In Safari open `https://opengym.<your-tailnet>.ts.net`, tap **Create profile**, and save the passkey (Face ID).
   That first profile becomes the admin.
3. Share → **Add to Home Screen**. Use openGym from that icon from now on.
4. On the first card after setup, choose **Everything** (or switch on Nutrition and Protocol in **Settings → Modules**).

At home, `http://<omv-ip>:8085` also works, with the name-and-password sign-in (passkeys only work on the HTTPS address).

## 6. Apple Workout on Start (for Discovery Vitality)

1. iPhone **Shortcuts** app → **+** → add the action **Start Workout** → tap the workout type → **Traditional Strength Training**, goal **Open**.
2. Name the shortcut **Start Strength Workout** → Done.
3. In openGym: **Settings → Workout → Start an Apple Workout** → switch on → **Test the Shortcut**.

From then on, starting any session (Home, the Start button, a routine) opens Shortcuts for a moment, the
watch starts the strength workout, and the small "◀ openGym" arrow at the top-left of the screen brings
you straight back. End the workout on the watch when you finish (or set a finish Shortcut on the same page).

Apple Fitness records it as its own workout, which is what Discovery counts. Leave openGym's own Apple Watch app out of it (the web app does not use it anyway) so a session is not recorded twice.

## 7. Claude as the AI Coach

1. Get an API key at https://console.anthropic.com (Settings → API keys).
2. In openGym: **Settings → Account → Admin dashboard → AI Coach** → **Set up the Coach** → provider **Anthropic** → paste the key → **List models** and pick one (a Sonnet model is the sensible price/quality choice; Opus for the most careful reviews) → **Test the Coach** → make sure the switch at the top is on.
3. **Plan → ⋯ → Coach**, agree to the consent screen (it now lists Nutrition and Protocol too), answer the short intake.

Prefer to use your Claude subscription instead of an API key? Set `API_TARGET=coach` in the stack's
environment, redeploy, run `claude setup-token` on a computer with Claude Code, and paste the token
under the **Claude (Anthropic)** chip instead.

What the Coach is sent is listed on its consent screen. For the additions: daily calorie and macro totals
(never the foods), targets, compound names, doses and schedules, how many scheduled doses were logged,
the last two blood panels with their ranges, and blood pressure. Never notes, injection sites or the lab's name.

---

## Updating from upstream openGym

The additions are kept in their own files where possible, so upstream updates merge cleanly:

```bash
git remote add upstream https://github.com/DuarteSantos8/openGym.git
git fetch upstream && git merge upstream/main
git push        # then "Pull and redeploy" in Portainer
```

Files the fork touches in upstream code (the places a merge could conflict): `api/server.js` (two food
routes), `api/sync-stamps.js` and `frontend/src/lib/sync-merge.js` (the new data fields), `api/coach/core/payload.js`,
`categories.js` and the prompts, `frontend/src/sheets.jsx` (the Shortcut hook on Start), `App.jsx`, `Home.jsx`,
`Settings.jsx`, `modules.js`, `useStore.js`, `Icon.jsx`.

New files: `api/food.js`, `api/coach/core/extras.js`, `frontend/src/lib/{nutrition,protocol,stamped,foods-builtin,apple-workout}.js`,
`frontend/src/views/{Nutrition,Protocol}.jsx`, `frontend/src/components/AppleWorkoutSheet.jsx`, `frontend/src/extras.css`,
`portainer-stack.yml`, this file, and tests beside each.

The new screens are in English only (openGym's other languages fall back to English for them).

## Licence

openGym is AGPL-3.0: running a modified copy for yourself is fine. If you ever offered it to other people over a network, you would have to offer them this fork's source too. The exercise animations are licensed separately for use in openGym only (NOTICE.md); a personal, non-commercial fork may keep them unmodified.
