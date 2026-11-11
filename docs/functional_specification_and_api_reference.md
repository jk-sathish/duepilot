# DuePilot — Functional Specification & API Reference

## 1. Functional Modules Overview

| Module | Route | Core Capabilities |
| :--- | :--- | :--- |
| **Landing & Auth** | `/login` | PayPal email login (`PAYPAL_AUTH`), merchant email registration (`SIGNUP`), password login (`LOGIN`), and 1-Click Judge Sandbox access. |
| **Command Centre** | `/dashboard` | Multi-currency selector (`USD`, `EUR`, `INR`), AI portfolio briefing, 8 KPI cards, 5 ageing buckets, SVG priority mix donut, Top 5 urgency queue, and reminder outcome metrics. |
| **Invoices Workspace** | `/invoices` | AG Grid table with live search, 6 status/policy filter pills, and a slide-over Intelligence Drawer showing 50/30/20 factor bars, cooldown progress, and invoice activity history. |
| **Recovery Copilot** | `/assistant` | Tone & scope controls, 5-step provenance bar, skipped cooldown explainability, master-detail proposal review desk, Message/Diff/Preview tabs, inline edit/regenerate/reset, and confirmation gate. |
| **Audit Trail** | `/activity` | Searchable, date-filterable, and category-filterable immutable ledger with expandable metadata, actor badges, related record links, and formula-safe CSV export. |
| **Policy & Settings** | `/settings` | Live server-side connection tests (PayPal OAuth, Gemini, Neon DB), Business Communication Profile, Cooldown Policy config, 100-point Scoring Weights, and Payment Simulator. |
| **Sandbox Lab** | `/demo-lab` | Live PayPal Sandbox invoice creator (`POST /v2/invoicing/invoices`), 10-invoice multi-currency Judge Portfolio provisioner, and isolated `DEMO` fixture purge. |
| **Account & Keys** | `/profile` | Merchant identity editor, default currency selector (`USD`, `EUR`, `INR`), per-user PayPal REST API `Client ID` & `Secret` vault, logout, and account security logs. |

---

## 2. Proposal State Machine Specification

    +-------------------+
    |      PENDING      |<---+ (Operator Edits / Regenerates / Resets Draft)
    +---------+---------+    |  Logs PROPOSAL_EDITED or PROPOSAL_CREATED
              |              |
    +---------+--------------+---------+
    |                                  |
    | [Operator Clicks Reject]         | [Operator Confirms Approval]
    | (No external PayPal API call)    | (Atomic DB Claim: PENDING -> EXECUTING)
    v                                  v
    +-----------------+        +-----------------+
    |    REJECTED     |        |    EXECUTING    |
    +-----------------+        +--------+--------+
            ^                           |
            |                  +--------+--------+
    (Auto-Transitioned if      |                 |
     Invoice becomes PAID) [PayPal 2xx]   [Policy Block / 4xx / 5xx]
                               |                 |
                               v                 v
                       +---------------+ +---------------+
                       |   EXECUTED    | |    FAILED     |
                       +---------------+ +---------------+

---

## 3. REST API Contract Reference

### 3.1 `POST /api/auth`
- **Actions:** `PAYPAL_AUTH`, `SIGNUP`, `LOGIN`, `LOGOUT`.
- **Behavior:** Validates credentials, creates or updates the `User` row in PostgreSQL, sets the `duepilot_session` HTTP-only signed cookie, logs the authentication event in `ActivityLog`, and returns a sanitized user DTO (`toSafeUserDto`).

### 3.2 `GET / PUT /api/profile`
- **`GET`:** Returns the current authenticated merchant DTO and the latest 10 account security events.
- **`PUT`:** Updates merchant profile fields (`name`, `companyName`, `paypalEmail`, `defaultCurrency`, `paypalEnv`). When `paypalClientId` and `paypalClientSecret` are provided, verifies them live against PayPal OAuth 2.0 (`/v1/oauth2/token`) before saving.

### 3.3 `GET /api/dashboard?currency=USD|EUR|INR`
- **Behavior:** Filters invoices by the requested currency code, computes the 50/30/20 urgency scores and 3-day cooldown states, aggregates the 8 KPIs and 5 ageing buckets, calculates post-reminder payment conversion metrics, and returns the deterministic briefing string.

### 3.4 `GET /api/invoices` & `GET /api/invoices/[id]`
- **`GET /api/invoices`:** Returns all invoices sorted by `priorityScore` descending, enriched with `factors` (`overdueScore`, `valueScore`, `escalationScore`), `valueRatioPercent`, `priorRemindersCount`, `eligibleForReminder`, `cooldownDaysLeft`, and `cooldownEndsAt`.
- **`GET /api/invoices/[id]`:** Returns the single invoice with its ordered `proposals` and `activityLogs` arrays.

### 3.5 `POST /api/agent`
- **Request Body:** `{ "prompt": string }`
- **Behavior:** Executes `runReceivablesAgent(prompt)`, identifies unpaid invoices skipped due to cooldown, fetches the enriched proposal queue, and returns `{ success, reply, source: 'GEMINI' | 'FALLBACK', elapsedMs, skippedCooldownInvoices, proposals }`.

### 3.6 `GET /api/proposals` & `PATCH /api/proposals/[id]`
- **`GET /api/proposals`:** Joins proposals with their parent invoice and creation/edit activity logs to reconstruct `originalMessage`, `editedByOperator`, `subject`, `source`, and live score factors.
- **`PATCH /api/proposals/[id]`:**
  - Standard Edit: Persists `proposedMessage` and `subject`, logging `PROPOSAL_EDITED` while preserving `originalMessage` for the Diff viewer.
  - Tone Regeneration (`{ action: 'REGENERATE', tone }`): Rebuilds the reminder draft in the requested tone (`FRIENDLY`, `PROFESSIONAL`, `DIRECT`, `FIRM`).

### 3.7 `POST /api/proposals/[id]/approve` & `POST /api/proposals/[id]/reject`
- **`approve`:** Claims `PENDING` $\rightarrow$ `EXECUTING` atomically, blocks `source === 'DEMO'` fixtures from live execution, re-checks live invoice status via `GET /v2/invoicing/invoices/{paypalId}`, verifies server-side cooldown eligibility, sends the reminder via `POST /v2/invoicing/invoices/{paypalId}/remind`, records `paypal-debug-id`, and transitions to `EXECUTED`.
- **`reject`:** Transitions `PENDING` $\rightarrow$ `REJECTED` and writes a `PROPOSAL_REJECTED` audit log without calling PayPal.

### 3.8 `GET / PUT / POST /api/settings`
- **`GET`:** Returns persisted `AppSettings` (`businessProfile`, `policy`, `weights`) and live integration health metadata.
- **`PUT`:** Validates settings via `AppSettingsSchema` (enforcing `overdueWeight + valueWeight + escalationWeight === 100`) and persists to PostgreSQL.
- **`POST`:** Handles `RESET_DEFAULTS` and `TEST_CONNECTION` (`PAYPAL`, `GEMINI`, `DATABASE`).

### 3.9 `GET / POST /api/demo-lab`
- **`POST` Actions:**
  - `SEED_JUDGE_PORTFOLIO`: Provisions 10 multi-currency invoices (`USD`, `EUR`, `INR`), proposals, message diffs, cooldown states, and audit logs (and creates a live Sandbox draft if PayPal credentials are active).
  - `CREATE_SANDBOX_INVOICE`: Creates a live draft invoice on PayPal Sandbox via `POST /v2/invoicing/invoices` and syncs it into PostgreSQL.
  - `CLEAR_FIXTURES`: Deletes only records where `source === 'DEMO'`, leaving `PAYPAL_SANDBOX` records untouched.