'use client';

import { useActionState } from 'react';
import { signInAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import { IDLE, type ActionState } from '@/lib/admin-forms';

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(signInAction, IDLE);

  return (
    <form action={action} className="admin-form">
      <label className="admin-field">
        <span className="admin-label">Adresse email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          className="admin-input"
        />
      </label>

      <label className="admin-field">
        <span className="admin-label">Mot de passe</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
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
