'use client';

import { trackBookingIntent, type BookingChannel } from '@/lib/analytics';

type Props = {
  channel: BookingChannel;
  href: string;
  locale: string;
  label: string;
  externalHint: string;
  className?: string;
};

/** SC-005: every outbound booking click is an event, with no personal data. */
export function ChannelLink({ channel, href, locale, label, externalHint, className = '' }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackBookingIntent(channel, locale)}
      className={className}
    >
      {label}
      <span className="visually-hidden"> {externalHint}</span>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path
          d="M6 3h7v7M13 3L4 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
