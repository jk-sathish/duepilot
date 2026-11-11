import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // This safely reads both real PayPal webhook payloads and our Simulator payloads
    const eventType = body.event_type;
    const paypalInvoiceId = body.resource?.invoice?.id || body.paypalId;

    if (eventType === 'INVOICING.INVOICE.PAID') {
      const invoice = await prisma.invoice.findUnique({
        where: { paypalId: paypalInvoiceId }
      });

      if (invoice) {
        // 1. Mark the invoice as PAID in our database
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID' }
        });

        // 2. Automatically dismiss any PENDING AI reminder proposals
        await prisma.actionProposal.updateMany({
          where: { invoiceId: invoice.id, state: 'PENDING' },
          data: { state: 'REJECTED' }
        });

        // 3. Immutably log the successful recovery
        await prisma.activityLog.create({
          data: {
            invoiceId: invoice.id,
            eventType: 'WEBHOOK_RECEIVED',
            status: 'SUCCESS',
            description: `Invoice #${invoice.invoiceNumber} was paid! All pending AI reminders have been automatically cancelled to prevent duplicate follow-ups.`,
          }
        });

        return NextResponse.json({ success: true, message: 'Invoice marked as paid and proposals cleared.' });
      }
      return NextResponse.json({ error: 'Invoice not found in DuePilot database.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Event received and ignored (not a PAID event).' });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}