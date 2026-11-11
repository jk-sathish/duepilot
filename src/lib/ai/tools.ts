import { Type, FunctionDeclaration } from '@google/genai';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { scoreInvoices, calculateOverdueDays } from '@/lib/recovery/scoring';
import { evaluateReminderPolicy } from '@/lib/recovery/policy';
import { getAppSettings } from '@/lib/settings';

export async function getScoredInvoicesFromDb() {
  const [invoices, appSettings] = await Promise.all([
    prisma.invoice.findMany({
      include: {
        proposals: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { issueDate: 'desc' },
    }),
    getAppSettings(),
  ]);

  const now = new Date();
  const scoreMap = scoreInvoices(invoices, now, {
    overdueWeight: appSettings.weights.overdueWeight,
    valueWeight: appSettings.weights.valueWeight,
    escalationWeight: appSettings.weights.escalationWeight,
    cooldownDays: appSettings.policy.cooldownDays,
    proactiveUpcoming: appSettings.policy.proactiveUpcoming,
  });

  return invoices
    .map((inv) => {
      const breakdown = scoreMap.get(inv.id);
      const lastExecutedReminder = inv.proposals.find(
        (p) => p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
      );
      const activePendingProposal = inv.proposals.find((p) => p.state === 'PENDING');
      const policy = evaluateReminderPolicy(
        inv.status,
        lastExecutedReminder?.executedAt || null,
        now,
        { cooldownDays: appSettings.policy.cooldownDays }
      );
      const overdueDays = calculateOverdueDays(inv.dueDate, inv.status, now);

      return {
        id: inv.id,
        paypalId: inv.paypalId,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName || 'Unknown Customer',
        customerEmail: inv.customerEmail || 'No email on file',
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        overdueDays,
        isOverdue: overdueDays > 0,
        priorityScore: breakdown?.totalScore ?? 0,
        priorityBand: breakdown?.priorityBand ?? 'LOW',
        priorityExplanation: breakdown?.explanation ?? '',
        eligibleForReminder: policy.eligibleForReminder,
        policyReason: policy.reason,
        lastRemindedAt: lastExecutedReminder?.executedAt
          ? lastExecutedReminder.executedAt.toISOString()
          : null,
        hasPendingProposal: Boolean(activePendingProposal),
        pendingProposalId: activePendingProposal?.id || null,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

const CreateProposalSchema = z.object({
  invoiceId: z.string().min(1),
  proposedMessage: z.string().min(10),
  aiExplanation: z.string().min(10),
});

export const agentFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_receivables_summary',
    description:
      'Retrieve overall receivables metrics, total unpaid/overdue amounts, and ranked invoice summary from DuePilot.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'list_overdue_invoices',
    description:
      'List all unpaid and overdue invoices ranked by deterministic priority score, including reminder cooldown eligibility.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        onlyOverdue: {
          type: Type.BOOLEAN,
          description: 'If true, return only invoices where overdueDays > 0.',
        },
      },
    },
  },
  {
    name: 'get_invoice_details',
    description:
      'Get full details, priority score breakdown, and proposal history for a specific invoice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoiceIdOrNumber: {
          type: Type.STRING,
          description: 'The internal UUID, PayPal invoice ID, or invoice number.',
        },
      },
      required: ['invoiceIdOrNumber'],
    },
  },
  {
    name: 'create_action_proposal',
    description:
      'Create a PENDING payment reminder proposal for human review and approval. Never sends the reminder directly.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoiceId: {
          type: Type.STRING,
          description: 'The internal UUID (id field) of the invoice.',
        },
        proposedMessage: {
          type: Type.STRING,
          description: 'Polite, professional, grounded payment reminder note.',
        },
        aiExplanation: {
          type: Type.STRING,
          description: 'Concise explanation of why this invoice was prioritized.',
        },
      },
      required: ['invoiceId', 'proposedMessage', 'aiExplanation'],
    },
  },
];

export async function executeAgentTool(
  name: string,
  args: Record<string, any> | undefined
): Promise<any> {
  const scored = await getScoredInvoicesFromDb();

  if (name === 'get_receivables_summary') {
    const unpaid = scored.filter(
      (i) => !i.status.toUpperCase().includes('PAID') || i.status.toUpperCase().includes('UNPAID')
    );
    const overdue = unpaid.filter((i) => i.isOverdue);
    const totalOutstanding = unpaid.reduce((sum, i) => sum + i.amount, 0);
    const totalOverdue = overdue.reduce((sum, i) => sum + i.amount, 0);

    return {
      totalInvoices: scored.length,
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
      totalOutstandingAmount: totalOutstanding,
      totalOverdueAmount: totalOverdue,
      invoices: scored,
    };
  }

  if (name === 'list_overdue_invoices') {
    const onlyOverdue = Boolean(args?.onlyOverdue);
    const filtered = scored.filter((i) => {
      const isUnpaid =
        !i.status.toUpperCase().includes('PAID') || i.status.toUpperCase().includes('UNPAID');
      if (!isUnpaid) return false;
      return onlyOverdue ? i.isOverdue : true;
    });
    return { count: filtered.length, invoices: filtered };
  }

  if (name === 'get_invoice_details') {
    const query = String(args?.invoiceIdOrNumber || '')
      .trim()
      .toLowerCase();
    const match = scored.find(
      (i) =>
        i.id === query ||
        i.paypalId === query ||
        i.invoiceNumber.toLowerCase() === query
    );
    if (!match) return { error: `No invoice found matching "${query}".` };
    return match;
  }

  if (name === 'create_action_proposal') {
    const parsed = CreateProposalSchema.safeParse(args);
    if (!parsed.success) {
      return { error: 'Invalid proposal arguments', details: parsed.error.flatten() };
    }

    const { invoiceId, proposedMessage, aiExplanation } = parsed.data;
    const target = scored.find(
      (i) => i.id === invoiceId || i.invoiceNumber === invoiceId || i.paypalId === invoiceId
    );

    if (!target) return { error: `Invoice "${invoiceId}" not found.` };
    if (!target.eligibleForReminder) {
      return { created: false, reason: `Skipped proposal creation: ${target.policyReason}` };
    }

    const existingPending = await prisma.actionProposal.findFirst({
      where: { invoiceId: target.id, state: 'PENDING' },
    });

    if (existingPending) {
      const updated = await prisma.actionProposal.update({
        where: { id: existingPending.id },
        data: { proposedMessage, aiExplanation, priority: target.priorityScore },
      });
      return {
        created: true,
        updatedExisting: true,
        proposalId: updated.id,
        state: updated.state,
        priorityScore: target.priorityScore,
      };
    }

    const proposal = await prisma.actionProposal.create({
      data: {
        invoiceId: target.id,
        actionType: 'SEND_REMINDER',
        proposedMessage,
        aiExplanation,
        priority: target.priorityScore,
        state: 'PENDING',
      },
    });

    await prisma.activityLog.create({
      data: {
        invoiceId: target.id,
        proposalId: proposal.id,
        eventType: 'PROPOSAL_CREATED',
        status: 'PENDING',
        description: `AI created pending reminder proposal for Invoice #${target.invoiceNumber}.`,
        metadata: {
          priorityScore: target.priorityScore,
          priorityBand: target.priorityBand,
          overdueDays: target.overdueDays,
          originalMessage: proposedMessage,
        },
      },
    });

    return { created: true, proposalId: proposal.id, state: 'PENDING' };
  }

  return { error: `Unknown tool: ${name}` };
}