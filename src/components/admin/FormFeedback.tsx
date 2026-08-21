import type { ActionState } from '@/lib/admin-forms';

/** The one line a form says back. Polite, so it does not interrupt typing. */
export function FormFeedback({ state }: { state: ActionState }) {
  if (state.status === 'idle' || state.message === '') return null;

  return (
    <p
      className={`admin-feedback admin-feedback-${state.status}`}
      role="status"
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}
