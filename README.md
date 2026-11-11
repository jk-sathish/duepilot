# DuePilot — AI Revenue Recovery & PayPal Receivables Copilot

> **Don't chase payments. Let AI manage your receivables.**  
> *AI recommends. The owner decides. PayPal executes. DuePilot proves what happened.*

[![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PayPal REST API](https://img.shields.io/badge/PayPal_Invoicing_API-v2_Sandbox-003087?logo=paypal)](https://developer.paypal.com/docs/api/invoicing/v2/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-gemini--3.8--flash-4285F4?logo=google)](https://ai.google.dev/)
[![PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-Prisma_Decimal-336791?logo=postgresql)](https://neon.tech/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10B981.svg)](./LICENSE)

---

## 1. Executive Overview

Small businesses, agencies, and global freelancers do not just need to create invoices—they need to get paid without damaging client relationships. Manual accounts receivable (AR) follow-up requires tracking due dates across multiple currencies, calculating which overdue accounts represent the highest cash-flow risk, checking when a customer was last contacted, drafting contextual reminders, and maintaining an audit trail.

**DuePilot** transforms unpaid PayPal invoices into an intelligent, explainable, and owner-controlled revenue recovery workflow:

1. **Synchronises Live PayPal Receivables:** Connects via OAuth 2.0 to the **PayPal Invoicing REST API v2** (supporting both shared Sandbox evaluation credentials and per-merchant custom PayPal API keys).
2. **Decouples Urgency from Permission to Act:** Computes a deterministic **$0\text{--}100$ Recovery Urgency Score** ($50\%$ Overdue Severity, $30\%$ Same-Currency Relative Value, $20\%$ Escalation Signal) completely independent of the **Customer-Friendly $3$-Day Cooldown Gate**.
3. **Grounds Gemini AI in Verified Ledger Facts:** Uses **Google Gemini (`gemini-3.8-flash`)** with structured JSON validation and automatic deterministic failover to draft tone-calibrated follow-ups (`Friendly`, `Professional`, `Direct`, `Firm`) without ever inventing financial figures or bypassing cooldown rules.
4. **Enforces Human-in-the-Loop Execution Safety:** Requires explicit operator approval, performs an atomic database state lock ($\text{PENDING} \rightarrow \text{EXECUTING}$), re-verifies the live invoice status on PayPal Sandbox, dispatches the reminder via `POST /v2/invoicing/invoices/{id}/remind`, and records the returned `paypal-debug-id` in an immutable audit ledger.

---

## 2. Quick Access for Hackathon Judges & Panelists

### Option A: 1-Click Judge & Panelist Sandbox Access (Fastest)
1. Open the hosted application URL (or `http://localhost:3000/login`).
2. Click **"⚡ 1-Click Judge & Panelist Sandbox Access"** at the bottom of the login card.
3. You will be signed in immediately with pre-configured PayPal Sandbox access and a rich 10-invoice multi-currency portfolio across **USD ($\$$)**, **EUR ($€$)**, and **INR ($₹$)**, complete with active AI proposals, before/after message diffs, cooldown protections, and audit logs.

### Option B: Sign In with PayPal Email or Custom PayPal Developer Keys
1. On `/login`, enter any email in the **PayPal Login** tab and click **Continue with PayPal**, or register a merchant account in the **Create Account** tab.
2. Navigate to **Account & PayPal Keys (`/profile`)** in the sticky left sidebar to attach your own PayPal Developer `Client ID` and `Secret` (verified live against PayPal OAuth 2.0 before saving) or switch your default ledger currency between `USD`, `EUR`, and `INR`.

---

## 3. Complete Documentation Suite (`/docs`)

Detailed manuals and engineering specifications are provided in the [`/docs`](./docs) directory:

- 📘 **[User & Judge Manual (`docs/USER_MANUAL.md`)](./docs/USER_MANUAL.md)** — Step-by-step guide to every screen, currency switcher, intelligence drawer, AI review desk, and sandbox generator.
- 🏗️ **[Technical Design Document (`docs/TECHNICAL_DESIGN_DOCUMENT.md`)](./docs/TECHNICAL_DESIGN_DOCUMENT.md)** — System architecture, Prisma `Decimal(10,2)` ER schema, $50/30/20$ scoring mathematics, Gemini grounding & fallback design, and atomic concurrency locks.
- 📋 **[Functional Specification (`docs/FUNCTIONAL_SPECIFICATION.md`)](./docs/FUNCTIONAL_SPECIFICATION.md)** — End-to-end state machines, REST API route contracts, and edge-case safety gates.
- 🔐 **[Security & Data Model Specification (`docs/SECURITY_AND_DATA_MODEL.md`)](./docs/SECURITY_AND_DATA_MODEL.md)** — Credential vaulting, session signing, AI privacy boundaries, and CSV formula injection protection.
- 🎬 **[Hackathon Submission & Demo Video Script (`docs/HACKATHON_SUBMISSION_AND_VIDEO_SCRIPT.md`)](./docs/HACKATHON_SUBMISSION_AND_VIDEO_SCRIPT.md)** — Complete Devpost submission narrative and shot-by-shot $< 3$-minute video guide.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend & Routing** | Next.js `16.4.5` (App Router, Turbopack), React `19.3.0`, TypeScript `5` | Full-stack application shell, server/client components, global fetch telemetry loader |
| **Financial Data Grid** | AG Grid Community `36.3.0` (`ag-grid-react`) | High-density sorting, filtering, currency formatting, and slide-over row inspection |
| **Database & ORM** | Neon Serverless PostgreSQL + Prisma ORM `6.19.3` | Exact `Decimal(10,2)` monetary storage, relational proposals, and append-only audit logs |
| **Payments Integration** | PayPal Invoicing REST API v2 (`api-m.sandbox.paypal.com`) | OAuth 2.0 token exchange, invoice sync, draft creation, live pre-check, and reminder dispatch |
| **AI Copilot Engine** | Google GenAI SDK (`@google/genai` `^3.0.0`, `gemini-3.8-flash`) + Zod `4.6.7` | Grounded receivables analysis, tone-adapted reminder drafting, and deterministic failover |

---

## 5. Local Setup & Run Instructions

### Prerequisites
- **Node.js** `v20+` and `npm`
- **PostgreSQL Database** (Neon Serverless PostgreSQL recommended)
- **PayPal Developer Sandbox Credentials** (`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`)
- **Google AI Studio API Key** (`GEMINI_API_KEY`)

### Step 1: Clone the Repository & Install Packages

    git clone <YOUR_PUBLIC_GITHUB_REPO_URL>
    cd duepilot
    npm install

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` in the root directory and fill in your keys:

    cp .env.example .env

Required variables in `.env`:

    DATABASE_URL="postgresql://user:password@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    GEMINI_API_KEY="your_google_ai_studio_api_key"
    PAYPAL_CLIENT_ID="your_paypal_sandbox_client_id"
    PAYPAL_CLIENT_SECRET="your_paypal_sandbox_client_secret"
    PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"

### Step 3: Push Database Schema & Generate Prisma Client

    npx prisma db push
    npx prisma generate

### Step 4: Start the Development Server

    npm run dev

Visit `http://localhost:3000` in your browser.

### Step 5: Verify Production Build & Linting

    npm run lint
    npx tsc --noEmit
    npm run build

---

## 6. Known Limitations & Sandbox Transparency

- **PayPal Sandbox Environment:** By default, DuePilot operates against `https://api-m.sandbox.paypal.com`. No real bank transfers or live customer charges occur during judge testing.
- **Attribution Honesty:** On the Command Centre, invoices paid after a reminder are reported with the explicit disclosure: *"Payments observed after a reminder — a time-based association, not proof the reminder caused payment."*
- **Simulated Lifecycle Events:** Local payment transitions triggered from the Demo Simulator are explicitly badged as `DEMO SIMULATOR` (`DEMO PAYMENT SIMULATED`) in the Audit Trail so they are never confused with external webhook callbacks.

---

## 7. License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full license text.