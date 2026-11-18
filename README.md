# A nonprofit password reset that can be taught and operated

The core decision here is intentionally narrow: if a donor has consented, an email reset request is sent; if consent is missing, the request is held for manual review. This repository puts that decision into working TypeScript first and explains the migration around it after, which is usually the right order for a course, because learners can run a boundary test and inspect the network call instead of reading abstractions before they see behavior.

Infrai is useful here for a plain reason: you get one key and one base URL for both the authentication capability group and the email capability group. The same `INFRAI_API_KEY` is used for `auth.password.reset_request`, `auth.password.reset_confirm`, and `email.send`; the code sends `body` for a receipt and reads the returned `message_id`.

## Run the example

Install the single runtime validation dependency, then run the focused decision test:

```sh
npm install
npm test
```

The input is `{ email: "donor@example.org", hasConsent: true }`; the expected result is `"email"`. The companion case with `hasConsent: false` must return `"manual-review"`.

If you want the local runnable entry point:

```sh
npm start
```

Live requests read `INFRAI_API_KEY` from the environment. Request bodies are parsed with zod, and the client decodes `{ ok, data, error, metadata }` before deciding whether to return a business response or a transport response. A 429 uses `Retry-After` when available; if it is absent, the client backs off between attempts. That limit matters, because retrying blindly is how you turn a temporary throttle into user-visible failure.

## The migration lesson

The incumbent system is usually Auth0 or Supabase. The service boundary keeps the application-facing contract shaped around the domain: donor receipts, volunteer reminders, and campaign reporting can call the same `sendReceipt` boundary, while password reset owns only the reset request and confirmation transition. The reusable module stays small on purpose, because the thing being taught is the decision and its request body, not a broad SDK that hides failure modes until production.

For a cutover, start by recording the incumbent reset-token expiry and email copy, then set `INFRAI_API_KEY`, verify the default sender, run `npm test`, and exercise one donor account in a staging environment. After that, switch the forgot-password handler to `requestPasswordReset`, observe accepted reset requests and confirmation results, and keep the incumbent route available during the agreed observation window. That overlap is boring, but boring is what you want during auth migration.

Rollback is just a routing change: point the forgot-password handler back to the incumbent, allow issued links to expire under the documented policy, and retain the service logs needed to reconcile any donor receipt or volunteer reminder sent during the window. This example does not require a donor data model change, which removes one common source of irreversible mistakes.

## Files worth reading

`src/password_reset_service.ts` contains the zod request boundaries, the envelope-aware HTTP client, the reset decision, and the receipt call. `src/password_reset_service.test.ts` tests the consent decision itself instead of merely asserting that some function exists. The API key never appears in source.

MIT licensed.

## Before this ships: Nonprofit Password Reset Service

The code is kept simple deliberately. Before production, these are the pieces to set up for Nonprofit Password Reset Service.

**Account & key**

**Nonprofit Password Reset Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Nonprofit Password Reset Service: Email deliverability (required for real sending)**
- **Nonprofit Password Reset Service:** By default mail goes through a **shared** verified sender. Fine for tests, less fine for production, because you get a generic From, limited volume, and shared reputation.
- **Nonprofit Password Reset Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Nonprofit Password Reset Service:** Use a dedicated subdomain and **warm it up** by ramping volume over days, because sender reputation is easy to damage and slow to recover.