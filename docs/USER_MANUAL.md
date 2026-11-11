# DuePilot — Comprehensive User & Judge Manual

## 1. Purpose of This Manual
This manual provides a complete operational walkthrough of **DuePilot** for hackathon judges, panelists, and merchant operators. Every screen, filter, analytical chart, AI review control, and safety guardrail is documented below.

---

## 2. Signing In & Multi-Merchant Onboarding (`/login`)

When you open DuePilot at `/`, the application routes you to the **Merchant Sign In & Onboarding Portal (`/login`)**. Three authentication pathways are supported:

### 2.1 1-Click Judge & Panelist Sandbox Access (Recommended for Judging)
- Click the **"⚡ 1-Click Judge & Panelist Sandbox Access"** button at the bottom of the login card.
- **What happens behind the scenes:**
  1. Authenticates an evaluation session (`judge.panelist@paypal-sandbox.test`).
  2. Checks if the multi-currency Judge Portfolio is present; if fewer than $6$ invoices exist, automatically provisions $10$ realistic invoices across **USD ($\$$)**, **EUR ($€$)**, and **INR ($₹$)** along with AI proposals, message diffs, cooldown locks, and audit events.
  3. Redirects directly to the **Command Centre (`/dashboard`)**.

### 2.2 PayPal Login (Email-First Onboarding)
- Select the **PayPal Login** tab, enter your PayPal email address, and click **Continue with PayPal**.
- Your session starts immediately with platform Sandbox access so you can explore the product without friction. Whenever you are ready to connect your own PayPal Developer account, navigate to **Account & PayPal Keys (`/profile`)** to attach your `Client ID` and `Secret`.

### 2.3 Email Sign-Up with Optional PayPal Key Binding
- Select the **Create Account** tab.
- Enter your Full Name, Work Email, Password, and Default Currency (`USD`, `EUR`, or `INR`).
- Optionally click **"+ Optional: Connect PayPal Client ID & Secret now"** to bind your personal PayPal REST API credentials during registration.

---

## 3. Application Shell, Sticky Sidebar & Global Loading UI

- **Sticky Institutional Sidebar:** The left navigation bar uses `position: sticky; top: 0; height: 100vh;` so navigation, account status, and system telemetry remain visible at all times regardless of page scroll depth.
- **System-Wide Smooth Loading Bar & Status Pill:** Every client `fetch()` call and route transition is intercepted by `AppShell.tsx`. Whenever DuePilot syncs with PayPal, runs Gemini analysis, executes a reminder, or switches currencies, a smooth top progress bar and a bottom-right status pill (e.g., *"Syncing live PayPal invoices..."*, *"Refreshing financial ledger..."*) appear automatically.
- **Merchant Account & Telemetry Footer:** Displays your operator initials, email, credential mode (`Custom PayPal Keys` vs `Shared Sandbox Keys`), default currency badge, a quick link to **Profile & Keys**, a **Logout** button, and live PayPal REST v2 latency in milliseconds.

---

## 4. Command Centre (`/dashboard`)

The **Command Centre** gives merchants an immediate executive overview of receivables health and recovery actions:

### 4.1 Multi-Currency Switcher (`USD` | `EUR` | `INR`)
- Located in the top-right action bar.
- **Strict Currency Isolation:** DuePilot never adds USD, EUR, and INR figures together into a meaningless number. Clicking `USD`, `EUR`, or `INR` recalculates all $8$ KPI cards, the $5$ ageing buckets, the Priority Mix donut chart, the Top 5 action queue, and the AI portfolio briefing strictly for that currency.

### 4.2 AI Portfolio Briefing
- Displays an immediate deterministic summary of open invoices, overdue risk percentage, the highest-priority overdue invoice, eligible follow-ups, and cooldown-protected records.
- Click **"+ Polish with Gemini"** to generate an executive narrative via `gemini-3.8-flash`. The badge updates dynamically to indicate `Gemini` or `Deterministic` provenance.
- Click **"Review X pending drafts $\rightarrow$"** to jump straight to the AI Assistant Review Desk.

### 4.3 The 8 Executive KPI Cards
1. **Outstanding:** Total unpaid balance and count of open receivables in the active currency.
2. **Overdue at Risk:** Total past-due balance, percentage of total outstanding exposure, and overdue invoice count.
3. **Due in 3 Days:** Total value and count of invoices approaching their due date within $\le 3$ days.
4. **Unpaid Invoices:** Count of open invoices and how many are past due.
5. **AI Proposals:** Number of `PENDING` reminder drafts awaiting operator approval.
6. **Reminders Sent:** Total reminders executed via the PayPal Sandbox Remind API.
7. **Protected by Cooldown:** Open invoices currently inside the $3$-day anti-spam window.
8. **Eligible Now:** Open invoices ready for immediate reminder generation or dispatch.

### 4.4 Receivables Ageing & Priority Mix Donut
- **Receivables Ageing:** Horizontal proportional bars breaking down open balances across `Not due`, `1–7 days`, `8–14 days`, `15–30 days`, and `30+ days` overdue.
- **Priority Mix Donut:** SVG ring chart showing total open invoices in the center and the breakdown across `Critical`, `High`, `Medium`, and `Low` priority bands.

### 4.5 Do This Next — Top 5 by Urgency
- Ranks the top $5$ open invoices by their $0\text{--}100$ Urgency Score.
- Shows a stacked factor bar (`Overdue` + `Value`), the numeric score, priority band badge, eligibility state (`✓ Eligible` vs `● Cooldown · Xd`), and a direct **Draft follow-up** action button.

### 4.6 Reminder Outcomes & Recent Activity
- **Reminder Outcomes:** Reports `Paid After Reminder`, `Amount`, `Conversion %`, and `Median Time to Pay`, accompanied by the transparent disclaimer: *"Payments observed after a reminder — a time-based association, not proof the reminder caused payment."*
- **Recent Activity:** Live feed of the latest $6$ system, AI, and operator events with actor badges (`demo-operator`, `gemini`, `system`).

---

## 5. Invoices & Slide-Over Intelligence Drawer (`/invoices`)

### 5.1 Live Search & Filter Pills
- **Search Input:** Filter instantaneously by invoice number, customer name, customer email, or amount.
- **Filter Pills with Live Counts:** Switch between `All`, `Unpaid`, `Overdue`, `Due soon`, `Paid`, and `Cooldown`.

### 5.2 Slide-Over Invoice Intelligence Drawer
Click any row in the AG Grid table to open the right-side **Invoice Intelligence Drawer**:
1. **Header & PayPal ID Copy:** Shows the invoice number, customer name, email, a one-click button to copy the raw `paypalId`, the formatted currency amount, status badge, and overdue day count.
2. **Urgency Score — How important is this? ($0\text{--}100$ Ring):**
   - Renders a circular SVG gauge for the total score alongside individual progress bars for:
     - **Overdue severity:** $X / 50$ points (with days past due).
     - **Relative value:** $Y / 30$ points (showing percentage of the largest open invoice in that currency).
     - **Escalation signal:** $Z / 20$ points (reflecting prior reminders sent while still unpaid).
3. **Can we act now? — Separate from urgency:**
   - Clearly explains why a high-urgency invoice may or may not be actionable today:
     - `✓ Eligible now` — Ready for AI follow-up.
     - `● Cooldown · X day(s) left` — Displays a progress bar showing when the last reminder was sent and the exact date the cooldown expires.
     - `✓ Invoice Settled` — No follow-up required.
4. **Activity Timeline & Sticky Footer:**
   - Lists every proposal creation, human edit, PayPal reminder (`PayPal Debug-Id`), and payment event for that invoice.
   - Footer actions allow you to **Draft follow-up**, **Refresh**, or **Simulate payment** directly from the drawer.

---

## 6. Recovery Copilot — AI Assistant Review Desk (`/assistant`)

### 6.1 Tone, Scope & Custom Instruction Bar
- **Tone Pills:** Select `Auto (smart)`, `Friendly`, `Professional`, `Direct`, or `Firm`.
- **Scope Toggle:** Choose `All eligible (X)` or `Selected invoice`.
- **Optional Instruction:** Add context such as *"offer a 2-part payment schedule"* or *"offer to resend the invoice link"*.
- Click **"+ Analyse & prepare drafts"** to run the pipeline.

### 6.2 5-Step Provenance Stepper & Skipped Cooldown Banner
- Displays the verified execution stages: `✓ Load portfolio` $\rightarrow$ `✓ Score & policy check` $\rightarrow$ `✓ Gemini draft` $\rightarrow$ `✓ Validate drafts` $\rightarrow$ `✓ Save proposals` with elapsed time.
- The provenance banner explicitly badges whether drafts came from `✦ Gemini · gemini-3.8-flash` or `⚡ Deterministic fallback`, and lists any overdue invoices that were skipped because they are protected by the $3$-day cooldown (click **"Why were these skipped?"** to inspect full policy reasons).

### 6.3 Master-Detail Proposal Review Desk
- **Left Queue:** Filter proposals by `All`, `Pending`, `Executed`, `Rejected`, or `Failed`.
- **Right Review Desk:**
  - **Why this invoice:** Displays the 3-part segmented urgency bar and exact factor scores (`/50`, `/30`, `/20`) plus cooldown eligibility status.
  - **Facts Gemini used:** Lists the exact verified database fields provided to the model (`Invoice`, `Amount`, `Due date`, `Days overdue`, `Prior reminders`, and masked customer first name), noting: *"Gemini never sees emails, payment links or other customers."*
  - **Draft Message Tabs (`Message` | `Diff` | `Preview as customer`):**
    - Click **Edit** to modify the Subject or Body, then click **Save changes**. Edited drafts display an `✎ Edited by you` badge.
    - Click **Diff** to view a side-by-side red/green comparison between the original AI draft and your edited version.
    - Click **Preview as customer** to inspect the formatted email header (`To:`, `Via: PayPal Invoicing Sandbox`, `Subject:`) and body.
    - Click **Regenerate** to re-draft the message using the currently selected tone pill, or **Reset to AI draft** to restore the original wording.
  - **Approval Safety Gate:**
    - Clicking **"▸ Approve & send via PayPal"** opens an explicit confirmation gate (*"Confirm PayPal Sandbox Reminder: Send this exact reviewed message for Invoice #...?"*).
    - Clicking **"Confirm & Send Now"** claims the proposal atomically, re-verifies the invoice on PayPal Sandbox, dispatches the reminder, logs the `PayPal Debug-Id`, and starts the $3$-day cooldown.

---

## 7. Audit Trail (`/activity`), Policy Settings (`/settings`), Sandbox Lab (`/demo-lab`) & Profile (`/profile`)

- **Audit Trail (`/activity`):** Search by invoice number, customer, or PayPal Debug-ID; filter by time window (`All time`, `Last 24h`, `Last 7d`, `Last 30d`) or event category; expand `Details ▾` on any row; or click **Export Audit CSV** to download a formula-sanitized spreadsheet.
- **Policy & Settings (`/settings`):** Run live connection diagnostics (`Test PayPal OAuth`, `Test Gemini API`, `Verify DB Latency`), customize your Business Communication Profile, adjust the Cooldown Days, tune the $0\text{--}100$ Priority Weights (validated to sum to $100$), or trigger the **Payment Lifecycle Demo Simulator**.
- **Sandbox Lab (`/demo-lab`):** Create real PayPal Sandbox invoices via `POST /v2/invoicing/invoices`, provision the **10-Invoice Multi-Currency Judge Portfolio (`USD` / `EUR` / `INR`)**, or purge `DEMO` fixtures cleanly without affecting real `PAYPAL_SANDBOX` records.
- **Account & PayPal Keys (`/profile`):** Manage your merchant identity, switch your default ledger currency (`USD`, `EUR`, `INR`), connect/disconnect your own PayPal REST API `Client ID` & `Secret`, inspect account security logs, or sign out.