import Link from 'next/link';
import '@/styles/globals.css';

/**
 * Catches requests that never reached a locale segment. Kept deliberately
 * minimal and in French, the default language.
 */
export default function RootNotFound() {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-cream text-ink">
        <main className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
          <h1 className="text-4xl">
            Cette page <span className="accent-word">n&apos;existe pas</span>
          </h1>
          <p className="mt-4 text-ink-soft">
            Le lien est peut-être ancien ou mal recopié.
          </p>
          <Link href="/" className="btn btn-primary mt-8">
            Retour à l&apos;accueil
          </Link>
        </main>
      </body>
    </html>
  );
}
