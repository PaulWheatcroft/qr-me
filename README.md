# QR Token Gift 🎁

A tiny two-token birthday gift flow. Send your nephew two paper QR tokens. He scans
one, the page says "scan the other token". He scans the second, the page says the
tokens will be transferred (please wait 24 hours). You get emailed on each scan, and
once you've done the real transfer you flip a status flag so the page shows "all done".

- **Frontend:** one static `web/index.html` page (no build step) hosted on Vercel.
- **Backend:** Supabase Postgres + a single `scan` Edge Function.
- **Notifications:** email via [Resend](https://resend.com).

## How it works

```
QR token (?t=secret)  ->  web/index.html  ->  Supabase Edge Function "scan"
                                                  |  records scan + emails you
                                                  v
                                          returns one of:
   already_scanned | first | both | transferred
```

State logic (computed server-side):

| Situation | State | Page message |
| --- | --- | --- |
| Repeat scan of a token, other still unscanned | `already_scanned` | "You already scanned this token. Scan the other one." |
| First scan of a token, other still unscanned | `first` | "Now scan the other token…" |
| Both tokens scanned, status `pending` | `both` | "Your tokens will be transferred. Please wait 24 hours to complete." |
| You set status `transferred` | `transferred` | "Your tokens have been transferred. Enjoy!" |

Notifications fire only on the **first** scan of each token (so a page refresh doesn't
spam you). The second token's email doubles as the "both scanned" alert.

## Project layout

```
supabase/migrations/0001_init.sql   tables, RLS, seed data + token secrets
supabase/functions/scan/index.ts    the Edge Function
web/index.html                      the scan page
vercel.json                         static deploy config
scripts/generate-qr.mjs             makes the two printable QR PNGs
```

## Setup

The Supabase project (`zvebvvqywwhflbbrgzkf`) already has the migration applied and the
`scan` function deployed. To finish:

### 1. Set the Edge Function secrets

In the Supabase dashboard: **Project Settings -> Edge Functions -> Secrets** (or via CLI),
add:

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | Your Resend API key |
| `NOTIFY_EMAIL` | The email address that should receive scan alerts |
| `NOTIFY_FROM` | *(optional)* defaults to `onboarding@resend.dev` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

> Resend's `onboarding@resend.dev` sender works without domain verification as long as
> `NOTIFY_EMAIL` is the email on your Resend account. To send anywhere else, verify a
> domain in Resend and set `NOTIFY_FROM` to an address on it.

CLI alternative:

```bash
supabase secrets set RESEND_API_KEY=re_xxx NOTIFY_EMAIL=you@example.com --project-ref zvebvvqywwhflbbrgzkf
```

### 2. Deploy the page to Vercel

```bash
npm i -g vercel   # if needed
vercel            # from the repo root; accept defaults
vercel --prod
```

`vercel.json` serves the `web/` folder as a static site.

### 3. Generate the QR codes

```bash
npm install
node scripts/generate-qr.mjs https://your-app.vercel.app
```

This writes `qr/token-A.png` and `qr/token-B.png`. Print them and send the two paper
tokens.

## The manual transfer step

When you've completed the real-world transfer:

1. Open the Supabase **Table editor -> `gift`**.
2. Set `status` to `transferred` (the only row, `id = 1`).

Next time your nephew opens either token link, the page shows the "transferred" message.

To **reset and reuse**, set each `tokens.scanned_at` back to `null` and `gift.status`
back to `pending`.

## Notes

- The two token secrets live in `0001_init.sql` and `scripts/generate-qr.mjs`. They're
  the only thing protecting the flow, so keep this repo private.
- The Edge Function has `verify_jwt` disabled because the recipient's browser has no
  Supabase session; the secret token is the auth.
- RLS is enabled with no public policies, so the tables are only reachable through the
  Edge Function (service role).
