import { evaluateReminderPolicy, PolicyEvaluation } from './policy';

export interface ScoredInvoiceInput {
  id: string;
  paypalId?: string;
  invoiceNumber?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  amount: any;
  currency: string;
  status: string;
  issueDate?: Date;
  dueDate: Date | null;
  lastRemindedAt?: Date | null;
  priorRemindersCount?: number;
  proposals?: Array<{
    state: string;
    actionType: string;
    executedAt?: Date | null;
  }>;
}

export interface ScoringConfig {
  overdueWeight?: number;      // Default 50
  valueWeight?: number;        // Default 30
  escalationWeight?: number;   // Default 20
  cooldownDays?: number;       // Default 3
  proactiveUpcoming?: boolean; // Default true
}

export interface PriorityBreakdown {
  invoiceId: string;
  overdueDays: number;
  isOverdue: boolean;
  overdueScore: number;
  valueScore: number;
  escalationScore: number;
  eligibilityScore: number;
  totalScore: number;
  priorityBand: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  factors: {
    overdueScore: number;
    valueScore: number;
    escalationScore: number;
  };
  weightsUsed: {
    overdueWeight: number;
    valueWeight: number;
    escalationWeight: number;
  };
  policy: PolicyEvaluation;
  priorRemindersCount: number;
  valueRatioPercent: number;
  explanation: string;
}

export function calculateOverdueDays(
  dueDate: Date | null,
  status: string,
  now: Date = new Date()
): number {
  const upper = (status || '').toUpperCase();
  if (upper.includes('PAID') && !upper.includes('UNPAID') && !upper.includes('PARTIALLY')) {
    return 0;
  }
  if (!dueDate) return 0;

  const diffMs = now.getTime() - new Date(dueDate).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function scoreInvoices(
  invoices: ScoredInvoiceInput[],
  now: Date = new Date(),
  config?: ScoringConfig
): Map<string, PriorityBreakdown> {
  const results = new Map<string, PriorityBreakdown>();

  const overdueWeight = config?.overdueWeight ?? 50;
  const valueWeight = config?.valueWeight ?? 30;
  const escalationWeight = config?.escalationWeight ?? 20;
  const cooldownDays = config?.cooldownDays ?? 3;
  const proactiveUpcoming = config?.proactiveUpcoming ?? true;

  const maxByCurrency = new Map<string, number>();
  for (const inv of invoices) {
    const upper = (inv.status || '').toUpperCase();
    const isPaid =
      upper.includes('PAID') && !upper.includes('UNPAID') && !upper.includes('PARTIALLY');
    if (isPaid) continue;

    const curr = (inv.currency || 'USD').toUpperCase();
    const numAmount = Number(inv.amount) || 0;
    const currentMax = maxByCurrency.get(curr) || 0;
    if (numAmount > currentMax) {
      maxByCurrency.set(curr, numAmount);
    }
  }

  for (const inv of invoices) {
    const upper = (inv.status || '').toUpperCase();
    const isPaid =
      upper.includes('PAID') && !upper.includes('UNPAID') && !upper.includes('PARTIALLY');
    const numAmount = Number(inv.amount) || 0;

    const executedReminders = (inv.proposals || []).filter(
      (p) => p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
    );
    const derivedLastRemindedAt =
      inv.lastRemindedAt !== undefined
        ? inv.lastRemindedAt
        : executedReminders[0]?.executedAt || null;
    const priorRemindersCount =
      inv.priorRemindersCount !== undefined
        ? inv.priorRemindersCount
        : executedReminders.length;

    const policy = evaluateReminderPolicy(inv.status, derivedLastRemindedAt || null, now, {
      cooldownDays,
    });
    const overdueDays = calculateOverdueDays(inv.dueDate, inv.status, now);
    const isOverdue = overdueDays > 0;

    if (isPaid) {
      results.set(inv.id, {
        invoiceId: inv.id,
        overdueDays: 0,
        isOverdue: false,
        overdueScore: 0,
        valueScore: 0,
        escalationScore: 0,
        eligibilityScore: 0,
        totalScore: 0,
        priorityBand: 'NONE',
        factors: { overdueScore: 0, valueScore: 0, escalationScore: 0 },
        weightsUsed: { overdueWeight, valueWeight, escalationWeight },
        policy,
        priorRemindersCount,
        valueRatioPercent: 0,
        explanation: 'Invoice is already settled.',
      });
      continue;
    }

    // 1. Overdue Severity (scaled to overdueWeight, default max 50)
    let overdueScore = 0;
    if (overdueDays > 0 && overdueWeight > 0) {
      const rawRatio = Math.min(1, 0.3 + (overdueDays / 25) * 0.7);
      overdueScore = Math.min(overdueWeight, Math.round(rawRatio * overdueWeight));
    } else if (proactiveUpcoming && inv.dueDate && overdueWeight > 0) {
      const daysUntilDue = Math.ceil(
        (new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilDue >= 0 && daysUntilDue <= 3) {
        overdueScore = Math.max(1, Math.round(overdueWeight * 0.16));
      }
    }

    // 2. Relative Value within Same Currency (scaled to valueWeight, default max 30)
    const curr = (inv.currency || 'USD').toUpperCase();
    const maxCurrencyAmount = maxByCurrency.get(curr) || numAmount || 1;
    const valueRatioPercent = Math.round((numAmount / maxCurrencyAmount) * 100);
    const valueScore =
      valueWeight > 0
        ? Math.min(valueWeight, Math.round((numAmount / maxCurrencyAmount) * valueWeight))
        : 0;

    // 3. Escalation Signal (scaled to escalationWeight, default max 20)
    let escalationScore = 0;
    if (escalationWeight > 0) {
      if (priorRemindersCount >= 2 || overdueDays >= 14) {
        escalationScore = escalationWeight;
      } else if (priorRemindersCount === 1 || overdueDays >= 7) {
        escalationScore = Math.round(escalationWeight * 0.5);
      } else if (overdueDays > 0) {
        escalationScore = Math.round(escalationWeight * 0.3);
      }
    }

    const totalScore = Math.min(100, overdueScore + valueScore + escalationScore);

    let priorityBand: PriorityBreakdown['priorityBand'] = 'LOW';
    if (totalScore >= 75) priorityBand = 'CRITICAL';
    else if (totalScore >= 55) priorityBand = 'HIGH';
    else if (totalScore >= 35) priorityBand = 'MEDIUM';

    const overdueText = isOverdue
      ? `${overdueDays}d past due (${overdueScore}/${overdueWeight} pts)`
      : overdueScore > 0
      ? `Approaching due date (${overdueScore}/${overdueWeight} pts)`
      : `Not yet due (0/${overdueWeight} pts)`;

    const explanation = `${priorityBand} (${totalScore}/100): ${overdueText}, relative value ${curr} ${numAmount.toFixed(
      2
    )} (${valueScore}/${valueWeight} pts), escalation signal (${escalationScore}/${escalationWeight} pts).`;

    results.set(inv.id, {
      invoiceId: inv.id,
      overdueDays,
      isOverdue,
      overdueScore,
      valueScore,
      escalationScore,
      eligibilityScore: escalationScore,
      totalScore,
      priorityBand,
      factors: {
        overdueScore,
        valueScore,
        escalationScore,
      },
      weightsUsed: { overdueWeight, valueWeight, escalationWeight },
      policy,
      priorRemindersCount,
      valueRatioPercent,
      explanation,
    });
  }

  return results;
}