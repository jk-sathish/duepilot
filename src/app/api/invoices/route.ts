import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scoreInvoices, calculateOverdueDays } from '@/lib/recovery/scoring';
import { evaluateReminderPolicy } from '@/lib/recovery/policy';

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        proposals: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { issueDate: 'desc' },
    });

    const now = new Date();
    const scoreMap = scoreInvoices(invoices, now);

    const enriched = invoices
      .map((inv) => {
        const breakdown = scoreMap.get(inv.id);
        const executedReminders = inv.proposals.filter(
          (p) => p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
        );
        const lastExecuted = executedReminders[0] || null;
        const lastRemindedAt = lastExecuted?.executedAt || null;

        const policy = evaluateReminderPolicy(inv.status, lastRemindedAt, now);
        const overdueDays = calculateOverdueDays(inv.dueDate, inv.status, now);

        let daysUntilDue: number | null = null;
        if (inv.dueDate) {
          daysUntilDue = Math.ceil(
            (new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        let cooldownDaysLeft = 0;
        let cooldownEndsAt: string | null = null;
        if (lastRemindedAt && policy.reminderHistoryStatus === 'RECENTLY_REMINDED') {
          const endMs = new Date(lastRemindedAt).getTime() + 3 * 24 * 60 * 60 * 1000;
          cooldownEndsAt = new Date(endMs).toISOString();
          cooldownDaysLeft = Math.max(
            1,
            Math.ceil((endMs - now.getTime()) / (1000 * 60 * 60 * 24))
          );
        }

        return {
          id: inv.id,
          paypalId: inv.paypalId,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName || 'Unknown Customer',
          customerEmail: inv.customerEmail || 'buyer@example.test',
          amount: Number(inv.amount) || 0,
          currency: inv.currency || 'USD',
          status: inv.status,
          issueDate: inv.issueDate.toISOString(),
          dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
          lastSyncedAt: inv.lastSyncedAt ? inv.lastSyncedAt.toISOString() : null,
          source: inv.source,
          overdueDays,
          daysUntilDue,
          isOverdue: overdueDays > 0,
          priorityScore: breakdown?.totalScore ?? 0,
          priorityBand: breakdown?.priorityBand ?? 'LOW',
          priorityExplanation: breakdown?.explanation ?? '',
          factors: {
            overdueScore: breakdown?.factors?.overdueScore ?? 0,
            valueScore: breakdown?.factors?.valueScore ?? 0,
            escalationScore: breakdown?.factors?.escalationScore ?? 0,
          },
          valueRatioPercent: breakdown?.valueRatioPercent ?? 0,
          priorRemindersCount: breakdown?.priorRemindersCount ?? executedReminders.length,
          eligibleForReminder: policy.eligibleForReminder,
          policyReason: policy.reason,
          reminderHistoryStatus: policy.reminderHistoryStatus,
          lastRemindedAt: lastRemindedAt ? lastRemindedAt.toISOString() : null,
          cooldownDaysLeft,
          cooldownEndsAt,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error('Invoices GET Error:', error);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}