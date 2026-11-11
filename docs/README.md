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

## 1. Executive Summary

Small businesses, agencies, and global freelancers do not just need to issue invoices—they need to get paid without damaging client relationships. Manual accounts receivable (AR) follow-up requires tracking due dates across currencies, calculating which overdue accounts represent the highest cash-flow exposure, checking when a client was last contacted, drafting contextual reminders, and logging audit trails.

**DuePilot** transforms unpaid PayPal invoices into an intelligent, explainable, and owner-controlled revenue recovery workflow:
1. **Synchronises Live Receivables:** Connects via OAuth 2.0 to the **PayPal Invoicing REST API v2** (supporting platform Sandbox credentials or per-merchant custom PayPal API keys).
2. **Decouples Urgency from Permission to Act:** Computes a deterministic **0–100 Recovery Urgency Score** (`50%` Overdue Severity, `30%` Same-Currency Relative Value, `20%` Escalation Signal) completely independent of the **Customer-Friendly 3-Day Cooldown Gate**.
3. **Grounds Gemini AI in Verified Ledger Facts:** Uses **Google Gemini (`gemini-3.8-flash`)** with structured JSON output and automatic deterministic failover to draft tone-calibrated follow-ups (`Friendly`, `Professional`, `Direct`, `Firm`) without ever inventing financial figures or bypassing cooldown rules.
4. **Enforces Human-in-the-Loop Execution Safety:** Requires explicit operator approval, performs an atomic database state lock (`PENDING` $\rightarrow$ `EXECUTING`), re-verifies the live invoice status on PayPal Sandbox, dispatches the reminder via `POST /v2/invoicing/invoices/{id}/remind`, and records the returned `paypal-debug-id` in an immutable audit ledger.

---

## 2. Quick Access for Hackathon Judges & Panelists

### Option A: 1-Click Judge & Panelist Sandbox Login (Fastest)
1. Open the hosted application URL (or `http://localhost:3000/login`).
2. Click **"⚡ 1-Click Judge & Panelist Sandbox Access"** at the bottom of the login card.
3. You will be signed in immediately with pre-configured PayPal Sandbox access and a rich multi-currency portfolio across **USD ($)**, **EUR (€)**, and **INR (₹)**.

### Option B: Sign In with PayPal Email or Custom PayPal Developer Keys
1. On `/login`, enter any email in the **PayPal Login** tab and click **Continue with PayPal**, or register a merchant account in the **Create Account** tab.
2. Navigate to **Account & PayPal Keys (`/profile`)** in the sticky sidebar to attach your own PayPal Developer `Client ID` and `Secret` (verified live against PayPal OAuth 2.0 before saving) or switch your default ledger currency between `USD`, `EUR`, and `INR`.

---

## 3. System Architecture & Documentation Index

Detailed engineering, functional, and operational manuals are located in the [`/docs`](./docs) directory:
- 📘 **[User & Judge Manual (`docs/USER_MANUAL.md`)](./docs/USER_MANUAL.md)** — Complete walkthrough of every screen, filter, drawer, AI review flow, and sandbox tool.
- 🏗️ **[Technical Design Document (`docs/TECHNICAL_DESIGN_DOCUMENT.md`)](./docs/TECHNICAL_DESIGN_DOCUMENT.md)** — System architecture, Prisma `Decimal(10,2)` ER schema, 50/30/20 scoring mathematics, Gemini grounding & fallback design, and atomic concurrency locks.
- 📋 **[Functional Specification (`docs/FUNCTIONAL_SPECIFICATION.md`)](./docs/FUNCTIONAL_SPECIFICATION.md)** — End-to-end state machines, API route contracts, and edge-case safety gates.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend & Routing** | Next.js `16.4.5` (App Router, Turbopack), React `19.3.0`, TypeScript `5` | Full-stack application shell, server/client components, global fetch telemetry loader |
| **Financial Data Grid** | AG Grid Community `36.3.0` (`ag-grid-react`) | High-density sorting, filtering, currency formatting, and row inspection |
| **Database & ORM** | Neon Serverless PostgreSQL + Prisma ORM `6.19.3` | Exact `Decimal(10,2)` monetary storage, relational proposals, and immutable audit logs |
| **Payments Integration** | PayPal Invoicing REST API v2 (`api-m.sandbox.paypal.com`) | OAuth 2.0 token exchange, invoice sync, draft creation, live pre-check, and reminder dispatch |
| **AI Copilot Engine** | Google GenAI SDK (`@google/genai` `^3.0.0`, `gemini-3.8-flash`) + Zod `4.6.7` | Grounded receivables analysis, tone-adapted reminder drafting, and deterministic failover |

---

## 5. Local Setup & Installation Instructions

### Prerequisites
- **Node.js** `v20+` and `npm`
- **PostgreSQL Database** (Neon PostgreSQL recommended)
- **PayPal Developer Sandbox Account** (`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`)
- **Google AI Studio API Key** (`GEMINI_API_KEY`)

### Step 1: Clone & Install Dependencies
```bash
git clone <YOUR_PUBLIC_GITHUB_REPO_URL>
cd duepilot
npm install