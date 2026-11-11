import { z } from 'zod';
import { prisma } from '@/lib/db';

export const BusinessProfileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(80),
  senderName: z.string().min(1, 'Sender name is required').max(80),
  defaultTone: z.enum(['AUTO', 'FRIENDLY', 'PROFESSIONAL', 'DIRECT', 'FIRM']),
  greeting: z.string().min(1).max(80),
  signOff: z.string().min(1).max(120),
  styleInstruction: z.string().max(240).optional().default(''),
});

export const ReminderPolicyConfigSchema = z.object({
  cooldownDays: z.number().int().min(1).max(30),
  minimumOverdueDays: z.number().int().min(0).max(30),
  proactiveUpcoming: z.boolean(),
});

export const PriorityWeightsSchema = z
  .object({
    overdueWeight: z.number().int().min(0).max(100),
    valueWeight: z.number().int().min(0).max(100),
    escalationWeight: z.number().int().min(0).max(100),
  })
  .refine(
    (w) => w.overdueWeight + w.valueWeight + w.escalationWeight === 100,
    {
      message: 'Priority scoring weights must sum to exactly 100.',
    }
  );

export const AppSettingsSchema = z.object({
  businessProfile: BusinessProfileSchema,
  policy: ReminderPolicyConfigSchema,
  weights: PriorityWeightsSchema,
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  businessProfile: {
    businessName: 'DuePilot Studio',
    senderName: 'Accounts Team',
    defaultTone: 'PROFESSIONAL',
    greeting: 'Hello {customerFirstName} team,',
    signOff: 'Kind regards,\nAccounts Team, DuePilot Studio',
    styleInstruction: 'Keep reminders factual, polite, and concise.',
  },
  policy: {
    cooldownDays: 3,
    minimumOverdueDays: 0,
    proactiveUpcoming: true,
  },
  weights: {
    overdueWeight: 50,
    valueWeight: 30,
    escalationWeight: 20,
  },
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const latestSettingLog = await prisma.activityLog.findFirst({
      where: {
        eventType: 'SETTINGS_UPDATED',
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestSettingLog?.metadata) {
      return DEFAULT_APP_SETTINGS;
    }

    const meta = latestSettingLog.metadata as Record<string, any>;
    const parsed = AppSettingsSchema.safeParse(meta.settings || meta);
    if (parsed.success) {
      return parsed.data;
    }
    return DEFAULT_APP_SETTINGS;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(
  settings: AppSettings,
  description = 'Operator updated DuePilot recovery policy and communication settings.'
): Promise<AppSettings> {
  const validated = AppSettingsSchema.parse(settings);

  await prisma.activityLog.create({
    data: {
      eventType: 'SETTINGS_UPDATED',
      status: 'SUCCESS',
      description,
      metadata: {
        actor: 'demo-operator',
        cooldownDays: validated.policy.cooldownDays,
        weights: `${validated.weights.overdueWeight}/${validated.weights.valueWeight}/${validated.weights.escalationWeight}`,
        defaultTone: validated.businessProfile.defaultTone,
        settings: validated,
      },
    },
  });

  return validated;
}