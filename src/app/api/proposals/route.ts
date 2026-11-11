import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scoreInvoices, calculateOverdueDays } from '@/lib/recovery/scoring';
import { evaluateReminderPolicy } from '@/lib/recovery/policy';

export async function GET() {
  try {
    const [invoices, proposals] = await Promise.all([
      prisma.invoice.findMany({
        include: {
          proposals: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.actionProposal.findMany({
        include: {
          invoice: true,
          activityLogs: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const now = new Date();
    const scoreMap = scoreInvoices(invoices, now);
    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    const enriched = proposals.map((prop) => {
      const fullInv = invoiceMap.get(prop.invoiceId);
      const breakdown = scoreMap.get(prop.invoiceId);

      const executedReminders = (fullInv?.proposals || []).filter(
        (p) => p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
      );
      const lastExecuted = executedReminders[0] || null;
      const policy = evaluateReminderPolicy(
        prop.invoice?.status || 'SENT',
        lastExecuted?.executedAt || null,
        now
      );
      const overdueDays = calculateOverdueDays(
        prop.invoice?.dueDate || null,
        prop.invoice?.status || 'SENT',
        now
      );

      // Extract provenance and edit history from activity logs
      const creationLog = prop.activityLogs.find((l) => l.eventType === 'PROPOSAL_CREATED');
      const editLog = prop.activityLogs.find((l) => l.eventType === 'PROPOSAL_EDITED');
      const creationMeta = (creationLog?.metadata as Record<string, any>) || {};
      const editMeta = (editLog?.metadata as Record<string, any>) || {};

      const source: 'GEMINI' | 'FALLBACK' =
        creationMeta.source === 'FALLBACK' ? 'FALLBACK' : 'GEMINI';
      const originalMessage =
        editMeta.originalMessage || creationMeta.originalMessage || prop.proposedMessage;
      const subject =
        editMeta.subject ||
        creationMeta.subject ||
        `Payment reminder — Invoice #${prop.invoice?.invoiceNumber || ''}`;

      return {
        id: prop.id,
        invoiceId: prop.invoiceId,
        actionType: prop.actionType,
        subject,
        proposedMessage: prop.proposedMessage,
        originalMessage,
        editedByOperator: Boolean(editLog),
        source,
        aiExplanation: prop.aiExplanation,
        priority: Number(prop.priority) || breakdown?.totalScore || 0,
        priorityBand: breakdown?.priorityBand || 'MEDIUM',
        state: prop.state,
        createdAt: prop.createdAt.toISOString(),
        executedAt: prop.executedAt ? prop.executedAt.toISOString() : null,
        paypalReference: prop.paypalReference,
        factors: {
          overdueScore: breakdown?.factors?.overdueScore ?? 0,
          valueScore: breakdown?.factors?.valueScore ?? 0,
          escalationScore: breakdown?.factors?.escalationScore ?? 0,
        },
        overdueDays,
        priorRemindersCount: breakdown?.priorRemindersCount ?? executedReminders.length,
        eligibleForReminder: policy.eligibleForReminder,
        policyReason: policy.reason,
        invoice: prop.invoice
          ? {
              id: prop.invoice.id,
              paypalId: prop.invoice.paypalId,
              invoiceNumber: prop.invoice.invoiceNumber,
              customerName: prop.invoice.customerName || 'Unknown Customer',
              customerEmail: prop.invoice.customerEmail || 'buyer@example.test',
              amount: Number(prop.invoice.amount) || 0,
              currency: prop.invoice.currency || 'USD',
              status: prop.invoice.status,
              dueDate: prop.invoice.dueDate ? prop.invoice.dueDate.toISOString() : null,
            }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error('Proposals GET Error:', error);
    return NextResponse.json({ error: 'Failed to load proposals' }, { status: 500 });
  }
}