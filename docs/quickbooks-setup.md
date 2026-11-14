# QuickBooks Online setup (sandbox first)

RR Scheduler can create **draft** invoices in QuickBooks Online from a service request.
Invoices are created with `EmailStatus = NotSet` and RR Scheduler never calls QuickBooks' send
endpoint, so **nothing is emailed to a customer**. Only admins can connect/disconnect; admins and
managers can create, refresh, and void invoices. Techs and sales never see invoices or prices.

Until the env vars below are set, Settings → Integrations shows **Not configured** and the
Invoice card on a ticket says QuickBooks isn't set up. Nothing else changes.

## 1. Create the free Intuit developer account and app (about 10 minutes)

1. Go to <https://developer.intuit.com> → **Sign in** (or **Create an account**). A free account is enough.
   You can use the same Intuit login as your real QuickBooks, or a separate one.
2. Open **Dashboard → Create an app** (Workspaces → your workspace → **Create an app**).
   - Platform: **QuickBooks Online and Payments**.
   - App name: `RR Scheduler`.
   - Scope: tick **Accounting** only (`com.intuit.quickbooks.accounting`). Do not tick Payments.
3. Intuit creates a **sandbox company** for you automatically (Dashboard → **Sandbox**). That is
   the test company we connect first; your real books are not touched.

## 2. Get the sandbox (Development) keys and set the redirect URI

1. In the app, open **Keys & credentials** (Development / sandbox section).
2. Copy **Client ID** and **Client Secret** somewhere private (don't send them in chat).
3. Under **Redirect URIs** add exactly:
   `https://rr-scheduling-portal-grokv1.vercel.app/api/qbo/callback`
   and save.

## 3. Paste the env vars into Vercel yourself

Vercel → project **rr-scheduling-portal-grokv1** → **Settings → Environment Variables**,
environment **Production**, mark each as **Sensitive**:

| Name | Value |
| --- | --- |
| `QBO_CLIENT_ID` | Client ID from step 2 |
| `QBO_CLIENT_SECRET` | Client Secret from step 2 |
| `QBO_TOKEN_ENC_KEY` | A new random 32-byte key. Generate it on your computer with `openssl rand -base64 32` (or a password manager's 32-byte base64 generator). Keep a copy in your password manager; if it ever changes, an admin just reconnects. |
| `QBO_ENVIRONMENT` | `sandbox` (optional — sandbox is the default) |
| `QBO_REDIRECT_URI` | optional — defaults to `https://rr-scheduling-portal-grokv1.vercel.app/api/qbo/callback` |

`SUPABASE_SERVICE_ROLE_KEY` is already set and is reused to store the connection server-side.
Then **redeploy** (Deployments → latest → Redeploy) so the new variables load.

The database migration `supabase/migrations/20261114000828_quickbooks_invoices.sql` is applied
during go-live, before the app is deployed.

## 4. Connect and try it

1. Sign in as an admin → **Account → Settings** (or `/settings/integrations`) → **Connect QuickBooks**.
2. Intuit asks you to pick the **sandbox company** and click **Connect**. You land back on Settings
   with "Connected to …".
3. Pick defaults (Service call item — or "Create Service call item", Net 30, Non-taxable) → **Save defaults**.
4. Open a service request with a service price → **Create invoice** → check the customer match
   (or search / create the customer) → **Create draft in QuickBooks** → **Confirm**.
5. **Open in QuickBooks** shows the draft in the sandbox company. **Refresh status** pulls
   Sent / Paid / Overdue back. **Void** (with confirmation) voids it in QuickBooks.

## 5. Later: switch to your real QuickBooks company (production keys)

1. In the Intuit app, open **Get production keys** (Production → Keys & credentials). Intuit asks you to:
   - complete the app profile: host domain `rr-scheduling-portal-grokv1.vercel.app`,
     launch URL and disconnect URL `https://rr-scheduling-portal-grokv1.vercel.app/settings/integrations`,
     privacy policy `https://rr-scheduling-portal-grokv1.vercel.app/privacy`,
     and an end-user license (EULA) URL (we can add a simple `/terms` page first);
   - answer the **app assessment / compliance questionnaire** (internal app used only by your
     company, Accounting scope, tokens encrypted server-side). Review can take a few days.
2. Add the same redirect URI in the **Production** Keys & credentials.
3. In Vercel replace `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` with the production keys, set
   `QBO_ENVIRONMENT=production`, and redeploy.
4. An admin clicks **Connect QuickBooks** again and picks the real company. Sandbox links and
   invoices stay recorded but aren't used for the real company.

## How it's built (for reference)

- OAuth 2.0 authorization-code flow: `/api/qbo/connect` (admin only, CSRF `state` in an httpOnly
  cookie) → Intuit → `/api/qbo/callback` (state check, code exchange, realmId + tokens saved).
- Tokens live only in `public.qbo_connections` (RLS on, no client policies, client grants revoked),
  encrypted with AES-256-GCM using `QBO_TOKEN_ENC_KEY`, and are never sent to the browser.
  Access tokens (1 hour) refresh automatically; rotated refresh tokens are saved each time.
  Disconnect revokes the token at Intuit and deletes the row.
- Customer links: `public.qbo_customer_links` (portal customer → QuickBooks Customer Id per company).
  Creating a customer first checks for the same display name, so nothing is duplicated.
- Invoices: `public.service_request_invoices` (one non-voided invoice per ticket).
- API calls use `minorversion=75`, retry once after a 401 with a refreshed token, back off on
  429 rate limits, and show Intuit's error message in plain language.
- Local dev: with `NEXT_PUBLIC_RR_MOCK_MODE=1` and no `QBO_CLIENT_ID`, a local fake QuickBooks
  (`src/lib/qbo/fake.ts`) is used; set `RR_QBO_FAKE=0` to see the Not configured state.
