import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchPayPalInvoiceById, sendPayPalReminder } from '@/lib/paypal/client';
import { evaluateReminderPolicy } from '@/lib/recovery/policy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const proposalId = resolvedParams.id;

  try {
    // 1. Load proposal, invoice, and full proposal/activity history
    const proposal = await prisma.actionProposal.findUnique({
      where: { id: proposalId },
      include: {
        invoice: {
          include: {
            proposals: { orderBy: { createdAt: 'desc' } },
          },
        },
        activityLogs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!proposal || !proposal.invoice) {
      return NextResponse.json({ error: 'Proposal or linked invoice not found.' }, { status: 404 });
    }

    if (proposal.state !== 'PENDING') {
      return NextResponse.json(
        { error: `Proposal cannot be approved because its state is ${proposal.state}.` },
        { status: 409 }
      );
    }

    // 2. Atomic claim: transition PENDING -> EXECUTING only if still PENDING
    const claimed = await prisma.actionProposal.updateMany({
      where: { id: proposalId, state: 'PENDING' },
      data: {
        state: 'EXECUTING',
        approvedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Proposal is already being processed or has been updated by another request.' },
        { status: 409 }
      );
    }

    const invoice = proposal.invoice;

    // 3. Block Demo Fixtures from calling live PayPal APIs
    if (invoice.source === 'DEMO') {
      await prisma.actionProposal.update({
        where: { id: proposalId },
        data: { state: 'FAILED' },
      });
      return NextResponse.json(
        { error: 'Demo fixture invoices cannot execute real PayPal reminders.' },
        { status: 400 }
      );
    }

    // 4. Re-fetch live invoice status from PayPal Sandbox before sending reminder
    let currentStatus = invoice.status;
    try {
      const remoteInvoice = await fetchPayPalInvoiceById(invoice.paypalId);
      if (remoteInvoice?.status) {
        currentStatus = String(remoteInvoice.status).toUpperCase();
        if (currentStatus !== invoice.status) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: currentStatus, lastSyncedAt: new Date() },
          });
        }
      }
    } catch (recheckErr: any) {
      // Log warning but allow policy check to proceed if Sandbox GET had a transient hiccup
      console.warn('Live PayPal status re-check warning:', recheckErr.message);
    }

    // 5. Server-side eligibility & 3-day cooldown check
    const lastExecutedReminder = invoice.proposals.find(
      (p) => p.id !== proposalId && p.state === 'EXECUTED' && p.actionType === 'SEND_REMINDER'
    );
    const policy = evaluateReminderPolicy(
      currentStatus,
      lastExecutedReminder?.executedAt || null,
      new Date()
    );

    if (!policy.eligibleForReminder) {
      const nextState = currentStatus.includes('PAID') && !currentStatus.includes('UNPAID')
        ? 'REJECTED'
        : 'FAILED';

      await prisma.actionProposal.update({
        where: { id: proposalId },
        data: { state: nextState },
      });

      await prisma.activityLog.create({
        data: {
          invoiceId: invoice.id,
          proposalId: proposal.id,
          eventType: 'REMINDER_SEND_FAILED',
          status: 'FAILED',
          description: `Blocked reminder execution for Invoice #${invoice.invoiceNumber}: ${policy.reason}`,
        },
      });

      return NextResponse.json(
        { error: `Execution blocked by policy gate: ${policy.reason}` },
        { status: 422 }
      );
    }

    // 6. Determine exact reviewed subject & body
    const editLog = proposal.activityLogs.find((l) => l.eventType === 'PROPOSAL_EDITED');
    const createLog = proposal.activityLogs.find((l) => l.eventType === 'PROPOSAL_CREATED');
    const editMeta = (editLog?.metadata as Record<string, any>) || {};
    const createMeta = (createLog?.metadata as Record<string, any>) || {};
    const subject =
      editMeta.subject ||
      createMeta.subject ||
      `Payment reminder — Invoice #${invoice.invoiceNumber}`;

    // 7. Execute live PayPal Sandbox Remind API
    const paypalResult = await sendPayPalReminder(
      invoice.paypalId,
      subject,
      proposal.proposedMessage
    );

    const debugRef = paypalResult.debugId || `pp-${Date.now().toString(36)}`;
    const executedAt = new Date();

    const updatedProposal = await prisma.actionProposal.update({
      where: { id: proposalId },
      data: {
        state: 'EXECUTED',
        executedAt,
        paypalReference: debugRef,
      },
    });

    await prisma.activityLog.create({
      data: {
        invoiceId: invoice.id,
        proposalId: proposal.id,
        eventType: 'REMINDER_SENT',
        status: 'SUCCESS',
        description: `PayPal Debug-Id ${debugRef} · approved by demo-operator`,
        metadata: {
          paypalDebugId: debugRef,
          subject,
          actor: 'demo-operator',
          invoiceNumber: invoice.invoiceNumber,
        },
      },
    });

    return NextResponse.json({
      success: true,
      proposal: {
        ...updatedProposal,
        priority: Number(updatedProposal.priority) || 0,
      },
      paypalReference: debugRef,
    });
  } catch (error: any) {
    console.error('Approve Execution Error:', error);

    await prisma.actionProposal
      .update({
        where: { id: proposalId },
        data: { state: 'FAILED' },
      })
      .catch(() => {});

    await prisma.activityLog
      .create({
        data: {
          proposalId,
          eventType: 'REMINDER_SEND_FAILED',
          status: 'FAILED',
          description: `PayPal reminder execution failed: ${error.message || 'Unknown error'}`,
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send PayPal reminder.' },
      { status: 500 }
    );
  }
}