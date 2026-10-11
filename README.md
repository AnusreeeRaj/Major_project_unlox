# Unfazed — Therapist Practice Management

A runnable web-development major project based on the supplied Unfazed brief. Includes a React frontend, a Node/Express API, Mongoose models, Socket.IO messaging, and configurable integrations.

## Two ways to explore

**Hosted demo:** a private frontend demonstration with fictional clients. Uses an in-memory browser adapter, resets on refresh, simulates payments, and supports switching between therapist and client roles. It is not a live clinical service. The demo intentionally does not connect to MongoDB or send notifications. All seeded data is fictional.

**Full-stack source:** the same interface connected to Express, JWT authentication, real API-level authorization, Socket.IO, and MongoDB. The backend also has an explicit in-memory development mode so you can run it without configuring a database first.

## Fastest local run (no database or gateway credentials)

Install Node.js 20.19+ or 22+ and unzip the project. Open a terminal in the `unfazed` folder:

```sh
npm ci
npm run demo:backend
```

In a second terminal in the same folder:

```sh
npm run demo:frontend
```

Visit `http://localhost:5173`. This runs the real Express backend and Socket.IO, with in-memory records and simulated payments. It is different from the browser-only hosted preview. Backend data resets when the server restarts, while frontend refresh simply requires signing in again.

Demo therapist:

- Email: `mira@example.com`
- Password: `UnfazedDemo2026!`

Demo client:

- Open `http://localhost:5173/dr-mira-sharma`, choose a future slot, then choose Returning client.
- Email: `client1@example.com`
- Password: `UnfazedDemo2026!`

Use separate browsers for a therapist and client to test real-time messaging. The backend must remain running. These credentials exist only when demo seeding is enabled.

## MongoDB-backed run

1. Copy `unfazed-backend/.env.example` to `unfazed-backend/.env`.
2. Set `MONGO_URI` to a MongoDB Atlas connection string or local replica set. **Transactions require a replica set; a standalone MongoDB server is not supported for booking writes.**
3. Generate a JWT secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste it into `JWT_SECRET`.
4. Set `FRONTEND_ORIGIN=http://localhost:5173` and `PAYMENT_MODE=demo` initially.
5. Leave `DEMO_MODE=false` for an empty practice. Set it to `true` only if you want fictional seed accounts and demo subscription changes.
6. Copy `unfazed-frontend/.env.example` to `unfazed-frontend/.env`; keep `VITE_DEMO_MODE=false`.
7. From the parent folder:

```sh
npm ci
npm start
```

In a second terminal:

```sh
npm run dev
```

Open the frontend and create a therapist account. Starter plan configuration is seeded automatically. All monetary amounts are stored as integer paise. Feature flags and limits are stored in `SubscriptionTierConfig`, initially seeded from `unfazed-backend/src/config/plans.js`. Edit existing plan records in MongoDB to change configuration after seeding.

## Guided demonstration

1. Open the dashboard; inspect today's appointments and clients.
2. Open Settings to edit the therapist profile and unique branded link.
3. Set Availability: weekly hours, 30/45/60/90-minute sessions, buffers and date overrides.
4. Use the branded profile to complete client intake and record consent. Alternatively, add a client from CRM and copy their one-time invitation link. The email must match when claiming the invitation. Copy the link before dismissing it.
5. Book a future slot. A booked slot disappears from availability. Concurrent requests for the same slot are rejected.
6. Open Session notes. Create a private note and a shared note; switch to the client account to confirm only the shared note appears.
7. Pay for a session or a 3/6/12-session package. Download the receipt PDF, then book using a package credit. A cancelled package session returns one credit; expired packages remain unusable.
8. Send a message. In full-stack mode, the recipient receives it through an authenticated Socket.IO room.
9. Open Analytics. In MongoDB mode, revenue, active clients and no-show rate are calculated using aggregation pipelines.
10. In demo mode, switch to Starter under Manage plan. Client cap, structured notes, packages and analytics are gated through the centralized entitlement service.

## Requirements covered

| Module                      | Implementation                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation               | React/Vite + Express/Mongoose; bcrypt/JWT signup and login; unique editable profile slug; public profile and basic metadata                       |
| 2. Scheduling               | Weekly hours, date overrides, blocked timestamps at API level, durations, buffers, timezone-aware slots, atomic conflict prevention, cancellation |
| 3. CRM & intake             | Searchable/filterable/sortable client table; client session/payment/note history; adult intake and timestamped consent; one-time invitations      |
| 4. Payments & packages      | Isolated Razorpay service, signed captured-payment webhook, idempotent settlement, package credits and expiry, PDF receipts                       |
| 5. Documentation            | Private/shared authorization enforced by API; basic rich text; SOAP and DAP templates; safe rendering of note markup                              |
| 6. Communication            | JWT-authenticated Socket.IO rooms and persisted messages; booking/payment/follow-up events; deduplicated 24-hour reminder queue                   |
| 7. Entitlements & analytics | Configured tiers and money values; single entitlement service; upgrade prompt; server analytics and MongoDB aggregation                           |

Stretch features such as a drag-and-drop intake builder, waitlist, typing indicators and read receipts are not included. The brief's file-storage integration is not activated because no file-upload workflow is part of the seven core module deliverables.

## Razorpay test-mode configuration

Configure the backend environment:

```dotenv
PAYMENT_MODE=razorpay
RAZORPAY_KEY_ID=your_test_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

Configure a Razorpay webhook to `https://YOUR_API_HOST/api/payments/webhook` for `payment.captured`. The body signature is verified before processing. A successful browser checkout callback never directly marks a payment paid; the signed webhook does. The frontend retrieves the public checkout key with the order; the secret remains server-side. Do not put secrets in `VITE_` variables.

Razorpay is implemented but was not exercised against a live test account in this build. Cancellation of a cash-paid session queues a refund-review notification; it does not automatically issue a gateway refund. Cancelling before a capture, or receiving a second capture for the same session, is rejected for manual refund review. Do not collect real money until operational refund handling is added.

Receipts use a GST-style layout and configured tax component, but are deliberately labelled **payment receipts**, not statutory GST tax invoices. Set provider registration details and appropriate tax treatment before issuing compliant invoices for a real practice. Prices/tax rates in the sample configuration are illustrative.

## Project structure

```text
unfazed/
  shared/fixtures.js                 # Fictional test/demo records
  unfazed-backend/
    server.js                       # HTTP + Socket.IO + reminder scheduler
    src/app.js                      # Validated API routes and role restrictions
    src/config/db.js                # Mongo and in-memory repositories
    src/config/plans.js             # Initial plan/money configuration
    src/models/index.js             # Mongoose schemas and indexes
    src/middleware/authMiddleware.js
    src/services/                   # Entitlements, scheduling, payments, analytics, notifications
    src/sockets/chatSocket.js
    src/seed.js
    test/workflows.test.js
  unfazed-frontend/
    src/main.jsx                    # Dashboard, public booking and client portal
    src/api/client.js               # Axios + authentication + receipt downloads
    src/api/demo.js                 # Explicit fictional browser demo adapter
    src/styles.css
    public/favicon.svg
    vite.config.js
  scripts/                          # Local demo, DOM checks and source packaging
```

The code is organized by services and UI components rather than creating one file per placeholder in the PDF. `app.js` keeps the route declarations together for easier review. Notes render a narrow allow-list of markup without copying arbitrary attributes; pasted editor content is plain text. Auth tokens are held in memory, so a page reload requires sign-in in connected mode.

## Checks

```sh
npm test
npm run test:ui
npm run build
```

The API suite covers authentication, cross-client privacy, atomic bookings, intake consent, plan enforcement, payments, PDF generation, webhook signatures/idempotency, availability, authenticated chat, reminders, invitations and package-cancellation credit recovery.

UI checks run in JSDOM and exercise dashboard navigation, CRM, notes, analytics, messaging, therapist booking and client booking. They also exercise WebMCP registration and valid/invalid navigation in a mocked registry. They are not visual browser QA or validation against a real WebMCP host. Rich-text editing commands and the external Razorpay popup need a real browser for manual verification.

A MongoDB server and Razorpay credentials were unavailable during implementation. API tests use the transactional in-memory repository; MongoDB-specific transactions and aggregation pipelines require a separate integration run with Atlas/a replica set before deployment with real data. No clinical data should be used in the hosted demonstration.

## Hosting the full stack

- Build the frontend with `VITE_DEMO_MODE=false` and `VITE_API_BASE_URL=https://YOUR_API_HOST/api`. `npm run build` outputs the static frontend to `dist/`.
- Configure the frontend host to rewrite unknown paths to `index.html` for branded profile links.
- Host the Node API on a service that supports long-running Node.js and WebSockets, start command `npm start -w unfazed-backend`, with MongoDB Atlas and the environment variables above.
- Set `FRONTEND_ORIGIN` to the exact frontend origin and serve both over HTTPS.
- The private Sites preview hosts only the browser demonstration. It does not host Express, MongoDB or Socket.IO.
- Persist secrets in the host's secret store; never commit `.env` files.

This is an educational implementation, not a production clinical system. Subscription checkout, email/WhatsApp delivery, video meetings, account recovery and production clinical-data operations are not connected. The notification service stores stub queue entries instead of sending messages.

## Submission

Create a GitHub repository and upload this source folder without `node_modules`, `.env`, or generated `dist` files. Include the README, lockfile, tests and both application folders. Use that repository link for your course submission. Do not submit the private demo link as a substitute for the source repository.
