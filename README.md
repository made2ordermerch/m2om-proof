# M2OM Proofing Portal

Design review and approvals for Made 2 Order Merch. Replaces email back-and-forth: clients review proofs, pin comments directly on the artwork, request edits, and give a liability-shifting final approval. Mobile and desktop.

Live at: proof.made2ordermerch.com

## Stack

- Next.js 14 (app router), deployed on Vercel
- Shared Neon Postgres (delicate-snow), all tables prefixed `proof_` (additive, no changes to existing tables)
- Vercel Blob for proof images and mockup videos (unguessable random URLs, only surfaced inside authenticated sessions)
- Gmail API via the existing Google Cloud service account with domain-wide delegation, sending as design@made2ordermerch.com

## One-time setup

1. **Database.** Run `db/schema.sql` against the Neon delicate-snow database (Neon SQL editor works).

2. **Vercel project.** Create a new project from this repo. Framework preset: Next.js. Nothing custom.

3. **Blob store.** In the Vercel project, Storage tab, create a Blob store and attach it. `BLOB_READ_WRITE_TOKEN` is added automatically.

4. **Environment variables** (Project Settings, Environment Variables):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection string (same one the funnels use) |
| `GOOGLE_SA_KEY` | The service account JSON on one line. Keep the literal `\n` escapes in `private_key`. Do NOT mark Sensitive. |
| `ADMIN_PASSWORD` | Internal login password |
| `AUTH_SECRET` | Any long random string (signs the admin cookie) |
| `ADMIN_EMAIL` | Your email. Internal notifications go here plus design@. |
| `BASE_URL` | `https://proof.made2ordermerch.com` |
| `HUB_SECRET` | Optional. Shared secret for the FD99 hub link endpoint. |

5. **Domain.** Add `proof.made2ordermerch.com` in Vercel, then in Shopify admin (where DNS lives) add a CNAME record: `proof` -> `cname.vercel-dns.com`.

6. **Gmail scope.** The service account already has domain-wide delegation. Confirm the `https://www.googleapis.com/auth/gmail.send` scope is authorized for it in Google Workspace admin (it is if the funnel emails send). This app impersonates design@made2ordermerch.com.

## Daily workflow

1. `/admin` (log in with `ADMIN_PASSWORD`). Create a project: client name, email, optional Shopify order number (the $99 design deposit draft order) and lead ID. Check "Email the portal link" to invite them immediately.
2. Add SKUs: size + product type + flavor/variant. Add more at any time.
3. Upload a proof (JPG/PNG). It auto-tags v1, v2, v3, sets the SKU to PROOF READY, and emails the client (toggleable per project).
4. Client reviews in the portal: BROWSE mode to zoom and read, PIN A COMMENT mode to tap a spot and drop a numbered pin, DRAW for freehand markup. General comments live below each design.
5. Client hits REQUEST EDITS (notifies you + design@) or APPROVE FOR PRINT (typed full name + liability statement, version locks, automated finalization email sends with the 4-business-hour flag window, you are notified).
6. When files actually go out, flip the SKU status to IN PRODUCTION manually.

Internal comments: check "Internal only" when commenting in admin. Clients never see them (dashed border style in admin).

Magic links expire after 30 days. Clients self-serve fresh links from the portal home page; you can also mint and email one from the project page.

## FD99 hub integration (optional)

`GET /api/hub/portal-link?shopify_order_id=XXXX&secret=HUB_SECRET` returns `{ link }` with a fresh 30-day portal link for the project mapped to that order. Call it server-side from the hub and render a "REVIEW YOUR DESIGNS" button.

## Built for what comes next (reorder path)

Approved versions store the locked artwork file, the SKU spec (size, product type, variant), and the approval record (typed name, timestamp, statement, IP). The future reorder flow queries `proof_skus` where `status IN ('approved','in_production')` joined to `proof_versions` via `approved_version_id`. No schema changes needed.

Reply-to-thread email ingestion is deliberately structured for v2: every outbound email carries the `[PRJ-####]` reference in the subject, so a polling job on the design@ inbox can match replies to projects later without rework. For v1, stray replies land in design@ as they do today.

## Local dev

```
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

Note: client-side Blob uploads require the deployed environment or a `BLOB_READ_WRITE_TOKEN` from an attached store.
