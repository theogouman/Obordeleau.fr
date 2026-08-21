'use client';

import { useActionState } from 'react';
import { signInAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import { IDLE, type ActionState } from '@/lib/admin-forms';

/**
 * One field, because there is one password and one person.
 *
 * The action is passed straight to the form, so it posts and works with no
 * JavaScript at all; `pending` only changes the wording of the button for those
 * who have it. `required` is a convenience for the browser and nothing more:
 * an empty password is refused on the server whatever the browser allowed.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(signInAction, IDLE);

  return (
    <form action={action} className="admin-form">
      <label className="admin-field">
        <span className="admin-label">Mot de passe</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          className="admin-input"
        />
      </label>

      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? 'Connexion...' : 'Se connecter'}
      </button>

      <FormFeedback state={state} />
    </form>
  );
}
