# School Event Registration System (SERS)

Node.js + Express backend, Supabase (Postgres) database, plain HTML/CSS/JS frontend.

## Setup

1. `npm install`
2. Create `.env` (never commit or share it):
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   # optional: minutes after an event's start time before registration closes (default 0)
   EVENT_CLOSE_GRACE_MINUTES=0
   ```
3. **Run `db/migrations/002_feature_round.sql` once** in the Supabase SQL Editor.
4. `npm start` → http://localhost:3000

## Default staff accounts (created on first start)

| Role      | Login             | Temporary password |
|-----------|-------------------|--------------------|
| Organizer | org1@school.com   | pass123            |
| Admin     | admin@school.com  | admin123           |

Staff must choose a new password at first login. Students sign up themselves.

## Features

- **Everyone:** Settings (profile + change password). Students edit first/middle/last name and section; Student ID and email are fixed. Organizers/admins edit their name.
- **Student:** browse + search + filter events, register, cancel, Upcoming / History tabs.
- **Organizer:** create / edit events, close / reopen registration, cancel event, attendance sheet, delete.
- **Admin:** statistics, users (search, filter, paging, student ↔ organizer role change, create organizer, delete), events (cancel / delete), audit log.
- **Auto-close:** an event closes for registration when its date/time passes (stored status updates on a 1-minute timer and on every event request, so it also works on serverless hosting).

## Project structure

```
server.js                 app bootstrap
src/
  config/                 constants, Supabase client
  middleware/             auth (single place that identifies the caller), error handling
  routes/                 auth, profile, student, event, registration, admin
  services/               event status + auto-close, registration rules, audit log
  utils/                  validators, mappers, db helpers
  jobs/ seed/             scheduler, default staff accounts
db/migrations/            SQL to run in Supabase
public/
  *.html, styles.css
  js/core/                api, session, ui helpers, formatting, dashboard bootstrap
  js/components/          navbar, settings, modal, tabs, pager
  js/pages/               auth, student, organizer, admin
```

## Still to do (security)

The API identifies the caller from an `x-user-id` header (role is always read from the database). Replace this with JWT in `src/middleware/auth.js` and `public/js/core/api.js`, then: restrict CORS, add `helmet` + `express-rate-limit`, enable Supabase RLS.
