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

/**
 * A line at the foot of a message.
 *
 * A string is text and is escaped here. An object is HTML the caller has
 * already made safe, for the one thing text cannot carry: a link. Its `text`
 * is the same line for the plain text twin, and when it is left out the tags
 * are simply stripped, so the twin is never HTML by accident.
 */
export type FooterLine = string | { html: string; text?: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escaped first, then the newlines become breaks. The other order would let a
 * line of text write markup, which is the whole reason this function exists as
 * one step rather than two calls at the call site.
 */
function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

/**
 * A link inside a sentence. Both halves are escaped, so a label or an address
 * that carries a quote cannot break out of the tag it is put in.
 */
export function link(label: string, href: string): string {
  return (
    `<a href="${escapeHtml(href)}" style="color:#a8253c;text-decoration:underline">` +
    `${escapeHtml(label)}</a>`
  );
}

/**
 * A translated sentence that carries links.
 *
 * The sentence is escaped first and the anchors are dropped in afterwards, at
 * markers the caller passed to the translation in place of the real values.
 * Building it the other way round, by translating with the anchors already in,
 * would escape the anchors themselves or, worse, let a translator's ampersand
 * decide how the markup ends.
 */
export function withLinks(sentence: string, anchors: Record<string, string>): string {
  let html = escapeHtml(sentence).replace(/\n/g, '<br>');
  for (const [marker, anchor] of Object.entries(anchors)) {
    html = html.split(marker).join(anchor);
  }
  return html;
}

/** What a footer line says once the markup is gone. */
function footerText(line: FooterLine): string {
  if (typeof line === 'string') return line;
  if (line.text !== undefined) return line.text;
  return line.html.replace(/<[^>]*>/g, '');
}

/** A calendar date written the way the reader's language writes it. */
export function formatEmailDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTags[locale], {
    dateStyle: 'full',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * The one thing a message asks the reader to do. Rendered as a button in the
 * HTML part and as a bare URL on its own line in the text part, which is what
 * mail clients turn back into a link.
 */
export type Action = { label: string; url: string };

/** Every message goes out as HTML and as plain text, built from the same parts. */
export function renderEmail(
  title: string,
  intro: string,
  details: Detail[],
  footer: FooterLine[],
  action?: Action,
): { html: string; text: string } {
  const rows = details
    .map(
      (detail) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b5750">${escapeHtml(detail.label)}</td>` +
        `<td style="padding:4px 0;font-weight:600">${escapeHtml(detail.value)}</td></tr>`,
    )
    .join('');

  // The palette, written out: an email cannot read the site's custom properties.
  const button = action
    ? `<p style="margin:0 0 20px">` +
      `<a href="${escapeHtml(action.url)}" ` +
      `style="display:inline-block;background:#ce4257;color:#ffffff;text-decoration:none;` +
      `padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';

  const html =
    `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2a26">` +
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>` +
    `<p style="margin:0 0 16px">${nl2br(intro)}</p>` +
    `<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>` +
    button +
    footer
      .map(
        (line) =>
          `<p style="margin:0 0 8px">${typeof line === 'string' ? nl2br(line) : line.html}</p>`,
      )
      .join('') +
    `</div>`;

  const text = [
    title,
    '',
    intro,
    '',
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    ...(action ? ['', action.label, action.url] : []),
    '',
    ...footer.map(footerText),
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
