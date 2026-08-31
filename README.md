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

- No test suite and no CI.
- Realtime is single-instance: the pending-confirmation map lives in process
  memory and there is no Socket.IO Redis adapter, so the app cannot scale past
  one instance without breaking presence.
- `GET /tasks` returns every task to any authenticated user.
- No admin audit log yet.
