# Flowdesk

Process management module for the in-house ERP.
React (Vite) frontend, Node.js + Express backend (plain JavaScript), PostgreSQL via Prisma, JWT auth.

Demo accounts are listed in `DEMO_USERS.txt` (password for all: `password123`).
Real people sign up themselves at `/register` (see Registering real users).

## Option A: everything in Docker

```bash
docker compose up --build
```

Open http://localhost:8080. On first start the backend creates the tables and loads the demo people.

- `JWT_SECRET=<long random string> docker compose up --build` sets a real secret.
- `SEED_DEMO=false docker compose up` skips the demo people. The seed also skips itself whenever the database already has users.
- `docker compose down` stops everything and keeps the data. Add `-v` to delete the database volume.
- Services: web (nginx, port 8080, proxies `/api` to the backend), backend (port 4000), db (Postgres, port 5432).

## Option B: local development (hot reload)

```bash
docker compose up -d db          # only the database

cd backend
cp .env.example .env             # set a real JWT_SECRET
npm install
npx prisma db push
npm run seed
npm run dev                      # http://localhost:4000

cd ../frontend                   # second terminal
npm install
npm run dev                      # http://localhost:5173 (proxies /api to :4000)
```

To wipe and reseed demo data locally: `FORCE_SEED=true npm run seed` (macOS/Linux) or
`$env:FORCE_SEED="true"; npm run seed` (Windows PowerShell).

## Looking at and managing the database

The database is PostgreSQL 16 (tables are defined in `backend/prisma/schema.prisma`).

- **pgAdmin (full admin UI):** `docker compose --profile tools up -d`, then open http://localhost:5050.
  The Flowdesk server is already listed; the password is the `DB_PASSWORD` value (`flowdesk` by default).
  Stop it with `docker compose --profile tools down`.
- **Prisma Studio (quick table browser and editor):** from `backend`, run `npx prisma studio`
  (needs `DATABASE_URL` in `backend/.env`).
- **Desktop clients** (DBeaver, TablePlus, DataGrip): connect to `localhost:5432`, database `flowdesk`, user `flowdesk`.
- **Backup:** `docker compose exec -T db pg_dump -U flowdesk flowdesk | gzip > backup-$(date +%F).sql.gz`
- **Restore:** `gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U flowdesk flowdesk`

The database and backend ports are bound to `127.0.0.1`, so only the machine running Docker can reach them.
Only the web port (8080) is meant to be reachable by users.

### Going live

- Set a strong `DB_PASSWORD` and `JWT_SECRET` (for example in a `.env` file next to `docker-compose.yml`, which is git-ignored).
  Set `DB_PASSWORD` before the first start, because Postgres only reads it when it creates the database.
- Do not run the `tools` profile on a public server. If you need pgAdmin there, reach it through an SSH tunnel or VPN.
- Schedule the backup command (cron) and keep copies off the server. Test a restore before launch.
- For production, a managed Postgres (AWS RDS, Google Cloud SQL, Azure, Supabase and similar) gives automatic backups,
  point-in-time recovery and its own console. Point `DATABASE_URL` at it and drop the `db` service.
- Create a read-only database user for anyone who only needs to look at the data.

## How access works

- At `/register` people enter their full name and choose a role: **Employee** (`ASSIGNEE`), **Manager** or **Client**.
  The role is stored on the `User` table. There is no role switcher in the UI. If someone picks the wrong role, fix or delete
  the user in the database (pgAdmin or Prisma Studio).
- Login returns a JWT. Every request loads the user from the database, so changes apply immediately.
- **Each client belongs to one manager** (`Client.managerId`, set to whoever creates it). `scope()` in `backend/src/processes.js`
  is the only place that decides which processes a user can see. A process outside your scope returns 404, never 403.
  - Manager: only processes of their own clients. Manager 1 never sees manager 2's processes.
  - Employee: processes assigned to them, or where they were @mentioned (across managers).
  - Client: processes of their own client.
- Managers use the People page to see employees and client users who are not linked to a client yet, and to link client users to
  one of their own clients. A client user who just registered sees "waiting for access" until a manager does this.
- Everyone can create a process: managers (choose one of their clients, optionally an assignee), employees (choose a client; the process
  is assigned to them so it appears on their board) and clients (always for their own client).
- Managers add new clients with **+ Add a new client**, under the Client dropdown when creating a process or above the People table.
  Client names must be unique per manager (upper and lower case are treated as the same). Every manager also gets their own "In house" client.
- Upgrading an existing database: `npx prisma db push` adds `Client.managerId`. On start, the backend gives clients that have no manager
  to the manager if there is exactly one. With several managers, assign them yourself, for example
  `UPDATE "Client" SET "managerId" = <manager user id> WHERE "managerId" IS NULL;`
- Anyone who can see a process can move it between To Do, In Progress and In Review (Status menu on the ticket).
- Approving and rejecting is a decision only a manager or the client can make, using the Decision menu
  (Not selected, Approve, Reject). It is only available while the process is In Review. Reject needs a written reason and counts as rework.
  Once a process is approved it is locked: only a manager or the client can reopen it.
  The rules are in the status route in `backend/src/processes.js`.
- Comments can @mention people. The list has all managers and employees, plus the users of that process's own client
  (never users of other clients). Mentioning an employee gives them access to that process, so it appears on their board.
- Mentioning someone creates a notification for them. The bell in the navbar shows unread notifications
  ("Riya Mehta mentioned you in PRC-101"), and clicking one opens the ticket and marks it read.
  The home page has a Mentions tab listing every ticket where you were mentioned.
- Every change writes a `ProcessEvent` row, which is the activity log.

## Registering real users

- `/register` asks for email, password and confirm password (at least 8 characters). The name is made from the email
  (`riya.mehta@acme.com` becomes Riya Mehta) and a manager can correct it. After signing up the person is signed in.
- Nobody can choose their own role. A new account has no role or client, so it sees nothing and shows a
  "waiting for access" page. Managers open **People** in the top bar (a badge shows how many are waiting), pick a role
  (and a client for client users), and click Save. The person clicks **Check again** or signs in again.
- **The first account created on an empty database becomes the manager.** Start with `SEED_DEMO=false`, register
  your own account first, then invite everyone else. On a database that already has the demo users, the first real manager
  must be set up by an existing manager (demo manager: riya@flowdesk.test), then delete the demo users.
- Registration is limited to 10 attempts per visitor every 15 minutes. Emails are **not verified** (no mail server is set up),
  so a person can register with an address they do not own, but they still see nothing until a manager approves them.
  Check that the email is the right person before choosing a role. Add email verification before opening this to the public.

## Image attachments

- When creating a process, add images with **Add image**, by pasting a screenshot into the description, or by dragging files onto it.
  On an existing ticket use **Add image**, or paste a screenshot anywhere on the page. Click a thumbnail to view it full size.
- PNG, JPEG, GIF and WebP only, up to 8 MB each and 10 per process. The file type is checked from the file's bytes, and SVG is refused.
- Images are stored in Postgres (`Attachment` table), so the normal database backup covers them. Opening an image follows the same
  rules as the process itself: a user who cannot see the process gets 404. Images uploaded for a ticket that was never created are deleted after 24 hours.
- Run `docker compose up --build` after updating. The new table is created on start (`prisma db push`), and nginx now allows 10 MB request bodies.
- **Comments** take images too: **Add image** next to Send, paste a screenshot into the comment box, or drop files on it
  (up to 5 per comment; a comment can be only images). They show inside the comment in the Activity list, and the person who
  added one, or a manager, can remove it. Comment images are kept separate from the ticket's own gallery.
- If you later store a lot of images, move them to object storage (S3 or similar) and keep only the file key in the table.

## Before real data

- Move the JWT from localStorage to an httpOnly cookie, add login rate limiting, and use a strong `JWT_SECRET`.
- Switch from `prisma db push` to committed migrations (`prisma migrate dev`, then `prisma migrate deploy` in the container).
- Remove the demo users and run with `SEED_DEMO=false`.
