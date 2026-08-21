'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  endAdminSession,
  requireAdmin,
  signInWithPassword,
  startAdminSession,
} from '@/lib/admin-auth';
import {
  clearOverride,
  saveConfig,
  saveLastMinute,
  saveTier,
  setOverride,
  type CheckinConstraint,
  type WriteResult,
} from '@/lib/admin-data';
import { IDLE, type ActionState } from '@/lib/admin-forms';
import { runDueBalances } from '@/lib/balance-runner';
import { addDays, isIsoDate } from '@/lib/dates';
import { paymentsConfigured } from '@/lib/stripe';

/**
 * Every write the console can make.
 *
 * Each one is its own HTTP request, so each one calls requireAdmin() again: the
 * page having rendered a form is not evidence about who is posting it. The
 * service role key only ever leaves this process after that check.
 */

/** French decimals arrive with a comma, which Number() would read as NaN. */
function amount(value: FormDataEntryValue | null): number | null | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function whole(value: FormDataEntryValue | null): number | null | undefined {
  const parsed = amount(value);
  if (parsed === undefined || parsed === null) return parsed;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

const FIELD_LABELS: Record<string, string> = {
  base_nightly_rate: 'le prix de nuit par défaut',
  cleaning_fee: 'les frais de ménage',
  tourist_tax_per_adult_night: 'la taxe de séjour',
  deposit_percentage: "le pourcentage d'acompte",
  deposit_charge_days_before_arrival: "le délai de débit du solde",
  default_min_nights: 'le minimum de nuits hors saison',
  window_days: 'la fenêtre en jours',
  discounted_price: 'le prix remisé',
  floor_price: 'le prix plancher',
  label: 'le nom de la saison',
  range: 'les dates de la saison',
  nightly_rate: 'le tarif de nuit',
  min_nights: 'le minimum de nuits',
  checkin_constraint: "le jour d'arrivée",
  stay_multiple: 'le multiple de nuits',
};

function failure(result: WriteResult): ActionState {
  if (result.ok) return IDLE;

  switch (result.reason) {
    case 'incomplete':
      return {
        status: 'error',
        message:
          'Pour activer la remise, renseignez la fenêtre, le prix remisé et le prix plancher.',
      };
    case 'overlap':
      return {
        status: 'error',
        message: 'Ces dates chevauchent une autre saison. Deux saisons ne peuvent pas se croiser.',
      };
    case 'duplicate_label':
      return { status: 'error', message: 'Une saison porte déjà ce nom.' };
    case 'not_found':
      return { status: 'error', message: "Cette saison n'existe plus." };
    case 'missing_row':
      return { status: 'error', message: 'Les réglages sont introuvables. Prévenez le développeur.' };
    case 'invalid_range':
      return { status: 'error', message: 'Sélectionnez au moins une nuit.' };
    case 'range_too_long':
      return { status: 'error', message: 'Une sélection ne peut pas dépasser 400 nuits.' };
    default: {
      const field = FIELD_LABELS[result.reason];
      return {
        status: 'error',
        message: field
          ? `Vérifiez ${field} : la valeur saisie n'est pas acceptée.`
          : "La valeur saisie n'est pas acceptée.",
      };
    }
  }
}

function refresh(): void {
  revalidatePath('/admin');
}

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = text(formData.get('email'));
  const password = typeof formData.get('password') === 'string'
    ? (formData.get('password') as string)
    : '';

  if (email === '' || password === '') {
    return { status: 'error', message: 'Renseignez votre adresse et votre mot de passe.' };
  }

  const result = await signInWithPassword(email, password);

  if (!result.ok) {
    if (result.reason === 'not_configured') {
      return {
        status: 'error',
        message: "La console n'est pas encore configurée sur ce déploiement.",
      };
    }
    if (result.reason === 'unreachable') {
      return { status: 'error', message: 'Le serveur ne répond pas. Réessayez dans un instant.' };
    }
    return { status: 'error', message: 'Adresse ou mot de passe incorrect.' };
  }

  await startAdminSession(result.sub, result.email);
  redirect('/admin');
}

export async function signOutAction(): Promise<void> {
  await endAdminSession();
  redirect('/admin/login');
}

/* -------------------------------------------------------------------------- */
/* General rules                                                              */
/* -------------------------------------------------------------------------- */

export async function saveConfigAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const baseNightlyRate = amount(formData.get('base_nightly_rate'));
  const cleaningFee = amount(formData.get('cleaning_fee'));
  const touristTax = amount(formData.get('tourist_tax_per_adult_night'));
  const depositPercentage = amount(formData.get('deposit_percentage'));
  const chargeDays = whole(formData.get('deposit_charge_days_before_arrival'));
  const minNights = whole(formData.get('default_min_nights'));

  if (
    baseNightlyRate === undefined ||
    cleaningFee === undefined ||
    touristTax === undefined ||
    depositPercentage === undefined ||
    chargeDays === undefined ||
    minNights === undefined
  ) {
    return { status: 'error', message: 'Un des champs ne contient pas un nombre valide.' };
  }
  if (cleaningFee === null || touristTax === null || depositPercentage === null || minNights === null) {
    return {
      status: 'error',
      message:
        'Les frais de ménage, la taxe de séjour, le pourcentage d’acompte et le minimum de nuits sont obligatoires.',
    };
  }

  const result = await saveConfig({
    baseNightlyRate,
    cleaningFee,
    touristTaxPerAdultNight: touristTax,
    depositPercentage,
    depositChargeDaysBeforeArrival: chargeDays,
    defaultMinNights: minNights,
  });

  if (!result.ok) return failure(result);

  refresh();
  return { status: 'ok', message: 'Réglages enregistrés.' };
}

export async function saveLastMinuteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const enabled = formData.get('enabled') === 'on';
  const windowDays = whole(formData.get('window_days'));
  const discountedPrice = amount(formData.get('discounted_price'));
  const floorPrice = amount(formData.get('floor_price'));

  if (windowDays === undefined || discountedPrice === undefined || floorPrice === undefined) {
    return { status: 'error', message: 'Un des champs ne contient pas un nombre valide.' };
  }

  const result = await saveLastMinute({ enabled, windowDays, discountedPrice, floorPrice });
  if (!result.ok) return failure(result);

  refresh();
  return {
    status: 'ok',
    message: enabled ? 'Remise active et enregistrée.' : 'Remise désactivée et enregistrée.',
  };
}

export async function saveTierAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = text(formData.get('id'));
  const label = text(formData.get('label'));
  const startDate = text(formData.get('start_date'));
  // The form asks for the last night, because a season that runs "to the 1st of
  // September" reads as covering the 1st. The store keeps the range half open,
  // so the day goes back on here and nowhere else.
  const lastNight = text(formData.get('last_night'));
  const endDate = isIsoDate(lastNight) ? addDays(lastNight, 1) : '';
  const nightlyRate = amount(formData.get('nightly_rate'));
  const minNights = whole(formData.get('min_nights'));
  const stayMultiple = whole(formData.get('stay_multiple'));
  const checkin = text(formData.get('checkin_constraint'));

  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate <= startDate) {
    return {
      status: 'error',
      message: 'Les dates de la saison ne sont pas valides : la dernière nuit doit suivre la première.',
    };
  }
  if (nightlyRate === undefined || minNights === undefined || stayMultiple === undefined) {
    return { status: 'error', message: 'Un des champs ne contient pas un nombre valide.' };
  }
  if (minNights === null) {
    return { status: 'error', message: 'Le minimum de nuits est obligatoire.' };
  }
  if (checkin !== 'any' && checkin !== 'saturday') {
    return { status: 'error', message: "Le jour d'arrivée n'est pas valide." };
  }

  const result = await saveTier({
    id: id === '' ? null : id,
    label,
    startDate,
    endDate,
    nightlyRate,
    isLastMinuteExempt: formData.get('is_last_minute_exempt') === 'on',
    minNights,
    checkinConstraint: checkin as CheckinConstraint,
    stayMultiple,
  });

  if (!result.ok) return failure(result);

  refresh();
  return { status: 'ok', message: 'Saison enregistrée.' };
}

/* -------------------------------------------------------------------------- */
/* Overrides                                                                  */
/* -------------------------------------------------------------------------- */

/** The console posts the nights it selected; the range sent on is half open. */
function selection(formData: FormData): { from: string; to: string } | null {
  const from = text(formData.get('from'));
  const to = text(formData.get('to'));
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) return null;
  return { from, to };
}

export async function setOverrideAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const range = selection(formData);
  if (!range) return { status: 'error', message: 'Sélectionnez au moins une nuit.' };

  const rate = amount(formData.get('nightly_rate'));
  if (rate === undefined || rate === null) {
    return { status: 'error', message: 'Saisissez un prix.' };
  }
  if (rate < 0) return { status: 'error', message: 'Un prix ne peut pas être négatif.' };

  const result = await setOverride(range.from, range.to, rate);
  if (!result.ok) return failure(result);

  refresh();

  const written = result.nights_set;
  const skipped = result.nights_skipped;

  if (written === 0) {
    return {
      status: 'error',
      message: 'Aucune nuit modifiée : toute la sélection est déjà réservée ou bloquée.',
    };
  }

  const nights = `${written} nuit${written > 1 ? 's' : ''}`;
  return {
    status: 'ok',
    message: skipped
      ? `${nights} au prix saisi. ${skipped} nuit${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''}, déjà réservée${skipped > 1 ? 's' : ''} ou bloquée${skipped > 1 ? 's' : ''}.`
      : `${nights} au prix saisi.`,
  };
}

export async function clearOverrideAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const range = selection(formData);
  if (!range) return { status: 'error', message: 'Sélectionnez au moins une nuit.' };

  const result = await clearOverride(range.from, range.to);
  if (!result.ok) return failure(result);

  refresh();

  const cleared = result.nights_cleared;
  return cleared === 0
    ? { status: 'ok', message: 'Aucun prix manuel sur cette sélection.' }
    : {
        status: 'ok',
        message: `${cleared} nuit${cleared > 1 ? 's' : ''} rendue${cleared > 1 ? 's' : ''} au prix automatique.`,
      };
}

/**
 * The balance run, on demand.
 *
 * The same function the daily cron job calls, invoked here directly rather than
 * by posting to its route: a server action is already on the server, and asking
 * ourselves over http would only add a way for an error to go missing.
 *
 * Pressing it twice is safe. Every balance is claimed before it is charged, so
 * a second run finds the first one's work already in flight and passes over it.
 */
export async function runBalancesAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  if (!paymentsConfigured) {
    return {
      status: 'error',
      message: "Stripe n'est pas configuré sur ce déploiement, rien ne peut être débité.",
    };
  }

  try {
    const summary = await runDueBalances();
    revalidatePath('/admin');

    if (summary.claimed === 0) {
      return { status: 'ok', message: 'Aucun solde à débiter aujourd\'hui.' };
    }

    const parts = [
      `${summary.claimed} solde(s) traité(s)`,
      summary.paid > 0 ? `${summary.paid} débité(s)` : null,
      summary.actionRequired > 0 ? `${summary.actionRequired} en attente du voyageur` : null,
      summary.failed > 0 ? `${summary.failed} en échec` : null,
      summary.reminded > 0 ? `${summary.reminded} relance(s)` : null,
      summary.errors > 0 ? `${summary.errors} erreur(s)` : null,
    ].filter(Boolean);

    return { status: 'ok', message: `${parts.join(', ')}.` };
  } catch (error) {
    console.error('[admin] the balance run failed', error);
    return {
      status: 'error',
      message: "Le passage n'a pas pu se faire. Réessayez dans un instant.",
    };
  }
}
