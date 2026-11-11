import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const proposalId = resolvedParams.id;

    const existing = await prisma.actionProposal.findUnique({
      where: { id: proposalId },
      include: { invoice: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    }

    if (existing.state !== 'PENDING') {
      return NextResponse.json(
        { error: `Only PENDING proposals can be rejected (current state: ${existing.state}).` },
        { status: 409 }
      );
    }

    const updated = await prisma.actionProposal.update({
      where: { id: proposalId },
      data: { state: 'REJECTED' },
    });

    await prisma.activityLog.create({
      data: {
        invoiceId: existing.invoiceId,
        proposalId: existing.id,
        eventType: 'PROPOSAL_REJECTED',
        status: 'SUCCESS',
        description: `Operator rejected reminder proposal for Invoice #${
          existing.invoice?.invoiceNumber || 'N/A'
        }. No PayPal action was taken.`,
        metadata: {
          actor: 'demo-operator',
          invoiceNumber: existing.invoice?.invoiceNumber,
        },
      },
    });

    return NextResponse.json({
      success: true,
      proposal: {
        ...updated,
        priority: Number(updated.priority) || 0,
      },
    });
  } catch (error: any) {
    console.error('Reject Proposal Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reject proposal.' },
      { status: 500 }
    );
  }
}