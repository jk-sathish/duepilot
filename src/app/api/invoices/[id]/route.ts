import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id: resolvedParams.id },
      include: {
        proposals: { orderBy: { createdAt: 'desc' } },
        activityLogs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...invoice,
      amount: Number(invoice.amount) || 0,
      proposals: invoice.proposals.map((p) => ({
        ...p,
        priority: Number(p.priority) || 0,
      })),
    });
  } catch (error: any) {
    console.error('Invoice Detail Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice history' }, { status: 500 });
  }
}