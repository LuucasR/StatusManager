# Status Manager

Responsive app for logging and supervising employee activity in real time, built
for Heroic Spirit Games.

## What it does

Each employee signs in with an auto-assigned employee number and sets their
current status — Available, Working, Break, Lunch, Meeting, Away, Disconnected.
Every change closes the previous history segment and opens a new one, so the
system accumulates a timeline of who did what and for how long. Live counters
tick in the UI and changes broadcast over Socket.IO.

On top of that:

- **Task board** (Pending / In progress / Done) with drag and drop, participants,
  pin-to-keep, and auto-archiving 14 days after a task's end date.
- Switching to *Working* lets you **declare which task** you are on, which books
  your time against it.
- **Chat**: a team channel, direct messages, and a per-task thread that opens
  with the task and closes when it is marked Done.
- **Notification bell** for task add/remove/state-change/message.
- **Downloadable PDF reports** for activity and tasks, previewed in-app.
- **Admin panel**: approve sign-ups, create accounts, change roles, delete
  accounts, force another employee's status, request activity confirmation, and
  resolve password-reset requests.
- **Language switch** (English by default, Spanish available) and a light/dark
  theme toggle.

### Roles

Two orthogonal capabilities rather than a ladder — see `backend/src/auth/roles.ts`:

| Role | Board | Team visibility | Accounts |
|---|---|---|---|
| `EMPLOYEE` | own tasks only | own history | — |
| `TASK_MANAGER` | full | — | — |
| `SUPERVISOR` | full | history, reports, any task chat | — |
| `ADMIN` | full | full | create, role, delete, approve, status |

### Passwords

The app does **not** send email. An employee requests a reset with their email
address only; an admin approves it, the server mints a random temporary password
and shows it once, and the employee is forced to replace it on next sign-in.
Nothing reversible is ever stored.

## Local development

### Backend

```bash
cd backend
copy .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`.env` is validated at boot (`src/env.ts`): a missing `DATABASE_URL` or
`JWT_SECRET` stops the process immediately instead of failing at the first
request. See `.env.example` for the full contract.

The seed creates administrator `#1000`. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
in `.env` — note the seed re-applies that password on every run.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The API URL comes from `VITE_API_URL`, which Vite inlines **at build time**. A
production build without it fails loudly rather than silently pointing at
localhost.

### Android app

The same frontend ships as an Android app through Capacitor. It is the web app
in a WebView, not a rewrite, so a change to `frontend/src` reaches both.

```bash
cd frontend
npm run android:apk
```

That builds the web assets, copies them into `frontend/android`, and produces
`android/app/build/outputs/apk/debug/app-debug.apk`. It needs JDK 21 and the
Android SDK (`compileSdk 36`, `build-tools;36.0.0`) with `JAVA_HOME` and
`ANDROID_HOME` set; the first Gradle run downloads a lot and takes minutes.

Three things about the app are worth knowing before changing them:

- **It has no `VITE_API_URL`.** One APK has to work against any server, so the
  address is asked for on first launch and stored, and `src/serverConfig.ts`
  owns that. The web build is unchanged: a baked-in `VITE_API_URL` still wins
  and a production web build without one still throws.
- **`androidScheme` is `http`,** so the app's origin is `http://localhost`.
  On the default `https` a LAN backend on plain http would be blocked as mixed
  content before the request left the WebView. `backend/src/http/cors.ts` has
  to keep allowing that origin, and the scheme must not change afterwards -
  localStorage is keyed by origin, so flipping it signs everyone out.
- **PDFs cannot render in a WebView.** `components/pdf/pdfFile.ts` writes the
  report to storage and hands it to the OS viewer; the blob-URL iframe is the
  web path only.

The backend has to be reachable from the phone: on a LAN that means the right
address and a firewall rule for its port.

## Conventions

- **Code, comments and commit messages are in English.** UI text is not
  hardcoded: it lives in `frontend/src/i18n/translations.ts`, where `en` is the
  source catalogue and `es` is typed against it, so a missing Spanish key is a
  compile error rather than a blank label.
- **API errors carry a stable `code`** alongside their message. The frontend
  translates on the code and never on the wording, so a message can be reworded
  without breaking the UI. Validation errors deliberately have no catalogue
  entry: their field-specific message is more useful than a generic translation.
- **Migration files are never edited after being applied.** Prisma stores a
  checksum and `migrate deploy` refuses a modified migration — which is why the
  comments inside older migrations are still in Spanish.
- Dates use `en-GB` / `es-AR`, both day-first, so switching language never
  reinterprets `03/08`.

## Known gaps

- No test suite beyond `backend/src/scheduler/workday.test.ts`, and no CI.
- The app has no push notifications. Everything live is Socket.IO, and Android
  drops the socket about a minute after the screen goes off, so nothing arrives
  while it is backgrounded. The activity check forgives one missed round
  (`Employee.missedChecks`) so a pocketed phone is not auto-disconnected, but a
  long enough absence still is.
- Realtime is single-instance: the pending-confirmation map lives in process
  memory and there is no Socket.IO Redis adapter, so the app cannot scale past
  one instance without breaking presence.
- `GET /tasks` returns every task to any authenticated user.
- No admin audit log yet.
