export interface PolicyEvaluation {
  eligibleForReminder: boolean;
  reason: string;
  reminderHistoryStatus: 'NONE_RECORDED' | 'RECENTLY_REMINDED' | 'COOLDOWN_PASSED';
  cooldownDays: number;
}

export interface PolicyOptions {
  cooldownDays?: number;
}

export function evaluateReminderPolicy(
  status: string,
  lastRemindedAt: Date | null,
  now: Date = new Date(),
  options?: PolicyOptions
): PolicyEvaluation {
  const cooldownDays = Math.max(1, options?.cooldownDays ?? 3);
  const upperStatus = (status || '').toUpperCase();

  if (
    upperStatus.includes('PAID') &&
    !upperStatus.includes('UNPAID') &&
    !upperStatus.includes('PARTIALLY')
  ) {
    return {
      eligibleForReminder: false,
      reason: 'Invoice is already paid.',
      reminderHistoryStatus: 'NONE_RECORDED',
      cooldownDays,
    };
  }

  if (
    upperStatus.includes('CANCELLED') ||
    upperStatus.includes('DRAFT') ||
    upperStatus.includes('REFUNDED')
  ) {
    return {
      eligibleForReminder: false,
      reason: `Invoice status (${status}) is not eligible for reminders.`,
      reminderHistoryStatus: 'NONE_RECORDED',
      cooldownDays,
    };
  }

  if (!lastRemindedAt) {
    return {
      eligibleForReminder: true,
      reason: 'No reminder recorded in DuePilot yet; eligible for follow-up.',
      reminderHistoryStatus: 'NONE_RECORDED',
      cooldownDays,
    };
  }

  const daysSince = Math.floor(
    (now.getTime() - new Date(lastRemindedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince < cooldownDays) {
    return {
      eligibleForReminder: false,
      reason: `Protected by ${cooldownDays}-day cooldown (reminded ${daysSince} day(s) ago).`,
      reminderHistoryStatus: 'RECENTLY_REMINDED',
      cooldownDays,
    };
  }

  return {
    eligibleForReminder: true,
    reason: `Last reminded ${daysSince} days ago (${cooldownDays}-day cooldown passed).`,
    reminderHistoryStatus: 'COOLDOWN_PASSED',
    cooldownDays,
  };
}