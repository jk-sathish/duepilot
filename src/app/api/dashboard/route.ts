import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scoreInvoices, calculateOverdueDays } from '@/lib/recovery/scoring';
import { evaluateReminderPolicy } from '@/lib/recovery/policy';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedCurrency = (searchParams.get('currency') || 'USD').toUpperCase();

    const allInvoices = await prisma.invoice.findMany({
      include: {
        proposals: { orderBy: { createdAt: 'desc' } },
        activityLogs: { orderBy: { createdAt: 'desc' } },
      },
    });

const currencySet = new Set<string>(['USD', 'EUR', 'INR']);
    allInvoices.forEach((inv) => {
      if (inv.currency) currencySet.add(inv.currency.toUpperCase());
    });
    const availableCurrencies = Array.from(currencySet);

    const invoices = allInvoices.filter(
      (inv) => (inv.currency || 'USD').toUpperCase() === requestedCurrency
    );

    const now = new Date();
    const scoreMap = scoreInvoices(invoices, now);

    let outstanding = 0;
    let overdue = 0;
    let dueIn3Days = 0;
    let unpaidCount = 0;
    let overdueCount = 0;
    let dueIn3DaysCount = 0;
    let cooldownCount = 0;
    let eligibleCount = 0;

    let remindedInvoicesCount = 0;
    let paidAfterReminderCount = 0;
    let paidAfterReminderAmount = 0;
    const paymentDurationsHours: number[] = [];

    const aging = {
      notDue: { amount: 0, count: 0 },
      days1_7: { amount: 0, count: 0 },
      days8_14: { amount: 0, count: 0 },
      days15_30: { amount: 0, count: 0 },
      days30Plus: { amount: 0, count: 0 },
    };

    const priorityMix = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const actionQueue: any[] = [];

    invoices.forEach((inv) => {
      const upperStatus = (inv.status || '').toUpperCase();
      const isPaid =
        upperStatus.includes('PAID') &&
        !upperStatus.includes('UNPAID') &&
        !upperStatus.includes('PARTIALLY');
      const numAmount = Number(inv.amount) || 0;

      const executedReminders = inv.proposals.filter(
        (p) => p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
      );
      const lastExecuted = executedReminders[0] || null;

      if (executedReminders.length > 0) {
        remindedInvoicesCount++;
        if (isPaid) {
          paidAfterReminderCount++;
          paidAfterReminderAmount += numAmount;

          const paidLog = inv.activityLogs.find((l) => l.eventType.includes('WEBHOOK'));
          const firstRemindTime = executedReminders[executedReminders.length - 1]?.executedAt;
          const paidTime = paidLog?.createdAt || inv.lastSyncedAt;
          if (firstRemindTime && paidTime) {
            const diffHours = Math.max(
              1,
              Math.round(
                (new Date(paidTime).getTime() - new Date(firstRemindTime).getTime()) /
                  (1000 * 60 * 60)
              )
            );
            paymentDurationsHours.push(diffHours);
          }
        }
      }

      if (!isPaid && upperStatus !== 'DRAFT' && upperStatus !== 'CANCELLED') {
        unpaidCount++;
        outstanding += numAmount;

        const breakdown = scoreMap.get(inv.id);
        const policy = evaluateReminderPolicy(inv.status, lastExecuted?.executedAt || null, now);

        if (policy.eligibleForReminder) eligibleCount++;
        if (policy.reminderHistoryStatus === 'RECENTLY_REMINDED') cooldownCount++;

        const overdueDays = calculateOverdueDays(inv.dueDate, inv.status, now);
        let daysUntilDue = -1;
        if (inv.dueDate) {
          daysUntilDue = Math.ceil(
            (new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        if (overdueDays > 0) {
          overdue += numAmount;
          overdueCount++;
          if (overdueDays <= 7) {
            aging.days1_7.amount += numAmount;
            aging.days1_7.count++;
          } else if (overdueDays <= 14) {
            aging.days8_14.amount += numAmount;
            aging.days8_14.count++;
          } else if (overdueDays <= 30) {
            aging.days15_30.amount += numAmount;
            aging.days15_30.count++;
          } else {
            aging.days30Plus.amount += numAmount;
            aging.days30Plus.count++;
          }
        } else {
          aging.notDue.amount += numAmount;
          aging.notDue.count++;
          if (daysUntilDue >= 0 && daysUntilDue <= 3) {
            dueIn3Days += numAmount;
            dueIn3DaysCount++;
          }
        }

        if (breakdown?.priorityBand && breakdown.priorityBand !== 'NONE') {
          priorityMix[breakdown.priorityBand]++;
        }

        const cooldownDaysLeft =
          policy.reminderHistoryStatus === 'RECENTLY_REMINDED' && lastExecuted?.executedAt
            ? Math.max(
                1,
                3 -
                  Math.floor(
                    (now.getTime() - new Date(lastExecuted.executedAt).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
              )
            : 0;

        actionQueue.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName || 'Unknown Customer',
          amount: numAmount,
          currency: inv.currency,
          overdueDays,
          urgency: breakdown?.totalScore ?? 0,
          overdueScore: breakdown?.factors?.overdueScore ?? 0,
          valueScore: breakdown?.factors?.valueScore ?? 0,
          escalationScore: breakdown?.factors?.escalationScore ?? 0,
          priorityBand: breakdown?.priorityBand || 'LOW',
          eligible: policy.eligibleForReminder,
          cooldownDaysLeft,
        });
      }
    });

    actionQueue.sort((a, b) => b.urgency - a.urgency);
    const top5 = actionQueue.slice(0, 5);

    const pendingProposalsCount = await prisma.actionProposal.count({
      where: { state: 'PENDING', invoice: { currency: requestedCurrency } },
    });
    const executedRemindersCount = await prisma.actionProposal.count({
      where: {
        state: 'EXECUTED',
        actionType: 'SEND_REMINDER',
        invoice: { currency: requestedCurrency },
      },
    });
    const recentActivity = await prisma.activityLog.findMany({
      include: { invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const latestSyncInvoice = await prisma.invoice.findFirst({
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    const overduePercent = outstanding > 0 ? Math.round((overdue / outstanding) * 100) : 0;
    let briefing = `You have ${unpaidCount} unpaid invoice(s) worth ${requestedCurrency} ${outstanding.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    )}. `;
    if (overdueCount > 0 && top5[0]) {
      briefing += `${overdueCount} are overdue (${requestedCurrency} ${overdue.toLocaleString(
        undefined,
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      )}, ${overduePercent}%) — the most urgent is Invoice #${top5[0].invoiceNumber} (${
        top5[0].customerName
      }, ${top5[0].overdueDays}d late). `;
    }
    briefing += `${eligibleCount} invoice(s) are eligible for follow-up now, ${cooldownCount} protected by the 3-day cooldown, and ${dueIn3DaysCount} due in ≤3 days.`;

    const conversionRate =
      remindedInvoicesCount > 0
        ? Math.round((paidAfterReminderCount / remindedInvoicesCount) * 100)
        : 0;
    const medianHoursToPay =
      paymentDurationsHours.length > 0
        ? paymentDurationsHours.sort((a, b) => a - b)[Math.floor(paymentDurationsHours.length / 2)]
        : null;

    return NextResponse.json({
      currency: requestedCurrency,
      availableCurrencies,
      lastSyncedAt: latestSyncInvoice?.lastSyncedAt || null,
      metrics: {
        outstanding,
        overdue,
        overduePercent,
        dueIn3Days,
        unpaidCount,
        overdueCount,
        dueIn3DaysCount,
        cooldownCount,
        eligibleCount,
        pendingProposalsCount,
        executedRemindersCount,
      },
      outcomes: {
        paidAfterReminderCount,
        remindedInvoicesCount,
        paidAfterReminderAmount,
        conversionRate,
        medianHoursToPay,
      },
      aging,
      priorityMix,
      top5,
      recentActivity,
      briefing,
    });
  } catch (error: any) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard metrics' }, { status: 500 });
  }
}