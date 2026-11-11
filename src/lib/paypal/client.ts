import { getPayPalCredentialsForCurrentUser } from '@/lib/auth';

export interface CustomPayPalCreds {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export async function getPayPalAccessToken(customCreds?: CustomPayPalCreds): Promise<string> {
  const resolved = customCreds
    ? {
        clientId: customCreds.clientId,
        clientSecret: customCreds.clientSecret,
        baseUrl: customCreds.baseUrl || 'https://api-m.sandbox.paypal.com',
      }
    : await getPayPalCredentialsForCurrentUser();

  if (!resolved.clientId || !resolved.clientSecret) {
    throw new Error(
      'Missing PayPal credentials. Connect your PayPal Client ID & Secret in Account Profile or configure .env.'
    );
  }

  const auth = Buffer.from(`${resolved.clientId}:${resolved.clientSecret}`).toString('base64');

  const response = await fetch(`${resolved.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function fetchPayPalInvoices(page = 1, pageSize = 50) {
  const resolved = await getPayPalCredentialsForCurrentUser();
  const accessToken = await getPayPalAccessToken(resolved);

  const response = await fetch(
    `${resolved.baseUrl}/v2/invoicing/invoices?page=${page}&page_size=${pageSize}&total_required=true`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch PayPal invoices (HTTP ${response.status})`);
  }

  return response.json();
}

export async function fetchPayPalInvoiceById(paypalInvoiceId: string) {
  const resolved = await getPayPalCredentialsForCurrentUser();
  const accessToken = await getPayPalAccessToken(resolved);

  const response = await fetch(`${resolved.baseUrl}/v2/invoicing/invoices/${paypalInvoiceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to verify PayPal invoice ${paypalInvoiceId} (HTTP ${response.status})`);
  }

  return response.json();
}

export async function sendPayPalReminder(
  paypalInvoiceId: string,
  subject: string,
  note: string
): Promise<{ success: boolean; debugId: string | null }> {
  const resolved = await getPayPalCredentialsForCurrentUser();
  const accessToken = await getPayPalAccessToken(resolved);

  const response = await fetch(
    `${resolved.baseUrl}/v2/invoicing/invoices/${paypalInvoiceId}/remind`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject,
        note,
        send_to_invoicer: false,
      }),
    }
  );

  const debugId = response.headers.get('paypal-debug-id');

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `PayPal Remind API failed (HTTP ${response.status}${debugId ? `, debug-id: ${debugId}` : ''}): ${errText.slice(0, 180)}`
    );
  }

  return { success: true, debugId };
}