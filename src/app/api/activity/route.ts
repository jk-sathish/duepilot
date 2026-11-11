import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const logs = await prisma.activityLog.findMany({
      include: {
        invoice: true,
        proposal: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const serialized = logs.map((log) => ({
      id: log.id,
      invoiceId: log.invoiceId,
      proposalId: log.proposalId,
      eventType: log.eventType,
      status: log.status,
      description: log.description,
      metadata: log.metadata || null,
      createdAt: log.createdAt.toISOString(),
      invoice: log.invoice
        ? {
            id: log.invoice.id,
            invoiceNumber: log.invoice.invoiceNumber,
            customerName: log.invoice.customerName,
            amount: Number(log.invoice.amount) || 0,
            currency: log.invoice.currency,
            status: log.invoice.status,
            source: log.invoice.source,
          }
        : null,
      proposal: log.proposal
        ? {
            id: log.proposal.id,
            state: log.proposal.state,
            priority: Number(log.proposal.priority) || 0,
            paypalReference: log.proposal.paypalReference,
          }
        : null,
    }));

    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error('Activity GET Error:', error);
    return NextResponse.json({ error: 'Failed to load activity logs' }, { status: 500 });
  }
}