import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPayPalAccessToken } from '@/lib/paypal/client';

const PAYPAL_BASE_URL = process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com';

async function tryCreateRealPayPalDraft(
  accessToken: string,
  invNum: string,
  customerName: string,
  customerEmail: string,
  amount: number,
  currency: string,
  dueDateObj: Date
): Promise<string | null> {
  try {
    const nowStr = new Date().toISOString().split('T')[0];
    const dueStr = dueDateObj.toISOString().split('T')[0];
    const [givenName, ...rest] = customerName.split(' ');
    const surname = rest.join(' ') || 'Account';

    const res = await fetch(`${PAYPAL_BASE_URL}/v2/invoicing/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        detail: {
          invoice_number: invNum,
          currency_code: currency,
          invoice_date: nowStr,
          payment_term: { due_date: dueStr },
          note: 'DuePilot Receivables Portfolio Invoice',
        },
        primary_recipients: [
          {
            billing_info: {
              name: { given_name: givenName, surname },
              email_address: customerEmail,
            },
          },
        ],
        items: [
          {
            name: 'Enterprise Cloud & Advisory Services',
            quantity: '1',
            unit_amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const href: string =
      data.href || data.links?.find((l: any) => l.rel === 'self')?.href || '';
    return data.id || href.split('/').pop() || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { issueDate: 'desc' },
    });

    const sandboxCount = invoices.filter((i) => i.source === 'PAYPAL_SANDBOX').length;
    const fixtureCount = invoices.filter((i) => i.source === 'DEMO').length;

    return NextResponse.json({
      sandboxCount,
      fixtureCount,
      invoices: invoices.map((i) => ({
        id: i.id,
        paypalId: i.paypalId,
        invoiceNumber: i.invoiceNumber,
        customerName: i.customerName,
        customerEmail: i.customerEmail,
        amount: Number(i.amount) || 0,
        currency: i.currency,
        status: i.status,
        dueDate: i.dueDate ? i.dueDate.toISOString() : null,
        source: i.source,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || '');
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // 1. Seed Comprehensive Judge Portfolio (USD, EUR, INR + Proposals + Cooldown + Audit Trail)
    if (action === 'SEED_JUDGE_PORTFOLIO' || action === 'SEED_FIXTURES') {
      let accessToken: string | null = null;
      if (action === 'SEED_JUDGE_PORTFOLIO') {
        try {
          accessToken = await getPayPalAccessToken();
        } catch {
          accessToken = null;
        }
      }

      const portfolioSpecs = [
        // --- USD PORTFOLIO ---
        {
          fallbackId: 'DEMO-INV-0007',
          invoiceNumber: '0007',
          customerName: 'Northwind Traders',
          customerEmail: 'ap@northwind.test',
          amount: 2400.0,
          currency: 'USD',
          status: 'SENT',
          issueDaysAgo: 35,
          dueOffsetDays: -18, // 18 days overdue (15-30d bucket, CRITICAL)
          tryRealSandbox: true,
          proposalSpec: {
            state: 'PENDING',
            source: 'GEMINI',
            edited: true,
            subject: 'Overdue Notice — Invoice #0007 (USD 2,400.00)',
            originalMessage:
              'Hello Northwind team,\n\nThis is a reminder that Invoice #0007 for USD 2,400.00 is now 18 days past due. Please arrange payment via PayPal at your earliest convenience.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            proposedMessage:
              'Hello Northwind team,\n\nI hope you are well. This is a polite follow-up that Invoice #0007 for USD 2,400.00 (due 18 days ago) remains open on your account. Could you please arrange settlement via the PayPal invoice link or share the expected payment date?\n\nIf payment is already in transit, please disregard this note with our thanks.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            aiExplanation:
              'CRITICAL priority (84/100): 18 days past due with substantial USD exposure. Eligible immediately (no reminder sent in the last 3 days).',
          },
        },
        {
          fallbackId: 'DEMO-INV-0008',
          invoiceNumber: '0008',
          customerName: 'Bluebird Studio',
          customerEmail: 'billing@bluebird.test',
          amount: 1250.0,
          currency: 'USD',
          status: 'SENT',
          issueDaysAgo: 24,
          dueOffsetDays: -10, // 10 days overdue (8-14d bucket, HIGH)
          tryRealSandbox: false,
          proposalSpec: {
            state: 'PENDING',
            source: 'GEMINI',
            edited: false,
            subject: 'Payment Reminder — Invoice #0008 (USD 1,250.00)',
            originalMessage:
              'Hello Bluebird team,\n\nFollowing up on Invoice #0008 for USD 1,250.00, which is currently 10 days overdue. Please remit payment via PayPal or let us know if you need the invoice resent.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            proposedMessage:
              'Hello Bluebird team,\n\nFollowing up on Invoice #0008 for USD 1,250.00, which is currently 10 days overdue. Please remit payment via PayPal or let us know if you need the invoice resent.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            aiExplanation:
              'HIGH priority (62/100): 10 days overdue in the 8–14 day ageing bucket with no prior follow-ups.',
          },
        },
        {
          fallbackId: 'DEMO-INV-0011',
          invoiceNumber: '0011',
          customerName: 'Stratos Cloud Corp',
          customerEmail: 'finance@stratoscloud.test',
          amount: 3850.0,
          currency: 'USD',
          status: 'SENT',
          issueDaysAgo: 48,
          dueOffsetDays: -34, // 34 days overdue (30+d bucket, CRITICAL, Cooldown Protected!)
          tryRealSandbox: false,
          proposalSpec: {
            state: 'EXECUTED',
            source: 'GEMINI',
            edited: false,
            executedHoursAgo: 22, // Sent 22 hours ago -> Protected by 3-day cooldown!
            paypalDebugId: 'pp-dbg-9941a8c',
            subject: 'Urgent Escalation — Invoice #0011 (USD 3,850.00)',
            originalMessage:
              'Hello Stratos Finance,\n\nInvoice #0011 for USD 3,850.00 is now 34 days overdue. Please confirm wire or PayPal settlement today.\n\nRegards,\nAccounts Team, DuePilot Studio',
            proposedMessage:
              'Hello Stratos Finance,\n\nInvoice #0011 for USD 3,850.00 is now 34 days overdue. Please confirm wire or PayPal settlement today.\n\nRegards,\nAccounts Team, DuePilot Studio',
            aiExplanation:
              'CRITICAL priority (95/100): Largest USD exposure and >30 days overdue. Currently protected by 3-day cooldown after yesterday’s reminder.',
          },
        },
        {
          fallbackId: 'DEMO-INV-0009',
          invoiceNumber: '0009',
          customerName: 'Apex Horizon LLC',
          customerEmail: 'finance@apexhorizon.test',
          amount: 950.0,
          currency: 'USD',
          status: 'SENT',
          issueDaysAgo: 12,
          dueOffsetDays: 2, // Due in 2 days (Proactive upcoming bucket)
          tryRealSandbox: false,
          proposalSpec: null,
        },
        {
          fallbackId: 'DEMO-INV-0005',
          invoiceNumber: '0005',
          customerName: 'Delta Labs',
          customerEmail: 'pay@deltalabs.test',
          amount: 1800.0,
          currency: 'USD',
          status: 'PAID',
          issueDaysAgo: 28,
          dueOffsetDays: -12, // Paid after reminder!
          tryRealSandbox: false,
          proposalSpec: {
            state: 'EXECUTED',
            source: 'GEMINI',
            edited: false,
            executedHoursAgo: 96,
            paypalDebugId: 'pp-dbg-7720f1b',
            subject: 'Payment Reminder — Invoice #0005 (USD 1,800.00)',
            originalMessage:
              'Hello Delta Labs,\n\nFriendly reminder regarding Invoice #0005 for USD 1,800.00. Thank you!\n\nKind regards,\nAccounts Team',
            proposedMessage:
              'Hello Delta Labs,\n\nFriendly reminder regarding Invoice #0005 for USD 1,800.00. Thank you!\n\nKind regards,\nAccounts Team',
            aiExplanation: 'Reminded 4 days ago; customer settled USD 1,800.00 26 hours later.',
          },
        },

        // --- EUR PORTFOLIO ---
        {
          fallbackId: 'DEMO-INV-EUR-01',
          invoiceNumber: 'EU-201',
          customerName: 'Berlin Digital GmbH',
          customerEmail: 'buchhaltung@berlindigital.test',
          amount: 3200.0,
          currency: 'EUR',
          status: 'SENT',
          issueDaysAgo: 29,
          dueOffsetDays: -14, // 14 days overdue in EUR
          tryRealSandbox: false,
          proposalSpec: {
            state: 'PENDING',
            source: 'GEMINI',
            edited: false,
            subject: 'Payment Reminder — Invoice #EU-201 (EUR 3,200.00)',
            originalMessage:
              'Hello Berlin Digital team,\n\nThis is a polite reminder that Invoice #EU-201 for EUR 3,200.00 is 14 days overdue. Please let us know the scheduled settlement date.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            proposedMessage:
              'Hello Berlin Digital team,\n\nThis is a polite reminder that Invoice #EU-201 for EUR 3,200.00 is 14 days overdue. Please let us know the scheduled settlement date.\n\nKind regards,\nAccounts Team, DuePilot Studio',
            aiExplanation:
              'CRITICAL EUR exposure (82/100): Largest open EUR invoice at 14 days past due.',
          },
        },
        {
          fallbackId: 'DEMO-INV-EUR-02',
          invoiceNumber: 'EU-204',
          customerName: 'Nordic Lumina AB',
          customerEmail: 'ap@nordiclumina.test',
          amount: 1450.0,
          currency: 'EUR',
          status: 'SENT',
          issueDaysAgo: 18,
          dueOffsetDays: -4, // 4 days overdue in EUR
          tryRealSandbox: false,
          proposalSpec: null,
        },

        // --- INR PORTFOLIO ---
        {
          fallbackId: 'DEMO-INV-INR-01',
          invoiceNumber: 'IN-104',
          customerName: 'Zoho FinTech India Pvt Ltd',
          customerEmail: 'ap@zohofintech.test',
          amount: 145000.0,
          currency: 'INR',
          status: 'SENT',
          issueDaysAgo: 32,
          dueOffsetDays: -16, // 16 days overdue in INR
          tryRealSandbox: false,
          proposalSpec: {
            state: 'PENDING',
            source: 'GEMINI',
            edited: false,
            subject: 'Payment Reminder — Invoice #IN-104 (INR 1,45,000.00)',
            originalMessage:
              'Hello Zoho FinTech team,\n\nI hope you are doing well. Invoice #IN-104 for INR 145,000.00 is now 16 days past its due date. Could you please process the settlement or share the UTR/PayPal reference?\n\nWarm regards,\nAccounts Team, DuePilot Studio',
            proposedMessage:
              'Hello Zoho FinTech team,\n\nI hope you are doing well. Invoice #IN-104 for INR 145,000.00 is now 16 days past its due date. Could you please process the settlement or share the UTR/PayPal reference?\n\nWarm regards,\nAccounts Team, DuePilot Studio',
            aiExplanation:
              'CRITICAL INR priority (88/100): 16 days overdue and highest INR receivable in portfolio.',
          },
        },
        {
          fallbackId: 'DEMO-INV-INR-02',
          invoiceNumber: 'IN-108',
          customerName: 'Bengaluru Cloud Works',
          customerEmail: 'accounts@blrcloud.test',
          amount: 68500.0,
          currency: 'INR',
          status: 'SENT',
          issueDaysAgo: 19,
          dueOffsetDays: -6, // 6 days overdue in INR
          tryRealSandbox: false,
          proposalSpec: {
            state: 'REJECTED',
            source: 'FALLBACK',
            edited: false,
            subject: 'Payment Reminder — Invoice #IN-108 (INR 68,500.00)',
            originalMessage:
              'Hello Bengaluru Cloud team,\n\nReminder that Invoice #IN-108 for INR 68,500.00 is 6 days overdue.\n\nRegards,\nAccounts Team',
            proposedMessage:
              'Hello Bengaluru Cloud team,\n\nReminder that Invoice #IN-108 for INR 68,500.00 is 6 days overdue.\n\nRegards,\nAccounts Team',
            aiExplanation:
              'MEDIUM INR priority (58/100): Operator rejected draft because client already confirmed Friday NEFT/PayPal transfer.',
          },
        },
        {
          fallbackId: 'DEMO-INV-INR-03',
          invoiceNumber: 'IN-112',
          customerName: 'Chennai Harbor Logistics',
          customerEmail: 'treasury@chennaiharbor.test',
          amount: 42000.0,
          currency: 'INR',
          status: 'SENT',
          issueDaysAgo: 10,
          dueOffsetDays: 2, // Due in 2 days in INR
          tryRealSandbox: false,
          proposalSpec: null,
        },
      ];

      let realSandboxCreated = 0;

      for (const spec of portfolioSpecs) {
        const issueDate = new Date(now.getTime() - spec.issueDaysAgo * dayMs);
        const dueDate = new Date(now.getTime() + spec.dueOffsetDays * dayMs);

        let finalPaypalId = spec.fallbackId;
        let finalSource: 'PAYPAL_SANDBOX' | 'DEMO' = 'DEMO';

        if (accessToken && spec.tryRealSandbox) {
          const createdId = await tryCreateRealPayPalDraft(
            accessToken,
            spec.invoiceNumber,
            spec.customerName,
            spec.customerEmail,
            spec.amount,
            spec.currency,
            dueDate
          );
          if (createdId) {
            finalPaypalId = createdId;
            finalSource = 'PAYPAL_SANDBOX';
            realSandboxCreated++;
          }
        }

        const upsertedInvoice = await prisma.invoice.upsert({
          where: { paypalId: finalPaypalId },
          update: {
            invoiceNumber: spec.invoiceNumber,
            customerName: spec.customerName,
            customerEmail: spec.customerEmail,
            amount: spec.amount,
            currency: spec.currency,
            status: spec.status,
            rawStatus: spec.status,
            issueDate,
            dueDate,
            lastSyncedAt: now,
            source: finalSource,
          },
          create: {
            paypalId: finalPaypalId,
            invoiceNumber: spec.invoiceNumber,
            customerName: spec.customerName,
            customerEmail: spec.customerEmail,
            amount: spec.amount,
            currency: spec.currency,
            status: spec.status,
            rawStatus: spec.status,
            issueDate,
            dueDate,
            lastSyncedAt: now,
            source: finalSource,
          },
        });

        // Create linked Proposal & Audit Logs if specified and none exist yet for this invoice
        if (spec.proposalSpec) {
          const existingProps = await prisma.actionProposal.count({
            where: { invoiceId: upsertedInvoice.id },
          });

          if (existingProps === 0) {
            const pSpec = spec.proposalSpec;
            const executedAt = pSpec.executedHoursAgo
              ? new Date(now.getTime() - pSpec.executedHoursAgo * 60 * 60 * 1000)
              : null;

            const createdProp = await prisma.actionProposal.create({
              data: {
                invoiceId: upsertedInvoice.id,
                actionType: 'SEND_REMINDER',
                proposedMessage: pSpec.proposedMessage,
                aiExplanation: pSpec.aiExplanation,
                priority: spec.dueOffsetDays < -14 ? 85 : 64,
                state: pSpec.state,
                approvedAt: executedAt,
                executedAt,
                paypalReference: pSpec.paypalDebugId || null,
              },
            });

            await prisma.activityLog.create({
              data: {
                invoiceId: upsertedInvoice.id,
                proposalId: createdProp.id,
                eventType: 'PROPOSAL_CREATED',
                status: 'SUCCESS',
                description: `AI generated reminder proposal for Invoice #${spec.invoiceNumber} (${spec.currency} ${spec.amount.toLocaleString()}).`,
                metadata: {
                  actor: pSpec.source === 'FALLBACK' ? 'system' : 'gemini',
                  source: pSpec.source,
                  originalMessage: pSpec.originalMessage,
                  subject: pSpec.subject,
                },
              },
            });

            if (pSpec.edited) {
              await prisma.activityLog.create({
                data: {
                  invoiceId: upsertedInvoice.id,
                  proposalId: createdProp.id,
                  eventType: 'PROPOSAL_EDITED',
                  status: 'SUCCESS',
                  description: `Operator refined reminder wording for Invoice #${spec.invoiceNumber} prior to approval.`,
                  metadata: {
                    actor: 'demo-operator',
                    originalMessage: pSpec.originalMessage,
                    subject: pSpec.subject,
                  },
                },
              });
            }

            if (pSpec.state === 'EXECUTED' && executedAt) {
              await prisma.activityLog.create({
                data: {
                  invoiceId: upsertedInvoice.id,
                  proposalId: createdProp.id,
                  eventType: 'REMINDER_SENT',
                  status: 'SUCCESS',
                  description: `PayPal Debug-Id ${pSpec.paypalDebugId} · approved by demo-operator`,
                  createdAt: executedAt,
                  metadata: {
                    actor: 'demo-operator',
                    paypalDebugId: pSpec.paypalDebugId,
                  },
                },
              });
            }

            if (spec.status === 'PAID' && executedAt) {
              await prisma.activityLog.create({
                data: {
                  invoiceId: upsertedInvoice.id,
                  proposalId: createdProp.id,
                  eventType: 'WEBHOOK_RECEIVED',
                  status: 'SUCCESS',
                  description: `Payment observed for Invoice #${spec.invoiceNumber} (USD ${spec.amount.toFixed(
                    2
                  )}) 26 hours after reminder.`,
                  createdAt: new Date(executedAt.getTime() + 26 * 60 * 60 * 1000),
                  metadata: {
                    actor: 'demo-simulator',
                  },
                },
              });
            }
          }
        }
      }

      await prisma.activityLog.create({
        data: {
          eventType: 'DEMO_FIXTURES_LOADED',
          status: 'SUCCESS',
          description: `Provisioned 10-invoice multi-currency Judge Portfolio (USD, EUR, INR) with AI proposals, diffs, and cooldown states (${realSandboxCreated} live Sandbox draft created).`,
          metadata: {
            actor: 'demo-operator',
            totalProvisioned: portfolioSpecs.length,
            realSandboxCreated,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Provisioned 10 multi-currency invoices across USD ($), EUR (€), and INR (₹) with active AI proposals, before/after diffs, cooldown protection, and audit history!`,
      });
    }

    // 2. Purge ONLY Demo Fixtures (Never touches real PAYPAL_SANDBOX records)
    if (action === 'CLEAR_FIXTURES') {
      const deleted = await prisma.invoice.deleteMany({
        where: { source: 'DEMO' },
      });

      await prisma.activityLog.create({
        data: {
          eventType: 'DEMO_FIXTURES_CLEARED',
          status: 'SUCCESS',
          description: `Purged ${deleted.count} isolated DEMO fixture invoice(s). All real PayPal Sandbox records preserved.`,
          metadata: { actor: 'demo-operator', deletedCount: deleted.count },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Removed ${deleted.count} DEMO fixture(s). Your real PayPal Sandbox invoices remain untouched.`,
      });
    }

    // 3. Create a Real PayPal Sandbox Draft Invoice via PayPal Invoicing v2 API
    if (action === 'CREATE_SANDBOX_INVOICE') {
      const customerName = String(body.customerName || 'Northwind Traders').trim();
      const customerEmail = String(body.customerEmail || 'buyer@example.test').trim();
      const amount = Number(body.amount || 1200);
      const currency = String(body.currency || 'USD').toUpperCase();
      const dueOffsetDays = Number(body.dueOffsetDays ?? 3);

      const dueDateObj = new Date(now.getTime() + dueOffsetDays * dayMs);
      const invoiceDateStr = now.toISOString().split('T')[0];
      const dueDateStr = dueDateObj.toISOString().split('T')[0];
      const invNum = `DP-${Math.floor(1000 + Math.random() * 9000)}`;

      const [givenName, ...restName] = customerName.split(' ');
      const surname = restName.join(' ') || 'Client';

      const accessToken = await getPayPalAccessToken();
      const createRes = await fetch(`${PAYPAL_BASE_URL}/v2/invoicing/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detail: {
            invoice_number: invNum,
            currency_code: currency,
            invoice_date: invoiceDateStr,
            payment_term: {
              due_date: dueDateStr,
            },
            note: 'Created from DuePilot Sandbox Scenario Generator.',
          },
          primary_recipients: [
            {
              billing_info: {
                name: { given_name: givenName, surname },
                email_address: customerEmail,
              },
            },
          ],
          items: [
            {
              name: 'Advisory & Retainer Services',
              quantity: '1',
              unit_amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
            },
          ],
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(
          `PayPal Sandbox draft creation failed (HTTP ${createRes.status}): ${errText.slice(0, 160)}`
        );
      }

      const createdPayload = await createRes.json();
      const href: string =
        createdPayload.href ||
        createdPayload.links?.find((l: any) => l.rel === 'self')?.href ||
        '';
      const paypalId = createdPayload.id || href.split('/').pop() || `INV2-${Date.now()}`;

      const saved = await prisma.invoice.upsert({
        where: { paypalId },
        update: {
          invoiceNumber: invNum,
          customerName,
          customerEmail,
          amount,
          currency,
          status: 'SENT',
          rawStatus: 'DRAFT_CREATED_IN_SANDBOX',
          issueDate: now,
          dueDate: dueDateObj,
          lastSyncedAt: now,
          source: 'PAYPAL_SANDBOX',
        },
        create: {
          paypalId,
          invoiceNumber: invNum,
          customerName,
          customerEmail,
          amount,
          currency,
          status: 'SENT',
          rawStatus: 'DRAFT_CREATED_IN_SANDBOX',
          issueDate: now,
          dueDate: dueDateObj,
          lastSyncedAt: now,
          source: 'PAYPAL_SANDBOX',
        },
      });

      await prisma.activityLog.create({
        data: {
          invoiceId: saved.id,
          eventType: 'INVOICE_SYNCED',
          status: 'SUCCESS',
          description: `Created real PayPal Sandbox invoice #${invNum} (${paypalId}) for ${currency} ${amount.toFixed(2)}.`,
          metadata: {
            actor: 'demo-operator',
            paypalId,
            source: 'PAYPAL_SANDBOX',
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Created real PayPal Sandbox invoice #${invNum} (ID: ${paypalId}) and synced into PostgreSQL.`,
      });
    }

    return NextResponse.json({ error: 'Unsupported Demo Lab action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Demo Lab POST Error:', error);
    return NextResponse.json(
      { error: error.message || 'Demo Lab operation failed.' },
      { status: 500 }
    );
  }
}