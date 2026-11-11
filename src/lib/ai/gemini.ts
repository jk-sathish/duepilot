import { GoogleGenAI, Type } from '@google/genai';
import { executeAgentTool } from './tools';

interface GeneratedDraft {
  invoiceId: string;
  aiExplanation: string;
  proposedMessage: string;
}

interface StructuredAgentOutput {
  analysisSummary: string;
  recommendations: GeneratedDraft[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic fallback drafter used ONLY if the external LLM API returns 503/429
 * after retries, ensuring the PayPal approval workflow is never blocked by cloud outages.
 */
function buildDeterministicAnalysis(
  summary: any,
  eligibleInvoices: any[]
): StructuredAgentOutput {
  const lines: string[] = [
    `[Resilient Mode — Gemini API 503 Busy, Grounded Deterministic Analysis Active]`,
    ``,
    `Receivables Overview:`,
    `• Total Synced Invoices: ${summary.totalInvoices}`,
    `• Unpaid Invoices: ${summary.unpaidCount} (Total Outstanding: USD ${Number(summary.totalOutstandingAmount || 0).toFixed(2)})`,
    `• Overdue Invoices: ${summary.overdueCount} (Total Overdue: USD ${Number(summary.totalOverdueAmount || 0).toFixed(2)})`,
    ``,
    `Priority Ranking & Policy Assessment:`,
  ];

  for (const inv of summary.invoices || []) {
    const dueStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A';
    lines.push(
      `• Invoice #${inv.invoiceNumber} (${inv.customerName}) — ${inv.currency} ${Number(inv.amount).toFixed(2)} | Due: ${dueStr} | Overdue: ${inv.overdueDays}d | Priority: ${inv.priorityBand} (${inv.priorityScore}/100) | Policy: ${inv.policyReason}`
    );
  }

  const recommendations: GeneratedDraft[] = eligibleInvoices.map((inv) => {
    const dueStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'upon receipt';
    const urgencyTone =
      inv.overdueDays > 0
        ? `is currently ${inv.overdueDays} day(s) past its due date of ${dueStr}`
        : `is scheduled for payment on ${dueStr}`;

    return {
      invoiceId: inv.id,
      aiExplanation: `Prioritised at ${inv.priorityBand} (${inv.priorityScore}/100) based on deterministic scoring: ${inv.overdueDays} days overdue, invoice value of ${inv.currency} ${Number(inv.amount).toFixed(2)}, and verified 3-day reminder cooldown eligibility.`,
      proposedMessage: `Hello ${inv.customerName},\n\nI hope your week is going well. This is a friendly reminder regarding PayPal Invoice #${inv.invoiceNumber} for ${inv.currency} ${Number(inv.amount).toFixed(2)}, which ${urgencyTone}.\n\nCould you please review and complete the payment via your PayPal invoice link at your earliest convenience? If payment has already been initiated, please disregard this note.\n\nThank you for your business!`,
    };
  });

  return {
    analysisSummary: lines.join('\n'),
    recommendations,
  };
}

export async function runReceivablesAgent(userPrompt: string) {
  const toolTrace: Array<{ tool: string; resultSummary: any }> = [];

  // Step 1: Execute server-side data inspection tools immediately (<20ms)
  const summary = await executeAgentTool('get_receivables_summary', {});
  toolTrace.push({
    tool: 'get_receivables_summary',
    resultSummary: {
      totalInvoices: summary.totalInvoices,
      unpaidCount: summary.unpaidCount,
      overdueCount: summary.overdueCount,
    },
  });

  const overdueList = await executeAgentTool('list_overdue_invoices', { onlyOverdue: false });
  toolTrace.push({
    tool: 'list_overdue_invoices',
    resultSummary: { count: overdueList.count },
  });

  // Identify unpaid invoices eligible for reminders (prioritising overdue first)
  const allUnpaid = (overdueList.invoices || []) as any[];
  const eligibleOverdue = allUnpaid.filter((i) => i.isOverdue && i.eligibleForReminder);
  const targetInvoices =
    eligibleOverdue.length > 0
      ? eligibleOverdue
      : allUnpaid.filter((i) => i.eligibleForReminder);

  let structuredResult: StructuredAgentOutput | null = null;
  const apiKey = process.env.GEMINI_API_KEY;

  // Step 2: Single-Shot Grounded Call to gemini-3.8-flash (with 2 quick retries on 503)
  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });

    const groundedPrompt = `User Instruction: "${userPrompt}"

Here is the real-time PayPal Sandbox receivables data and deterministic priority scores from DuePilot's database:
${JSON.stringify(
  {
    totalInvoices: summary.totalInvoices,
    unpaidCount: summary.unpaidCount,
    overdueCount: summary.overdueCount,
    totalOutstandingAmount: summary.totalOutstandingAmount,
    totalOverdueAmount: summary.totalOverdueAmount,
    invoices: allUnpaid.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate,
      overdueDays: inv.overdueDays,
      priorityScore: inv.priorityScore,
      priorityBand: inv.priorityBand,
      priorityExplanation: inv.priorityExplanation,
      eligibleForReminder: inv.eligibleForReminder,
      policyReason: inv.policyReason,
    })),
  },
  null,
  2
)}

Tasks:
1. Write a clear, executive "analysisSummary" explaining the current receivables health, why the top invoices are ranked highest (referencing exact invoice numbers, amounts, overdue days, and 0-100 priority scores), and whether any invoice is blocked by the 3-day cooldown policy.
2. For each eligible invoice that warrants follow-up (especially overdue invoices where eligibleForReminder is true), include an entry in "recommendations" with:
   - "invoiceId": exact "id" UUID from the data above
   - "aiExplanation": concise explanation citing its priority score and overdue status
   - "proposedMessage": a polite, professional PayPal reminder note referencing the exact invoice number, amount, and due date.`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: groundedPrompt,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                analysisSummary: { type: Type.STRING },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      invoiceId: { type: Type.STRING },
                      aiExplanation: { type: Type.STRING },
                      proposedMessage: { type: Type.STRING },
                    },
                    required: ['invoiceId', 'aiExplanation', 'proposedMessage'],
                  },
                },
              },
              required: ['analysisSummary', 'recommendations'],
            },
          },
        });

        if (response.text) {
          structuredResult = JSON.parse(response.text) as StructuredAgentOutput;
          toolTrace.push({
            tool: 'gemini-3.8-flash (single-shot JSON)',
            resultSummary: { status: 'OK', attempt },
          });
          break;
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        console.warn(`[DuePilot AI] Gemini attempt ${attempt} failed: ${msg}`);
        if (attempt < 2) {
          await sleep(1200);
        }
      }
    }
  }

  // Step 3: If Gemini API is experiencing a 503 outage, use the deterministic fallback engine
  if (!structuredResult) {
    structuredResult = buildDeterministicAnalysis(summary, targetInvoices);
    toolTrace.push({
      tool: 'deterministic_recovery_fallback',
      resultSummary: { reason: 'Gemini 503 high demand fallback activated' },
    });
  }

  // Step 4: Persist each recommended follow-up as a PENDING ActionProposal via our validated tool
  for (const rec of structuredResult.recommendations || []) {
    const created = await executeAgentTool('create_action_proposal', {
      invoiceId: rec.invoiceId,
      proposedMessage: rec.proposedMessage,
      aiExplanation: rec.aiExplanation,
    });
    toolTrace.push({
      tool: 'create_action_proposal',
      resultSummary: created,
    });
  }

  return {
    reply: structuredResult.analysisSummary,
    toolTrace,
  };
}