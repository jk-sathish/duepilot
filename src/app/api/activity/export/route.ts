import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value).replace(/\r?\n/g, ' ').trim();

  // Neutralise spreadsheet formula injection (=, +, -, @, tab, carriage return)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const logs = await prisma.activityLog.findMany({
      include: {
        invoice: true,
        proposal: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const csvHeaders = [
      'Timestamp',
      'Event Type',
      'Status',
      'Actor',
      'Invoice Number',
      'Customer',
      'Currency',
      'Amount',
      'PayPal Debug Reference',
      'Description',
    ].join(',');

    const csvRows = logs.map((log) => {
      const meta = (log.metadata as Record<string, any>) || {};
      const actor =
        meta.actor ||
        (log.eventType.includes('EDITED') ||
        log.eventType.includes('REJECTED') ||
        log.eventType === 'REMINDER_SENT'
          ? 'demo-operator'
          : log.eventType.includes('PROPOSAL')
          ? 'gemini'
          : log.eventType.includes('WEBHOOK')
          ? 'demo-simulator'
          : 'system');

      const debugRef =
        meta.paypalDebugId || log.proposal?.paypalReference || 'N/A';

      return [
        sanitizeCsvCell(new Date(log.createdAt).toISOString()),
        sanitizeCsvCell(log.eventType),
        sanitizeCsvCell(log.status),
        sanitizeCsvCell(actor),
        sanitizeCsvCell(log.invoice?.invoiceNumber ? `#${log.invoice.invoiceNumber}` : 'N/A'),
        sanitizeCsvCell(log.invoice?.customerName || 'N/A'),
        sanitizeCsvCell(log.invoice?.currency || 'N/A'),
        sanitizeCsvCell(log.invoice ? Number(log.invoice.amount).toFixed(2) : 'N/A'),
        sanitizeCsvCell(debugRef),
        sanitizeCsvCell(log.description),
      ].join(',');
    });

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="duepilot_audit_log.csv"',
      },
    });
  } catch (error: any) {
    console.error('CSV Export Error:', error);
    return NextResponse.json({ error: 'Failed to generate CSV' }, { status: 500 });
  }
}