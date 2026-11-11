import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toSafeUserDto } from '@/lib/auth';
import { getPayPalAccessToken } from '@/lib/paypal/client';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const recentAccountLogs = await prisma.activityLog.findMany({
      where: {
        OR: [
          { userId: user.id },
          { eventType: { startsWith: 'USER_' } },
          { eventType: 'PAYPAL_CREDENTIALS_UPDATED' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      user: toSafeUserDto(user),
      recentAccountLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Please sign in to update your account profile.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Optional: Disconnect custom PayPal credentials and revert to shared Sandbox
    if (body.action === 'DISCONNECT_CUSTOM_PAYPAL') {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          paypalClientId: null,
          paypalClientSecret: null,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          eventType: 'PAYPAL_CREDENTIALS_UPDATED',
          status: 'SUCCESS',
          description: `Cleared custom PayPal API credentials for ${user.email}; reverted to platform Sandbox.`,
          metadata: { actor: user.email },
        },
      });

      return NextResponse.json({
        success: true,
        user: toSafeUserDto(updated),
        message: 'Disconnected custom PayPal keys. Using shared Sandbox environment.',
      });
    }

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.companyName !== undefined) updateData.companyName = String(body.companyName).trim();
    if (body.paypalEmail !== undefined) updateData.paypalEmail = String(body.paypalEmail).trim();
    if (body.defaultCurrency !== undefined) {
      const curr = String(body.defaultCurrency).toUpperCase();
      if (['USD', 'EUR', 'INR'].includes(curr)) {
        updateData.defaultCurrency = curr;
      }
    }
    if (body.paypalEnv !== undefined) {
      updateData.paypalEnv = body.paypalEnv === 'LIVE' ? 'LIVE' : 'SANDBOX';
    }

    // If user provided new PayPal Client ID & Secret, verify them with PayPal OAuth before saving!
    if (body.paypalClientId && body.paypalClientSecret) {
      const clientId = String(body.paypalClientId).trim();
      const clientSecret = String(body.paypalClientSecret).trim();
      const baseUrl =
        (body.paypalEnv || user.paypalEnv) === 'LIVE'
          ? 'https://api-m.paypal.com'
          : 'https://api-m.sandbox.paypal.com';

      if (body.verifyBeforeSave !== false) {
        await getPayPalAccessToken({ clientId, clientSecret, baseUrl });
      }

      updateData.paypalClientId = clientId;
      updateData.paypalClientSecret = clientSecret;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        eventType: 'PAYPAL_CREDENTIALS_UPDATED',
        status: 'SUCCESS',
        description: `Updated account profile & PayPal integration settings for ${updatedUser.email}.`,
        metadata: {
          actor: updatedUser.email,
          defaultCurrency: updatedUser.defaultCurrency,
          hasCustomPayPal: Boolean(updatedUser.paypalClientId && updatedUser.paypalClientSecret),
        },
      },
    });

    return NextResponse.json({
      success: true,
      user: toSafeUserDto(updatedUser),
      message: 'Account profile and PayPal integration updated successfully.',
    });
  } catch (error: any) {
    console.error('Profile PUT Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update account profile.' },
      { status: 400 }
    );
  }
}