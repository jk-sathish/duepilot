import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchPayPalInvoices } from '@/lib/paypal/client';

export async function POST() {
  try {
    const data = await fetchPayPalInvoices(1, 50);
    const items = Array.isArray(data?.items) ? data.items : [];
    const now = new Date();

    let syncedCount = 0;

    for (const item of items) {
      const paypalId = item.id;
      if (!paypalId) continue;

      const invoiceNumber =
        item.detail?.invoice_number || String(paypalId).slice(-6).toUpperCase();

      const primaryRecipient = item.primary_recipients?.[0]?.billing_info;
      const givenName = primaryRecipient?.name?.given_name || '';
      const surname = primaryRecipient?.name?.surname || '';
      const fullName =
        `${givenName} ${surname}`.trim() ||
        primaryRecipient?.business_name ||
        primaryRecipient?.email_address?.split('@')[0] ||
        'Sample Customer';
      const customerEmail = primaryRecipient?.email_address || null;

      const rawAmount = item.amount?.value ?? item.due_amount?.value ?? '0.00';
      const amount = Number.parseFloat(String(rawAmount)) || 0;
      const currency = (item.amount?.currency_code || 'USD').toUpperCase();
      const rawStatus = String(item.status || 'SENT').toUpperCase();

      const issueDateStr = item.detail?.invoice_date || item.detail?.metadata?.create_time;
      const issueDate = issueDateStr ? new Date(issueDateStr) : now;

      const dueDateStr = item.detail?.payment_term?.due_date;
      const dueDate = dueDateStr ? new Date(dueDateStr) : null;

      await prisma.invoice.upsert({
        where: { paypalId },
        update: {
          invoiceNumber,
          customerName: fullName,
          customerEmail,
          amount,
          currency,
          status: rawStatus,
          rawStatus,
          issueDate,
          dueDate,
          lastSyncedAt: now,
          source: 'PAYPAL_SANDBOX',
        },
        create: {
          paypalId,
          invoiceNumber,
          customerName: fullName,
          customerEmail,
          amount,
          currency,
          status: rawStatus,
          rawStatus,
          issueDate,
          dueDate,
          lastSyncedAt: now,
          source: 'PAYPAL_SANDBOX',
        },
      });

      syncedCount++;
    }

    await prisma.activityLog.create({
      data: {
        eventType: 'INVOICE_SYNCED',
        status: 'SUCCESS',
        description: `Synchronised ${syncedCount} invoice(s) from PayPal Sandbox.`,
        metadata: {
          syncedCount,
          actor: 'system',
          source: 'PAYPAL_SANDBOX',
          syncedAt: now.toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      syncedCount,
      syncedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('PayPal Sync Error:', error);

    await prisma.activityLog
      .create({
        data: {
          eventType: 'INVOICE_SYNC_FAILED',
          status: 'FAILED',
          description: `PayPal Sandbox invoice sync failed: ${error.message || 'Unknown error'}`,
          metadata: {
            actor: 'system',
            source: 'PAYPAL_SANDBOX',
          },
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync PayPal invoices.' },
      { status: 500 }
    );
  }
}