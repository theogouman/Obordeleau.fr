import type { ReactNode } from 'react';

/**
 * The real document shell lives in src/app/[locale]/layout.tsx, because <html
 * lang> depends on the active locale. This root layout only passes through.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
