# DuePilot — Technical Design & Architecture Document (TDD)

## 1. System Architecture & Design Principles

DuePilot is architected around four non-negotiable financial engineering principles:

1. **Deterministic Math Over LLM Arithmetic:** All monetary aggregations, ageing buckets, relative value ratios, $0\text{--}100$ urgency scores, and cooldown windows are computed deterministically in TypeScript and PostgreSQL `Decimal(10, 2)`—never delegated to an LLM.
2. **Urgency $\neq$ Permission to Act:** Invoice urgency ($0\text{--}100$) is calculated independently of reminder cooldown eligibility so a high-value overdue account never appears low-priority simply because it was reminded yesterday.
3. **Zero-Trust Human-in-the-Loop Execution:** AI can only create or update `PENDING` proposals in PostgreSQL. Only an authenticated operator action can trigger the atomic approval gate (`POST /api/proposals/[id]/approve`) to call PayPal's Remind API.
4. **Resilient AI with Transparent Provenance:** Every AI workflow uses `gemini-3.8-flash` with strict Zod schema validation and an automatic deterministic failover (`buildDeterministicAnalysis`), explicitly badging the output source (`GEMINI` vs `FALLBACK`).

### High-Level Architecture Diagram

    +-----------------------------------------------------------------------------------+
    |                        CLIENT BROWSER (React 19 / Next.js 16)                     |
    |  +---------------+  +---------------+  +---------------+  +--------------------+  |
    |  | Command       |  | AG Grid       |  | AI Assistant  |  | Audit, Settings,   |  |
    |  | Centre        |  | Invoices &    |  | Review Desk   |  | Demo Lab & Profile |  |
    |  | (USD/EUR/INR) |  | Slide Drawer  |  | (Diff/Tone)   |  | (PayPal Vault)     |  |
    |  +-------+-------+  +-------+-------+  +-------+-------+  +---------+----------+  |
    |          +------------------+------------------+--------------------+             |
    |                             | Global Fetch Telemetry & Auth Guard (AppShell)      |
    +-----------------------------|-----------------------------------------------------+
                                  v
    +-----------------------------------------------------------------------------------+
    |                     NEXT.JS SERVERLESS API LAYER (App Router)                     |
    |                                                                                   |
    |  +--------------------------+   +----------------------------------------------+  |
    |  | Recovery Math Engine     |   | Zero-Trust AI Copilot Engine                 |  |
    |  | - scoring.ts (50/30/20)  |   | - gemini.ts (gemini-3.8-flash + Zod Schema)  |  |
    |  | - policy.ts (Cooldown)   |   | - Deterministic Failover on 503 / Timeout    |  |
    |  +------------+-------------+   +----------------------+-----------------------+  |
    |               |                                        |                          |
    |  +------------v----------------------------------------v-----------------------+  |
    |  | Atomic Execution Gate (/api/proposals/[id]/approve)                         |  |
    |  | 1. Conditional DB Lock (PENDING -> EXECUTING)                               |  |
    |  | 2. Live PayPal Invoice Re-Fetch & Status Verification                       |  |
    |  | 3. Server-Side Cooldown Recheck -> PayPal Remind API -> Audit Log           |  |
    |  +------------+----------------------------------------+-----------------------+  |
    +---------------|----------------------------------------|--------------------------+
                    v                                        v
    +-----------------------------------+    +------------------------------------------+
    | NEON SERVERLESS POSTGRESQL        |    | EXTERNAL INTEGRATIONS                    |
    | - User (Per-user PayPal Vault)    |    | - PayPal Invoicing REST API v2 (OAuth2)  |
    | - Invoice (Decimal(10,2))         |    | - Google Gemini API (@google/genai)      |
    | - ActionProposal (Decimal(5,2))   |    +------------------------------------------+
    | - ActivityLog (Immutable JSONB)   |
    +-----------------------------------+

---

## 2. Database Schema & Entity-Relationship Specification (`prisma/schema.prisma`)

### 2.1 `User` (`users` table)
Supports multi-merchant hosting on Vercel and per-user PayPal API credential vaulting:
- `id` (`UUID`, Primary Key)
- `email` (`String`, `@unique`)
- `name` (`String`), `companyName` (`String?`)
- `passwordHash` (`String?` — `scrypt` 64-byte key with 16-byte random salt)
- `authProvider` (`"EMAIL"` | `"PAYPAL"`), `paypalEmail` (`String?`)
- `paypalClientId` (`String?`), `paypalClientSecret` (`String?`), `paypalEnv` (`"SANDBOX"` | `"LIVE"`)
- `defaultCurrency` (`"USD"` | `"EUR"` | `"INR"`)

### 2.2 `Invoice` (`invoices` table)
Stores synchronized PayPal Sandbox records and isolated demo fixtures:
- `id` (`UUID`, Primary Key), `userId` (`String?`, Foreign Key $\rightarrow$ `User.id`)
- `paypalId` (`String`, `@unique` — PayPal Invoice ID or `DEMO-INV-*`)
- `invoiceNumber` (`String`), `customerName` (`String?`), `customerEmail` (`String?`)
- `amount` (`Decimal(10, 2)` — Exact fixed-point currency representation)
- `currency` (`String` — ISO 4217 code: `USD`, `EUR`, `INR`)
- `status` (`String`), `rawStatus` (`String?`)
- `issueDate` (`DateTime`), `dueDate` (`DateTime?`), `lastSyncedAt` (`DateTime`)
- `source` (`"PAYPAL_SANDBOX"` | `"DEMO"`)

### 2.3 `ActionProposal` (`action_proposals` table)
Stores AI-generated and operator-edited follow-up drafts:
- `id` (`UUID`, Primary Key), `invoiceId` (`String`, Foreign Key $\rightarrow$ `Invoice.id`)
- `actionType` (`"SEND_REMINDER"`)
- `proposedMessage` (`Text`), `aiExplanation` (`Text`)
- `priority` (`Decimal(5, 2)` — $0.00\text{--}100.00$)
- `state` (`"PENDING"` | `"EXECUTING"` | `"EXECUTED"` | `"REJECTED"` | `"FAILED"`)
- `createdAt` (`DateTime`), `approvedAt` (`DateTime?`), `executedAt` (`DateTime?`)
- `paypalReference` (`String?` — Stores the returned `paypal-debug-id`)
- `idempotencyKey` (`String`, `@unique`)

### 2.4 `ActivityLog` (`activity_logs` table)
Append-only audit ledger for compliance and provenance:
- `id` (`UUID`, Primary Key)
- `userId` (`String?`), `invoiceId` (`String?`), `proposalId` (`String?`)
- `eventType` (`String`), `status` (`"SUCCESS"` | `"PENDING"` | `"FAILED"`)
- `description` (`Text`), `metadata` (`Json?`), `createdAt` (`DateTime`)

---

## 3. Mathematical Specification of the Recovery Scoring Engine (`src/lib/recovery/scoring.ts`)

Let $I_C$ be the set of all unpaid invoices denominated in currency $C \in \{\text{USD}, \text{EUR}, \text{INR}\}$. Let the maximum open invoice amount in currency $C$ be:

$$M_C = \max_{k \in I_C}(\text{amount}_k)$$

Let the configurable scoring weights be $(W_O, W_V, W_E) \in \mathbb{Z}_{\ge 0}^3$ such that:

$$W_O + W_V + W_E = 100$$

(Default configuration: $W_O = 50$, $W_V = 30$, $W_E = 20$).

For each unpaid invoice $i \in I_C$ with overdue days $d_i = \max\left(0, \lfloor \frac{t_{\text{now}} - t_{\text{due}, i}}{86,400,000} \rfloor\right)$ and prior executed reminders $r_i \in \mathbb{Z}_{\ge 0}$:

1. **Overdue Severity Score ($S_O \in [0, W_O]$):**
   $$S_O = \begin{cases} \min\left(W_O, \text{round}\left(\left(0.30 + 0.70 \cdot \frac{d_i}{25}\right) \cdot W_O\right)\right) & \text{if } d_i > 0 \\ \max(1, \text{round}(0.16 \cdot W_O)) & \text{if } d_i = 0 \text{ and } 0 \le \text{daysUntilDue}_i \le 3 \text{ and proactiveUpcoming} \\ 0 & \text{otherwise} \end{cases}$$

2. **Same-Currency Relative Value Score ($S_V \in [0, W_V]$):**
   $$S_V = \min\left(W_V, \text{round}\left(\frac{\text{amount}_i}{M_C} \cdot W_V\right)\right)$$

3. **Escalation Signal Score ($S_E \in [0, W_E]$):**
   $$S_E = \begin{cases} W_E & \text{if } r_i \ge 2 \text{ or } d_i \ge 14 \\ \text{round}(0.50 \cdot W_E) & \text{if } r_i = 1 \text{ or } 7 \le d_i < 14 \\ \text{round}(0.30 \cdot W_E) & \text{if } 0 < d_i < 7 \text{ and } r_i = 0 \\ 0 & \text{otherwise} \end{cases}$$

4. **Total Urgency Score & Priority Band:**
   $$\text{TotalScore}_i = \min(100, S_O + S_V + S_E)$$
   - `CRITICAL`: $\text{TotalScore}_i \ge 75$
   - `HIGH`: $55 \le \text{TotalScore}_i \le 74$
   - `MEDIUM`: $35 \le \text{TotalScore}_i \le 54$
   - `LOW`: $0 \le \text{TotalScore}_i \le 34$

---

## 4. Reminder Eligibility & Anti-Spam Cooldown Policy (`src/lib/recovery/policy.ts`)

Given configurable cooldown period $D_{\text{cool}} \in [1, 30]$ days (default $D_{\text{cool}} = 3$) and last executed reminder timestamp $t_{\text{last}}$:

$$\Delta d = \left\lfloor \frac{t_{\text{now}} - t_{\text{last}}}{86,400,000} \right\rfloor$$

- If status is `PAID`, `CANCELLED`, `DRAFT`, or `REFUNDED` $\rightarrow$ `eligibleForReminder = false`.
- If $t_{\text{last}} = \text{null}$ $\rightarrow$ `eligibleForReminder = true` (`NONE_RECORDED`).
- If $\Delta d < D_{\text{cool}}$ $\rightarrow$ `eligibleForReminder = false` (`RECENTLY_REMINDED`, remaining cooldown $= D_{\text{cool}} - \Delta d$ days).
- If $\Delta d \ge D_{\text{cool}}$ $\rightarrow$ `eligibleForReminder = true` (`COOLDOWN_PASSED`).

---

## 5. Grounded Gemini AI Pipeline & Failover (`src/lib/ai/gemini.ts`)

1. **Pre-Computed Grounding Snapshot:** Before calling Gemini, the server computes the exact `ScoredInvoice` array from PostgreSQL.
2. **Single-Shot Structured Generation:** Calls `ai.models.generateContent` on `gemini-3.8-flash` with `responseMimeType: 'application/json'` and a strict schema requiring `executiveSummary` and `proposals[]` (`invoiceId`, `proposedMessage`, `aiExplanation`).
3. **Post-Generation Validation & Persistence:** Each returned proposal is matched against the eligible invoice set. Proposals targeting invoices on cooldown or already paid are discarded by the server.
4. **Automatic Deterministic Failover:** If `gemini-3.8-flash` throws a `503` / `429` or network error, `buildDeterministicAnalysis()` immediately generates tone-calibrated drafts from the verified invoice fields and logs provenance as `FALLBACK`.