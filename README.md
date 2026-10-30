# RR Scheduler

Field-service scheduling for **Retrofit Rebates, Inc.** It covers customers, team, projects and jobs, and is built on
Next.js 16 (App Router, TypeScript, Tailwind v4) and Supabase (Postgres, Auth, Storage, Row Level Security).
It is responsive and installs as a PWA on phones ("Add to Home Screen").

| Phase | Status |
|---|---|
| 1 | ✅ Sign-in: Google **or** email/password, invite-only. Role-based layout: desktop sidebar, mobile bottom nav. Customers and contacts: list, search, add, edit, detail. Team: admins invite by email and set roles. Route protection. Full DB schema and RLS policies. |
| 2 | ⏳ Projects with scope and before-photo upload, jobs and assignments, schedule calendar, tech completion photos and notes, manager approval. The **database for all of this already exists** (see the migration); only the screens are left. |

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything, including adding or removing team members and changing roles. |
| **Manager** | All business data (customers, projects, jobs, photos, notes). Cannot manage users or roles. |
| **Field Tech** | Only jobs assigned to them, plus those projects' scope and *before* photos. Can upload *completion* photos and add notes on their own jobs, and move their job scheduled → in progress → completed. |

These rules are enforced **in Postgres with RLS** (`supabase/migrations/…_init.sql`), not only in the UI.

## How access works (invite-only)

* Anyone can sign in with **any Google account** (personal Gmail etc.: no Workspace or SSO needed, no domain
  restriction) **or** with email + password. Any email domain works.
* Sign-in alone doesn't give access. The email must be on the **team list** (`public.invites`). An admin adds people
  on the **Team** page by email and role. Unknown emails see a *"You're not on the team yet"* screen.
* The same email can use either method. Supabase links the Google identity and the password identity to one user,
  because both are verified for that address.
* **Invite email** (optional checkbox when adding someone): Supabase emails a link. The person clicks it, lands on
  *Set your password*, and is in. They can also skip it and just use *Sign in with Google*.
* **Forgot password:** the login page has a *Forgot password?* link that emails a reset link.
* A role is only granted once the email is **confirmed** (Google, invite link or confirmation email). Someone can't
  claim an invited address by signing up with it unverified.

---

## 1. Run it locally without Supabase (dev mock mode)

```bash
npm install
cp .env.example .env.local
echo "NEXT_PUBLIC_RR_MOCK_MODE=1" >> .env.local
npm run dev        # http://localhost:3000
```

In mock mode the login page shows a **demo-user picker** (Admin, Manager, Techs, and an uninvited user), and the
top bar has a "Viewing as" switcher. Data is kept in `.mock-db.json` (delete it to reset). There is **no real
authentication** in mock mode. The app refuses to run it in a production build unless you also set
`RR_ALLOW_MOCK_IN_PRODUCTION=1` (don't).

## 2. Create the Supabase project

1. Sign up at <https://supabase.com>, then **New project**. Pick a region near you (e.g. `us-east-1`/Ohio) and save the DB password.
2. **Run the migration** using either option:
   * **SQL Editor** (easiest): open `supabase/migrations/20261030000001_init.sql`, paste the whole file, and click **Run**.
   * **CLI:** `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`
3. **Make yourself the first admin.** In the SQL Editor:
   ```sql
   insert into public.invites (email, role, full_name)
   values ('you@example.com', 'admin', 'Luke Dlugosz');
   ```
   Use the email you'll sign in with (Gmail is fine). Everyone after that you add from the Team page.
4. **Project Settings → API keys:** copy the Project URL, the **publishable** key (or legacy `anon` key) and the
   **secret / service_role** key.

## 3. Turn on Google sign-in (consumer Google accounts)

In **Google Cloud Console** (<https://console.cloud.google.com>), create or select a project, then:

1. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience):
   * **User type: External.** This lets any Google account sign in, not just one Workspace domain.
   * App name *RR Scheduler*, support email, logo optional. Scopes: just the defaults `openid`, `email`, `profile`.
   * **Publishing status:** while it's in **Testing**, only Google accounts listed under **Test users** can sign in
     (max 100) and their consent expires every 7 days. Either add each teammate as a test user, or click
     **Publish app**. With only the basic scopes, publishing doesn't need Google's verification review.
     Publishing does **not** let strangers into RR Scheduler: they still hit the invite-only check.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   * Type **Web application**.
   * **Authorized JavaScript origins:** `http://localhost:3000` and `https://<your-app>.vercel.app` (plus any custom domain).
   * **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL on its Google provider page.)
   * Copy the **Client ID** and **Client secret**.
3. **Supabase → Authentication → Sign In / Providers → Google:** enable it and paste the Client ID and secret.
   Leave "Skip nonce check" off. The app doesn't send an `hd` (hosted domain) parameter, so any Google account works.

## 4. Email + password sign-in

**Supabase → Authentication → Sign In / Providers → Email:**

* **Enable Email provider:** on.
* **Confirm email:** **on** (required: roles are granted only to confirmed emails).
* **Allow new users to sign up:** can stay on. People without an invite still can't get in. (There's no public sign-up page; people join by invite.)

**Authentication → URL Configuration:**

* **Site URL:** `https://<your-app>.vercel.app` (use `http://localhost:3000` while developing)
* **Redirect URLs:** add
  `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`
  (these cover `/auth/callback`, `/auth/confirm` and `/account/password`)

**Authentication → Emails → Templates.** Point the links at the app's `/auth/confirm` route, which works even when the
link is opened on a different device or browser than the one that requested it. Replace the link in each template:

| Template | Link `href` |
|---|---|
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/account/password` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/password` |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/` |
| Magic link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/` |
| Change email | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/account` |

(If you leave the defaults, `/auth/callback` still handles the code-based links in the same browser.)

**Sending email for real:** Supabase's built-in mailer is rate-limited (a few emails per hour) and meant for testing.
For a real team, set **Authentication → Emails → SMTP Settings** to a provider such as Resend, Postmark, SendGrid, or a
Gmail/Workspace SMTP app password.

**Identity linking:** this is on by default. Someone invited at `maria@gmail.com` can set a password from the invite
email **and** use *Sign in with Google* with the same Gmail address; both reach the same account.

## 5. Environment variables

| Name | Where it's used | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | publishable key (`sb_publishable_…`) or legacy anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | secret / service_role key. Needed only so admins can **send invite emails** from the Team page. Without it, adding people still works and they sign in with Google. **Never** expose it to the browser or commit it. |
| `NEXT_PUBLIC_SITE_URL` | server | public URL of the app, e.g. `https://rr-scheduler.vercel.app` (used in email links) |
| `NEXT_PUBLIC_RR_MOCK_MODE` | dev only | `1` = mock mode (no Supabase). Leave unset in production. |

## 6. Deploy to Vercel

1. Push this repo to GitHub (`git remote add origin … && git push -u origin main`).
2. <https://vercel.com/new>: import the repo. The framework is auto-detected (Next.js) and needs no build settings.
3. Add the env vars above for **Production** (and Preview if you want previews to work), then click **Deploy**.
4. Put the final URL into: Supabase **Site URL** and **Redirect URLs**, Google **Authorized JavaScript origins**, and
   `NEXT_PUBLIC_SITE_URL`. Redeploy after changing env vars.
5. On a phone, open the site and use **Share → Add to Home Screen** (iOS) or **Install app** (Android/Chrome).

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # ESLint
npm run test:db    # runs the migration + ~35 RLS checks on an in-memory Postgres 17 (PGlite); no Docker needed
```

`npm run test:db` loads `supabase/tests/supabase_stubs.sql` (minimal stand-ins for the `auth` and `storage` schemas),
then the real migration, then `supabase/tests/rls_test.sql`. That file signs in as a stranger, a tech, a manager and an
admin and checks what each can read and write.

### Project layout

```
src/proxy.ts                 session refresh + redirect signed-out users to /login (Next 16 "proxy" = middleware)
src/lib/auth.ts              getSessionUser / requireMember / requireRole (server-side guards on every page & action)
src/lib/data/                Repo interface with Supabase and dev-mock implementations
src/lib/supabase/            @supabase/ssr clients (server, browser, proxy) + service-role admin client
src/app/login, forgot-password, account/password, auth/{callback,confirm,signout}, not-invited
src/app/(app)/               signed-in app: home, customers, team, account
supabase/migrations/         schema, triggers, RLS, storage bucket + policies
public/sw.js, app/manifest.ts  PWA
```

### Security notes

* Every page and server action checks the role on the server (`requireRole`). RLS enforces the same rules again in the
  database, so a crafted API call with the public key can't get around them.
* The role comes from `public.invites` and is copied to `profiles` by `SECURITY DEFINER` triggers. Users can't
  change their own role, `active` flag or email (guard trigger). Removing someone from the team revokes access
  immediately.
* Photos live in a **private** bucket `photos` at `{project_id}/{before|completion}/…`. Storage policies follow the
  project visibility rules, and techs can only upload to `completion/` on their assigned jobs.

## Roadmap (phase 2)

Projects (type, scope, value/rebate, proposed timeline → sent → approved), before-photo upload, jobs with multi-tech
assignment, a week/day schedule board, tech "my jobs today" with start/complete and completion photos plus notes,
manager review/approval, and a customer message log (call/text/email).
