import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  clearSessionCookie,
  getCurrentUser,
  hashPassword,
  setSessionCookie,
  toSafeUserDto,
  verifyPassword,
} from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      authenticated: Boolean(user),
      user: toSafeUserDto(user),
    });
  } catch (error: any) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || '').toUpperCase();

    if (action === 'LOGOUT') {
      const current = await getCurrentUser();
      if (current) {
        await prisma.activityLog
          .create({
            data: {
              userId: current.id,
              eventType: 'USER_LOGOUT',
              status: 'SUCCESS',
              description: `Account ${current.email} signed out.`,
              metadata: { actor: current.email },
            },
          })
          .catch(() => {});
      }
      await clearSessionCookie();
      return NextResponse.json({ success: true });
    }

    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    // 1. Continue / Login with PayPal (Email-first flow, can attach Client ID & Secret now or later in Profile)
    if (action === 'PAYPAL_AUTH') {
      const name =
        String(body.name || '').trim() ||
        email
          .split('@')[0]
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
      const companyName = String(body.companyName || 'PayPal Merchant Workspace').trim();

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            companyName,
            authProvider: 'PAYPAL',
            paypalEmail: email,
            defaultCurrency: 'USD',
          },
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            paypalEmail: email,
            authProvider: 'PAYPAL',
          },
        });
      }

      await setSessionCookie(user.id);

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          eventType: 'USER_LOGIN_PAYPAL',
          status: 'SUCCESS',
          description: `${user.name} (${user.email}) authenticated via PayPal Identity.`,
          metadata: { actor: user.email, provider: 'PAYPAL' },
        },
      });

      return NextResponse.json({
        success: true,
        user: toSafeUserDto(user),
      });
    }

    // 2. Standard Email Sign Up
    if (action === 'SIGNUP') {
      const password = String(body.password || '');
      const name = String(body.name || '').trim() || email.split('@')[0];
      const companyName = String(body.companyName || 'DuePilot Merchant').trim();
      const defaultCurrency = String(body.defaultCurrency || 'USD').toUpperCase();

      if (password.length < 4) {
        return NextResponse.json(
          { error: 'Password must be at least 4 characters.' },
          { status: 400 }
        );
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 409 }
        );
      }

      const user = await prisma.user.create({
        data: {
          email,
          name,
          companyName,
          passwordHash: hashPassword(password),
          authProvider: 'EMAIL',
          paypalEmail: email,
          defaultCurrency,
          paypalClientId: body.paypalClientId ? String(body.paypalClientId).trim() : null,
          paypalClientSecret: body.paypalClientSecret
            ? String(body.paypalClientSecret).trim()
            : null,
        },
      });

      await setSessionCookie(user.id);

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          eventType: 'USER_REGISTERED',
          status: 'SUCCESS',
          description: `New merchant account created for ${user.name} (${user.email}).`,
          metadata: { actor: user.email, defaultCurrency },
        },
      });

      return NextResponse.json({
        success: true,
        user: toSafeUserDto(user),
      });
    }

    // 3. Standard Email Sign In
    if (action === 'LOGIN') {
      const password = String(body.password || '');
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return NextResponse.json(
          { error: 'No account found with that email. Create an account or use Continue with PayPal.' },
          { status: 404 }
        );
      }

      if (user.passwordHash && !verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
      }

      await setSessionCookie(user.id);

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          eventType: 'USER_LOGIN',
          status: 'SUCCESS',
          description: `Operator ${user.email} signed in to DuePilot.`,
          metadata: { actor: user.email },
        },
      });

      return NextResponse.json({
        success: true,
        user: toSafeUserDto(user),
      });
    }

    return NextResponse.json({ error: 'Invalid authentication action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Auth Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed.' },
      { status: 500 }
    );
  }
}