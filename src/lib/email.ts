import { localeTags, type Locale } from '@/i18n/routing';
import { host } from '@/lib/content';

/**
 * The two letters the booking flow sends, and the one place they are built.
 *
 * Extracted from the reservation route when the payment lot needed the same
 * table, the same escaping and the same plain text twin. A provider SDK is
 * deliberately not used: one fetch is the whole API, and it is one less
 * dependency to keep current (constitution X), the same reasoning as the
 * Supabase wrapper next door.
 */

export type Detail = { label: string; value: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A calendar date written the way the reader's language writes it. */
export function formatEmailDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTags[locale], {
    dateStyle: 'full',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/** Every message goes out as HTML and as plain text, built from the same parts. */
export function renderEmail(
  title: string,
  intro: string,
  details: Detail[],
  footer: string[],
): { html: string; text: string } {
  const rows = details
    .map(
      (detail) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b5750">${escapeHtml(detail.label)}</td>` +
        `<td style="padding:4px 0;font-weight:600">${escapeHtml(detail.value)}</td></tr>`,
    )
    .join('');

  const html =
    `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2a26">` +
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>` +
    `<p style="margin:0 0 16px">${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>` +
    footer.map((line) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`).join('') +
    `</div>`;

  const text = [
    title,
    '',
    intro,
    '',
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    '',
    ...footer,
  ].join('\n');

  return { html, text };
}

/** Where a booking is announced. Null when the owner has set no inbox. */
export function hostInbox(): string | undefined {
  return (
    process.env.BOOKINGS_TO_EMAIL ??
    process.env[host.inquiryRouting.toEnv] ??
    process.env.INQUIRY_TO_EMAIL
  );
}

/**
 * True when the provider accepted the message. A booking is never undone
 * because a letter failed to leave: the caller logs and carries on.
 */
export async function sendEmail(
  payload: Record<string, unknown>,
  channel: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INQUIRY_FROM_EMAIL;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[${channel}] email not configured, payload below\n`, payload.text);
      return false;
    }
    console.error(`[${channel}] missing RESEND_API_KEY or INQUIRY_FROM_EMAIL`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, ...payload }),
    });

    if (!response.ok) {
      console.error(`[${channel}] provider rejected the message`, response.status);
      return false;
    }
  } catch (error) {
    console.error(`[${channel}] provider unreachable`, error);
    return false;
  }

  return true;
}
