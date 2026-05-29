# Coupon Redemption Service — Take-Home Task

## Background

We run an e-commerce platform. The marketing team creates discount coupons and shares coupon codes with users. When a user is placing an order, they can apply a coupon code to get a discount on the order total. Your job is to build the backend service that manages this.

This service sits between the frontend (which collects the coupon code from the user) and the order service (which processes the payment). It is not responsible for orders or payments — only for coupons and redemptions.

---

## Users and Orders

**Users** are identified by a user ID passed in the request header (`x-user-id`). You do not manage users. There is no user signup, login, or auth in this service. Treat the user ID as an opaque string that uniquely identifies who is making the request.

**Orders** are identified by an order ID passed in the request body. You do not manage orders either. The order service owns orders. When a user applies a coupon, they tell you which order they are applying it to. You store that order ID on the redemption record so it can be traced back later.

---

## What a coupon is

A coupon has a code (like `WELCOME10` or `FLAT100`) that users enter to claim a discount. When an admin creates a coupon, they configure what kind of discount it gives, how long it is valid for, how many times it can be used in total, and how many times a single user can use it.

An admin can also update a coupon's status at any time — for example, disabling a coupon that is still within its validity period if the campaign ends early, or re-enabling one that was paused.

You will need to figure out what fields make sense, what validations are needed, and how to store this. If anything is unclear, capture it as a question in your SRS.

---

## What a redemption is

When a user successfully applies a coupon to an order, that's a redemption. You need to record that it happened — who redeemed it, against which order, and what discount was applied.

If an order is later cancelled, the redemption should be reverted. This gives back the coupon use so someone else can claim it.

---

## Endpoints to build

| Method | Path | Who calls it | Purpose |
|---|---|---|---|
| `POST` | `/coupons` | Admin | Create a new coupon |
| `GET` | `/coupons/:code` | Anyone | Fetch details of a coupon by its code |
| `PATCH` | `/coupons/:code` | Admin | Update a coupon (e.g. enable or disable it) |
| `POST` | `/redeem` | User (via frontend) | Apply a coupon to an order |
| `POST` | `/redemptions/:id/revert` | Internal / order service | Revert a redemption when an order is cancelled |

---

## Setup

**Prerequisites:** Node.js ≥ 18, Docker with Compose

**1. Start MongoDB**
```bash
cd skeleton
docker compose up -d
```
Wait ~20 seconds for the replica set to initialise. Confirm with `docker compose ps` — status should show `healthy`.

**2. Copy env file**
```bash
cp .env.example .env
```

**3. Install dependencies**
```bash
npm install
```

**4. Start the dev server**
```bash
npm run dev
```

**5. Confirm it's up**
```bash
curl http://localhost:3000/health
# → {"ok":true}
```

---

## Process and Milestones

Follow this process strictly. Do not jump ahead.

### Milestone 1 — Briefing
**Duration: 10 minutes (scheduled session)**

A short session where the task is handed over, you ask clarifying questions about the process (not the solution), and we align on expectations. This is the only time I will explain the task verbally.

---

### Milestone 2 — SRS (Software Requirements Specification)
**Target: 4–6 hours of focused work | Deadline: 4hrs**

Write `docs/srs`. This document must cover:

- All use cases — what each endpoint does, who calls it, what they expect back
- All business rules you can identify (expiry, usage limits, discount types, etc.)
- Every failure mode, edge case, and race condition you can think of — for each one, describe what happens and what the correct behaviour should be
- All assumptions you are making — be explicit about them
- All questions you still have after your own research

**Rules during SRS phase:**
- Do not ask me questions directly. Everything goes into the SRS.
- Do not write any implementation code until the SRS is approved.
- When your draft is ready, inform me and schedule a review meeting (30 minutes).
- I will respond to your questions and assumptions in writing. I will not help you discover edge cases — that is your job.
- Revise and resubmit based on feedback. Every iteration must be logged with a version number and date at the top of the document.
- The SRS is approved only when I explicitly say so in writing.

---

### Milestone 3 — TSD (Technical Solution Document)
**Target: 4–6 hours | Deadline: 6hrs**

Write `docs/tsd`. This document must cover:

- MongoDB schema for every collection — every field, its type, and why it exists
- All indexes — which fields, why, and what query each index serves
- Complete end-to-end flow for the endpoints — from HTTP request received to HTTP response sent, every step documented, including what happens at each DB operation, what happens on failure, and how race conditions are prevented
- Decision log — for every significant design choice (especially around concurrency and atomicity), document what you chose and why you rejected the alternatives

**Rules during TSD phase:**
- Same process as SRS — all questions go in the document, not to me directly.
- No implementation code until TSD is approved.
- Submit, schedule review, iterate, log each version.

---

### Milestone 4 — Implementation
**Target: 2 days | Start only after SRS and TSD are both approved**

Implement all five endpoints in Node.js + MongoDB using the provided skeleton.

You must follow the **Reliability-First Development** approach during implementation. Read the process document before you start coding:
**[Module 4: Reliability-First Development and Block-Level Testing](https://docs.google.com/document/d/1nyx536RZfvM0VEmc--V0yZct2yTbNKaDwg1WwxQdxQc)**

The core principle: build one small block, test it thoroughly and try to break it, stabilize it, then move to the next block. Do not build everything and test at the end.

To track this, maintain a **block tracking sheet** (Excel or Google Sheet) with the following columns for every block you implement:

| Feature | Block | Happy flow tested | Negative/abuse tested | Retry/timeout tested | Status |
|---|---|---|---|---|---|

Share this sheet with me. I will check it during reviews. If a block is marked stable but has no evidence of abuse testing, it will be sent back.

---

### Milestone 5 — Concurrency test + README
**Target: 2–4 hours**

Write a script (`tests/concurrency.js` or similar) that fires 200 parallel requests at your service and produces a clear pass or fail output. This must run automatically — not manually.

Also write a `README.md` with instructions to run the service and the concurrency test.

---

## Estimated total timeline

| Milestone | Estimated effort |
|---|---|
| Briefing | 10 minutes |
| SRS (including iterations) | 1 day |
| TSD (including iterations) | 1 day |
| Implementation | 2 days |
| Concurrency test + README | Half a day |
| **Total** | **~4-5 working days** |

These are targets, not ceilings. The quality of your SRS and TSD directly determines how smooth your implementation phase will be.

---

## Constraints

- Node.js (Express or Fastify), MongoDB
- MongoDB must run as a replica set — the provided `docker-compose.yml` sets this up for you
- Expect up to 200 concurrent redemption requests at peak load

## Out of scope

- Frontend, real authentication, real payment processing
- Order management — you only store the order ID you are given
- Coupon stacking (one coupon per order)
- Multiple currencies

---

## Ground rules

- **AI tools are strictly prohibited.** No ChatGPT, Claude, Copilot, Cursor, or any AI-assisted coding or writing tool — for code, documents, or any part of this task. Work submitted with AI assistance will be disqualified.
- All questions go into your SRS or TSD document — not into chat.
- No code before both documents are approved.
- No skipping milestones.
- Block tracking sheet must be maintained and shared throughout implementation.
- Concurrency test must be automated.

Good luck.
