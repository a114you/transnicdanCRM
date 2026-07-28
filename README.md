# Montatorul CRM

Next.js CRM for an auto service workflow: clients, cars, repair orders, warehouse, mechanics, reports, PDF/Excel acts.

## Development

```bash
npm run dev
```

Local app: `http://localhost:3000`

Required environment variables in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AUTH_SECRET=...
```

`AUTH_SECRET` must be private and at least 32 characters. `SUPABASE_SERVICE_ROLE_KEY` must never be exposed with a `NEXT_PUBLIC_` prefix.

Copy `.env.example` to `.env.local` for local development.

## Deployment

Detailed production deployment instructions for Supabase, Vercel, GitHub, and `montatorul.eu` are in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Structure

- `app/` - Next.js routes and API routes.
- `components/ui/` - low-level UI primitives.
- `components/layout/` - shell, header, providers, global search, PWA/theme helpers.
- `components/fields/` - reusable rich inputs.
- `components/dashboard/` - dashboard-specific components.
- `lib/` - domain logic, auth/session, database access, reports, translations, types.
- `database/` - Supabase SQL setup and security scripts.

## Security Notes

Operational database access is protected by CRM session checks and the `/api/db` server bridge. Browser-side code must not query Supabase tables directly. Supabase RLS lockdown lives in `database/003_security_lockdown.sql`.
