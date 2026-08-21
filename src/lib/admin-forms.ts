/**
 * The shape every console form gets back from its action.
 *
 * It lives outside `actions.ts` because a module marked 'use server' may only
 * export async functions: a constant exported from there is a build error, and
 * a client component needs this one to seed useActionState.
 */

export type ActionState = { status: 'idle' | 'ok' | 'error'; message: string };

export const IDLE: ActionState = { status: 'idle', message: '' };
