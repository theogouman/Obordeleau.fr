import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/admin.css';

/**
 * The console shell.
 *
 * Imported here rather than from globals.css so the admin stylesheet never
 * reaches a visitor: Next scopes a CSS import to the route segment that makes
 * it, and the home page has a Core Web Vitals budget to keep (constitution IV).
 *
 * noindex is a header, not a request. robots.txt asks a crawler not to come;
 * this tells the ones that came anyway not to keep what they found.
 */
export const metadata: Metadata = {
  title: 'Console | Obordeleau',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-root">{children}</div>;
}
