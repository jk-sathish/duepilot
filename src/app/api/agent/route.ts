import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runReceivablesAgent } from '@/lib/ai/gemini';
import { getScoredInvoicesFromDb } from '@/lib/ai/tools';
import { GET as getEnrichedProposals } from '@/app/api/proposals/route';

const RequestSchema = z.object({
  prompt: z.string().min(3, 'Prompt must be at least 3 characters.'),
});

export async function POST(request: Request) {
  const startMs = Date.now();
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid prompt input.' },
        { status: 400 }
      );
    }

    const agentOutput = await runReceivablesAgent(parsed.data.prompt);
    const scoredInvoices = await getScoredInvoicesFromDb();

    // Identify unpaid invoices skipped due to 3-day cooldown protection
    const skippedCooldownInvoices = scoredInvoices
      .filter((inv) => {
        const upper = (inv.status || '').toUpperCase();
        const isPaid =
          upper.includes('PAID') && !upper.includes('UNPAID') && !upper.includes('PARTIALLY');
        return !isPaid && !inv.eligibleForReminder;
      })
      .map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        reason: inv.policyReason,
      }));

    // Reuse the enriched GET /api/proposals logic so the UI immediately receives full factors
    const proposalsRes = await getEnrichedProposals();
    const proposals = await proposalsRes.json();

    const usedFallback = (agentOutput.toolTrace || []).some((t: any) =>
      String(t.tool).includes('fallback')
    );

    return NextResponse.json({
      success: true,
      reply: agentOutput.reply,
      toolTrace: agentOutput.toolTrace,
      source: usedFallback ? 'FALLBACK' : 'GEMINI',
      elapsedMs: Date.now() - startMs,
      skippedCooldownInvoices,
      proposals,
    });
  } catch (error: any) {
    console.error('AI Agent Route Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run receivables AI agent.' },
      { status: 500 }
    );
  }
}