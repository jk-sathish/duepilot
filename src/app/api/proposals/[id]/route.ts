import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateOverdueDays } from '@/lib/recovery/scoring';

function buildToneDraft(
  tone: string,
  invoiceNumber: string,
  customerName: string,
  currency: string,
  amount: number,
  dueDateStr: string,
  overdueDays: number
) {
  const firstName = (customerName || 'Customer').split(' ')[0];
  const formattedAmt = `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  if (tone === 'FRIENDLY') {
    return `Hello ${firstName} team,\n\nI hope your week is going well! This is a friendly nudge regarding Invoice #${invoiceNumber} for ${formattedAmt} (due ${dueDateStr}). Whenever you have a moment, could you please check on this or let us know if you need the invoice link resent?\n\nIf payment is already on the way, thank you so much and please disregard this note.\n\nWarm regards,\nAccounts Team, DuePilot Studio`;
  }
  if (tone === 'DIRECT') {
    return `Hello ${firstName},\n\nFollowing up directly on Invoice #${invoiceNumber} (${formattedAmt}), which was due on ${dueDateStr}${
      overdueDays > 0 ? ` and is now ${overdueDays} day(s) past due` : ''
    }.\n\nPlease confirm the scheduled payment date or complete settlement via the PayPal invoice link today.\n\nBest regards,\nAccounts Receivable, DuePilot Studio`;
  }
  if (tone === 'FIRM') {
    return `Attention ${customerName},\n\nInvoice #${invoiceNumber} for ${formattedAmt} (due ${dueDateStr}) remains unpaid${
      overdueDays > 0 ? ` at ${overdueDays} day(s) overdue` : ''
    }. Please remit payment immediately via PayPal or reply with confirmation of transfer so we can keep your account in good standing.\n\nIf payment has already been dispatched, please forward the confirmation reference.\n\nRegards,\nCredit & Collections, DuePilot Studio`;
  }

  return `Hello ${firstName} team,\n\nI hope you're well. This is a reminder that Invoice #${invoiceNumber} for ${formattedAmt}, due on ${dueDateStr}, is ${
    overdueDays > 0 ? `now ${overdueDays} day(s) overdue` : 'currently open'
  }. Could you please arrange payment, or let us know the expected payment date?\n\nIf you've already paid, please disregard this message with our thanks.\n\nKind regards,\nAccounts Team, DuePilot Studio`;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();

    const existing = await prisma.actionProposal.findUnique({
      where: { id: resolvedParams.id },
      include: {
        invoice: true,
        activityLogs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    }

    // Mode 1: Regenerate draft with selected tone
    if (body.action === 'REGENERATE') {
      const tone = String(body.tone || 'PROFESSIONAL').toUpperCase();
      const inv = existing.invoice;
      const overdueDays = calculateOverdueDays(inv.dueDate, inv.status, new Date());
      const dueStr = inv.dueDate
        ? new Date(inv.dueDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'upon receipt';

      const newDraft = buildToneDraft(
        tone,
        inv.invoiceNumber,
        inv.customerName || 'Valued Customer',
        inv.currency || 'USD',
        Number(inv.amount) || 0,
        dueStr,
        overdueDays
      );

      const updated = await prisma.actionProposal.update({
        where: { id: existing.id },
        data: { proposedMessage: newDraft },
      });

      await prisma.activityLog.create({
        data: {
          invoiceId: existing.invoiceId,
          proposalId: existing.id,
          eventType: 'PROPOSAL_CREATED',
          status: 'PENDING',
          description: `Regenerated reminder draft for Invoice #${inv.invoiceNumber} using ${tone} tone.`,
          metadata: {
            originalMessage: newDraft,
            subject: `Payment reminder — Invoice #${inv.invoiceNumber}`,
            tone,
          },
        },
      });

      return NextResponse.json({ success: true, proposal: updated });
    }

    // Mode 2: Save human edit
    if (!body.proposedMessage) {
      return NextResponse.json({ error: 'Proposed message is required.' }, { status: 400 });
    }

    const firstCreateLog = existing.activityLogs.find((l) => l.eventType === 'PROPOSAL_CREATED');
    const prevMeta = (firstCreateLog?.metadata as Record<string, any>) || {};
    const originalMessage = prevMeta.originalMessage || existing.proposedMessage;

    const updatedProposal = await prisma.actionProposal.update({
      where: { id: resolvedParams.id },
      data: { proposedMessage: body.proposedMessage },
    });

    await prisma.activityLog.create({
      data: {
        invoiceId: updatedProposal.invoiceId,
        proposalId: updatedProposal.id,
        eventType: 'PROPOSAL_EDITED',
        status: 'SUCCESS',
        description: `Human operator edited the AI-drafted reminder message for Invoice #${existing.invoice.invoiceNumber}.`,
        metadata: {
          originalMessage,
          subject: body.subject || `Payment reminder — Invoice #${existing.invoice.invoiceNumber}`,
        },
      },
    });

    return NextResponse.json({ success: true, proposal: updatedProposal });
  } catch (error: any) {
    console.error('Proposal Edit Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}