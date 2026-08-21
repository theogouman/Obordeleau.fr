import Link from 'next/link';

/**
 * Catches requests that never reached a locale segment. Kept deliberately
 * minimal and in French, the default language. The document shell and the
 * stylesheet come from the root layout, which now wraps this page too.
 */
export default function RootNotFound() {
  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
      <h1 className="text-4xl">
        Cette page <span className="accent-word">n&apos;existe pas</span>
      </h1>
      <p className="mt-4 text-ink-soft">Le lien est peut-être ancien ou mal recopié.</p>
      <Link href="/" className="btn btn-primary mt-8">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
