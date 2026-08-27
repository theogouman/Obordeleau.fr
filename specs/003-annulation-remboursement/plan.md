# Plan 003 : annulation, remboursement et page réservation self-service

**Branche** : `claude/new-session-6ay0a8` | **Date** : 2026-08-23 | **Brief** : `specannulationremboursement.md`
**Base inspectée** : `d59ed37`, `origin/main`

**Statut : en attente de validation. Aucune ligne de code applicative n'est écrite.**
Ce document répond au §14 du brief : inventaire réel du dépôt, écarts constatés avec le brief,
décisions techniques, plan de fichiers lot par lot, et arbitrage des `[NEEDS CLARIFICATION]`.

---

## 1. Inventaire vérifié

Lu intégralement : les 22 migrations, `src/lib/` (paiements, soldes, emails, pricing, dates),
les 8 routes API, la console admin, `src/i18n/routing.ts`, les 4 catalogues de messages,
`constitution.md`, `scripts/no-emdash.mjs`, `package.json`.

**Machine à états.** `reservations.status` ∈ {`confirmed`, `hold`, `cancelled`}. La contrainte
d'exclusion `reservations_no_overlap` porte sur `confirmed` **et** `hold` depuis
`20260821150000_payment_holds.sql`, pas seulement sur `confirmed` comme l'indique le §5 du brief.
Conséquence pour ce lot : passer une résa confirmée en `cancelled` libère bien les nuits
automatiquement, dans la dispo comme dans l'export iCal (`busy_ranges` ne sélectionne que
`confirmed` et `hold`). Aucune ligne à écrire pour la libération.

**Paiements.** `reservation_payments`, une ligne par réservation passée par le checkout :
`stripe_payment_intent_id` (acompte), `stripe_balance_intent_id` et `stripe_balance_session_id`
(solde), `deposit_status` ∈ {pending, paid, failed, refunded}, `balance_status` ∈
{pending, paid, action_required, failed, **none**}, `deposit_amount`, `balance_due`,
`balance_charge_on`, `balance_processing_at` (le verrou du runner), et `quote jsonb`, la quote figée
à la confirmation. La quote contient `accommodation_subtotal`, `cleaning_fee`, `tourist_tax`,
`total`, `payment_mode`, et surtout `nights[]` avec le prix résolu de chaque nuit : les
« 30 premières nuits » du barème longue durée sont donc calculables exactement, sans moyenne.

**Infra token.** `balance_link_token` sur `reservation_payments`, avec
`ensure_balance_link_token(uuid)` (mint idempotent, 24 octets aléatoires en base64url) et
`balance_by_link_token(text)` (lecture seule). Index unique partiel sur le token. C'est exactement
le motif à généraliser, il est sain et n'a pas besoin d'être réécrit.

**Cron.** `expire-holds` toutes les 5 minutes, `charge-balances` à 07:00, `sweep-rate-limits` à
l'heure. `claim_due_balances` ne sélectionne **déjà** que `r.status = 'confirmed'` et pose
`balance_processing_at` comme claim, repris au bout de 30 minutes.

**Emails.** `src/lib/email.ts` (moteur HTML plus texte, `Action` pour un bouton),
`booking-emails.ts` (`emails.deposit.*`), `balance-emails.ts` (`emails.balance.*`). Le client lit sa
langue, Corine lit toujours le français. Provider Resend, un seul `fetch`.

**Console admin.** `ADMIN_PASSWORD`, `requireAdmin()` réappelé dans chaque server action, rendu
serveur, pas de vue réservation, pas d'action d'annulation. `BalanceTable` est le modèle de tableau
à suivre.

**i18n.** 4 locales, `fr` par défaut non préfixée. `messages/it.json` a la **couverture complète**,
y compris `balancePage` et `emails.deposit` / `emails.balance`.

**Tests.** Harnais psql (`supabase/tests/*.test.sql`, 8 fichiers, un script npm chacun) et Playwright
e2e. **Aucun runner de tests unitaires JavaScript** (ni vitest ni jest). Ce point commande la
décision D1 ci-dessous.

---

## 2. Écarts entre le brief et le dépôt

Sept points. Les trois premiers changent le contenu du lot.

**E1. Le correctif last-minute du §10 est déjà livré.** La migration
`20260822090000_deposit_threshold.sql` a réglé le défaut `balance_charge_on` sans plancher, et
autrement que ce que propose le brief. Le mécanisme réel : un acompte n'est offert que si
l'arrivée est à **plus de `deposit_min_advance_days` (30) jours** et que le total dépasse
**`deposit_min_total` (500 EUR)** ; sinon `payment_mode = 'full'`, la totalité est encaissée à la
réservation et `balance_status = 'none'`. Une contrainte de table
(`pricing_config_deposit_window`) et un invariant dans `get_quote` rendent une date de prélèvement
passée non représentable. **Le Lot 0 du brief est sans objet.** Il est remplacé par un test de non
régression dans `supabase/tests/cancellation.test.sql`.

**E2. Conséquence de E1 : l'hypothèse du §1 est fausse.** Le brief écrit que le cas fréquent est
« seul l'acompte de 50 % est payé, palier à 50 % ou 100 % conservé, remboursement nul ». Avec le
seuil de 30 jours, une réservation en mode acompte est **par construction** à plus de 30 jours de
l'arrivée au moment où elle est prise, donc dans le palier « remboursement intégral ». Le cas
« remboursement nul » n'apparaît que si le client attend d'être à moins de 30 jours pour annuler,
et le solde a alors souvent été prélevé (J moins 14). Toutes les réservations à moins de 30 jours ou
sous 500 EUR sont en mode `full` : la somme payée est le total, et **chaque palier produit un
remboursement réel**. Le moteur ne change pas, mais le plancher à 0 est un cas rare et non le cas
courant. Cela justifie d'autant plus le soin mis au découpage entre les deux PaymentIntents.

**E3. `MapEmbed` n'est pas consent-gated.** Son en-tête le dit explicitement : la carte charge au
chargement de la page, à la demande du propriétaire, en écart assumé de la constitution VI, et la
politique de confidentialité l'énonce. Le §6 et le §11 du brief décrivent donc une brique qui
n'existe pas sous cette forme. Décision proposée en D6.

**E4. `deposit_status` a bien `refunded`, mais `mark_deposit_refunded` force
`balance_status = 'failed'`.** Cette fonction est écrite pour un seul cas, le remboursement d'un
acompte dont les nuits sont parties pendant l'autorisation. La réutiliser pour une annulation
écrirait un statut de solde faux. Il faut de nouvelles colonnes, pas un détournement de celle-ci.

**E5. `robots.ts` oublie `/saldo`.** Les chemins `/solde`, `/balance` et `/restbetrag` y sont, la
version italienne de la page solde ne l'est pas. Bug préexistant, corrigé au passage dans le Lot C
puisque la même liste reçoit les 4 chemins de la page réservation.

**E6. Longue durée à 28 ou 29 nuits.** Le barème conserve « les 30 premières nuits », ce qui dépasse
le séjour. À clamper. Voir NC-6.

**E7. `/api/stay` existe déjà** (validation de séjour, Phase 3) et `/api/calendar/[token]` est le
flux iCal de disponibilité. Le générateur ICS par séjour a donc besoin d'un troisième nom, sans
ambiguïté : `/api/reservation/[token]/stay.ics`.

---

## 3. Décisions techniques

**D1. Le moteur de calcul vit dans Postgres, pas en TypeScript.**
Deux raisons, dans cet ordre. D'abord la loi du dépôt : chaque montant vient de la base
(`get_quote`, `claim_due_balances`, `settle_balance_payment`), et `src/lib/supabase.ts` dit en
toutes lettres que le site ne tient jamais une seconde copie d'une règle. Un barème en TypeScript
serait la première règle d'argent hors de la base. Ensuite les tests : le §12 exige des tests
unitaires exhaustifs sur le moteur, et le seul harnais de tests unitaires du dépôt est psql. Un
moteur SQL est testable dès le premier jour ; un moteur TypeScript demanderait d'ajouter vitest,
c'est-à-dire une dépendance et une configuration pour tester une fonction que la base sait déjà
tester.
La fonction reste **pure** au sens du brief : l'instant d'annulation est un paramètre
(`p_at timestamptz default now()`), pas une lecture d'horloge cachée, donc chaque palier et chaque
borne sont testables au timestamp près.
*Alternative écartée* : moteur TypeScript plus vitest. Retenue seulement si le propriétaire veut le
calcul affichable côté client sans aller-retour, ce que la page SSR ne demande pas.

**D2. L'idempotence est décidée par la base, une seule fois, comme pour l'acompte.**
Une fonction `claim_cancellation` verrouille la ligne de paiement et la réservation, refuse tout ce
qui n'est pas `confirmed`, calcule le palier, bascule le statut et rend le plan de remboursement.
Le premier appelant obtient `claimed: true`, tous les autres obtiennent `claimed: false` et
n'émettent rien. C'est le motif exact de `confirm_reservation_payment` et de
`settle_balance_payment`. En second rideau, une table `reservation_refunds` avec un unique
`(reservation_id, target)` rend un double remboursement impossible même si le processus meurt entre
Stripe et l'écriture, et chaque appel Stripe porte une clé d'idempotence
`cancel-<reservation_id>-<deposit|balance>`.

**D3. La course avec le cron de solde se règle par refus, pas par attente.**
`claim_due_balances` ignore déjà `status <> 'confirmed'`. Manque le sens inverse : annuler pendant
que le runner a déjà claimé la ligne (carte peut-être en cours de débit). `claim_cancellation`
refuse avec `reason = 'balance_in_flight'` si `balance_processing_at is not null`, et la page
affiche l'état « traitement en cours » que le §6 prévoit déjà. Le claim du runner est repris au
bout de 30 minutes, donc l'attente est bornée. Symétriquement `claim_due_balances` reçoit une
condition `and p.cancellation_processing_at is null`.

**D4. Répartition du remboursement : le solde d'abord, l'acompte ensuite.**
Le §3.5 demande de rembourser en priorité la taxe de séjour et le ménage. Or, en mode acompte,
l'acompte porte exactement 50 % de l'hébergement et le solde porte le reste de l'hébergement plus
la totalité du ménage et de la taxe (`get_quote`). « Taxe et ménage d'abord » se traduit donc
littéralement par « rembourser l'intent de solde en premier, puis l'intent d'acompte » :
`refund_balance = min(refund_total, payé_solde)`, `refund_deposit = refund_total − refund_balance`.
En mode `full`, il n'y a qu'un intent et la règle se réduit d'elle-même.

**D5. La page réservation est utilisable sans JavaScript de bout en bout.**
Le bouton d'annulation est un `<form>` qui poste vers la même page avec `?confirm=1` : le serveur
rend alors le palier, le montant exact et un second bouton, qui appelle la server action. La modale
`<dialog>` est un enrichissement progressif qui affiche le même contenu sans navigation. Le montant
affiché aux deux étapes vient d'une seule fonction de lecture, `cancellation_preview_by_token`, donc
la modale ne peut pas annoncer un chiffre différent de celui que la confirmation applique.

**D6. La carte de la page réservation réutilise `MapEmbed` tel quel.**
Elle n'est pas consent-gated aujourd'hui, et ce lot n'est pas le bon endroit pour rouvrir cet écart
assumé, documenté dans la politique de confidentialité. La page réservation étant `noindex` et
réservée à un client qui a déjà réservé, elle n'ajoute aucune exposition nouvelle. Si le
propriétaire veut la porte de consentement, c'est un lot à part qui touche aussi la page d'accueil.

**D7. Les seuils du barème (30 jours, 7 jours, 50 %, 28 nuits, 30 nuits) sont écrits une fois.**
Ils vivent dans la migration du moteur, comme la capacité de 4 personnes vit dans une contrainte de
table : c'est une politique, pas un réglage, et la changer est une migration. La page CGV et les
emails lisent les mêmes chiffres depuis `content/cancellation-policy.json` (constitution II : une
donnée, pas une chaîne en dur dans un composant), et un script de vérification appelé par
`npm run check` compare le JSON à la migration pour qu'ils ne puissent pas diverger en silence.

**D8. Un remboursement Stripe qui échoue n'annule pas l'annulation.**
Le client a demandé, les dates sont rendues, la réservation reste `cancelled`. `refund_status` passe
à `failed`, la ligne de log porte le code Stripe, et Corine reçoit une alerte, sur le motif exact de
`sendRefundAlert`. Rien n'est laissé à moitié fait, mais rien n'est non plus repris de force.

---

## 4. Arbitrage des `[NEEDS CLARIFICATION]`

**NC-1, locale italienne : incluse. Tranché, pas une question.**
`messages/it.json` a déjà la couverture complète des pages transactionnelles et des emails
(`balancePage`, `emails.deposit.*`, `emails.balance.*`), `routing.ts` liste `it` avec ses segments
localisés, et `localeTags` porte `it-IT`. La prémisse du brief (« les pages transactionnelles
actuelles semblent FR/EN/DE ») est fausse. Tout ce lot est donc écrit en 4 langues. Bonus : le
chemin `/saldo` manquant dans `robots.ts` est corrigé (E5).

**NC-2, délai de remboursement affiché : formulation retenue, à valider sur le ton seulement.**
Stripe rembourse sur le moyen de paiement d'origine et annonce 5 à 10 **jours ouvrés** selon la
banque émettrice. Copie proposée en français : « Le remboursement est émis immédiatement. Il apparaît
sur votre relevé sous 5 à 10 jours ouvrés, selon votre banque. » Traductions équivalentes en
anglais, allemand et italien. Le mot « ouvrés » est ajouté par rapport au brief : sans lui, la
promesse est plus courte que ce que Stripe tient.

**NC-3, ajout au calendrier : ICS téléchargeable seul.**
Un lien add-to-calendar Google ou Apple envoie les dates du séjour et le nom du logement à un tiers
au moment du clic, depuis une page qui ne doit rien appeler à l'extérieur (constitution VI). L'ICS
est un simple lien `<a>` vers `/api/reservation/[token]/stay.ics`, il fonctionne sans JavaScript,
il ouvre l'application de calendrier par défaut sur mobile comme sur ordinateur, et il ne coûte rien
à maintenir. Les liens tiers restent possibles plus tard, ce n'est pas une porte fermée.

**NC-4, modification des dates : hors v1.** Recommandation du brief suivie. La page dit en une
phrase que tout changement de dates passe par une réponse à l'email de confirmation, ce qui est le
fonctionnement actuel. Construire la modification demanderait de rejouer dispo, quote figée,
différentiel de prix et régularisation Stripe : c'est un lot entier, et c'est exactement le genre de
chemin d'argent à moitié construit que la constitution VIII interdit.

### Nouvelles questions à trancher avant le code

**NC-5, bornes exactes à 7 et à 30 jours.** La table du §2.1 se chevauche : « ≥ 30 jours » et
« 7 à 30 jours » revendiquent tous deux le 30e jour. Proposition, lecture favorable au client aux
deux bornes : `délai ≥ 30 j` → 100 % remboursé ; `7 j ≤ délai < 30 j` → 50 % ; `délai < 7 j` → 0 %.
À confirmer, c'est la seule ambiguïté du barème et elle est opposable.

**NC-6, séjours longs de 28 ou 29 nuits.** « Les 30 premières nuits conservées » dépasse le séjour.
Proposition : conserver `min(30 nuits, toutes les nuits)`, donc la totalité de l'hébergement pour un
séjour de 28 ou 29 nuits annulé à moins de 30 jours. Le ménage et la taxe restent remboursés.

**NC-7, annulation hôte d'un séjour déjà commencé.** Le §1 dit « remboursement intégral quel que
soit le palier ». Proposition : intégral veut dire la totalité de la somme réellement payée, sans
prorata des nuits déjà occupées. C'est le plus simple et le plus généreux ; à confirmer, parce que
le cas maintenance en cours de séjour n'est pas théorique.

**NC-8, bouton d'annulation quand le remboursement vaut 0 EUR.** Cas d'une réservation en mode
`full` prise 2 jours avant l'arrivée. Proposition : afficher le bouton, annoncer franchement
« Vous serez remboursé de 0 EUR », et laisser annuler. Cela libère les dates, c'est honnête, et le
client peut de toute façon ne pas venir. L'alternative (masquer le bouton) revient à obliger le
client à écrire un email pour obtenir le même résultat.

---

## 5. Plan de fichiers

Nomenclature des migrations : `AAAAMMJJHHMMSS_sujet.sql`, comme les 22 existantes. Les horodatages
ci-dessous sont indicatifs et seront posés à l'écriture.

### Lot A, le moteur (aucun effet de bord)

| Fichier | Nature | Contenu |
|---|---|---|
| `supabase/migrations/20260824090000_cancellation_engine.sql` | neuf | `cancellation_tier(p_check_in, p_nights, p_at)` et `cancellation_quote(p_quote jsonb, p_check_in, p_check_out, p_paid_deposit, p_paid_balance, p_at)` |
| `supabase/tests/cancellation-engine.test.sql` | neuf | chaque palier, chaque borne à la seconde, courte et longue durée, 28/29/30 nuits, combinaisons acompte/solde, plancher à 0, non régression E1 |
| `package.json` | édité | script `test:sql:cancellation`, ajouté à `test:sql` |

`cancellation_quote` rend :
`{tier, nights_count, is_long_stay, held_accommodation, refundable_total, refund_total,
refund_from_deposit, refund_from_balance, paid_total, currency}`.
Horloge : instant d'arrivée = `(p_check_in + time '15:00') at time zone 'Europe/Paris'`, sur le motif
de `booking_today()`. Palier `no_show` dès que `p_at >= instant d'arrivée`. Arrondi à 2 décimales à
chaque étape, comme `get_quote`.

### Lot B, l'exécution

| Fichier | Nature | Contenu |
|---|---|---|
| `supabase/migrations/20260824091000_cancellation_execution.sql` | neuf | colonnes, table de log, claim, enregistrement, garde cron |
| `src/lib/cancellations.ts` | neuf | enveloppe RPC fine, sur le modèle de `balances.ts` |
| `src/lib/cancellation-execution.ts` | neuf | côté Stripe, sur le modèle de `deposit-settlement.ts` |
| `src/lib/cancellation-emails.ts` | neuf | reçu client et alerte hôte |
| `messages/{fr,en,de,it}.json` | édités | namespace `emails.cancellation.*` |

Colonnes ajoutées sur `reservations` : `cancelled_at`, `cancelled_by` (`guest` \| `host`),
`cancellation_tier`, `refund_amount`, `refund_status` (`none` \| `pending` \| `partial` \| `done` \|
`failed`).
Sur `reservation_payments` : `cancellation_processing_at`, `deposit_refunded_amount`,
`balance_refunded_amount`.
Table `reservation_refunds` : une ligne par remboursement émis, `unique (reservation_id, target)`,
sur le modèle de `balance_charge_attempts`.
Fonctions : `claim_cancellation(p_reservation_id, p_by, p_at)`,
`record_cancellation_refund(p_reservation_id, p_target, p_amount, p_stripe_refund_id, p_outcome,
p_detail)`, et remplacement de `claim_due_balances` avec la condition
`and p.cancellation_processing_at is null` (le reste du corps inchangé, à recopier tel quel).

Pas de nouveau cas dans `src/app/api/stripe/webhook/route.ts` : `refunds.create` est synchrone et
rend l'objet remboursement, donc `charge.refunded` n'apprendrait rien et ouvrirait une seconde
écriture concurrente. À reconsidérer seulement si des remboursements asynchrones apparaissent.

### Lot C, la page réservation

| Fichier | Nature | Contenu |
|---|---|---|
| `supabase/migrations/20260824092000_reservation_link_token.sql` | neuf | `reservation_link_token`, `ensure_reservation_link_token`, `reservation_by_link_token`, `cancellation_preview_by_token` |
| `src/i18n/routing.ts` | édité | `/reservation/[token]` : fr `/reservation/[token]`, en `/booking/[token]`, de `/buchung/[token]`, it `/prenotazione/[token]` |
| `src/app/[locale]/reservation/[token]/page.tsx` | neuf | SSR, `force-dynamic`, `noIndex: true` via `buildMetadata` |
| `src/app/[locale]/reservation/[token]/actions.ts` | neuf | `cancelReservationAction`, server action |
| `src/components/reservation/StayDetails.tsx` | neuf | dates, voyageurs, décompte depuis la quote figée |
| `src/components/reservation/PaymentStatus.tsx` | neuf | acompte et solde, payé / en attente / échéance |
| `src/components/reservation/CancelPanel.tsx` | neuf | formulaire deux temps sans JS, `<dialog>` en enrichissement |
| `src/lib/stay-ical.ts` | neuf | `buildStayIcal`, VEVENT unique, `DTEND` exclusif, aucune donnée tierce |
| `src/app/api/reservation/[token]/stay.ics/route.ts` | neuf | téléchargement ICS, `no-store`, `X-Robots-Tag` |
| `src/lib/rate-limit.ts` | édité | budgets `reservationPage` et `cancellation` |
| `src/app/robots.ts` | édité | 4 chemins réservation, plus `/saldo` (E5) |
| `src/lib/booking-emails.ts` | édité | une `Action` vers la page réservation dans l'email client |
| `src/styles/reservation.css` | neuf | importé par la page seule, motif de `admin.css` |
| `messages/{fr,en,de,it}.json` | édités | namespace `reservationPage.*` |

Le seul point de contact avec un système existant est l'ajout du lien dans
`sendDepositEmails`. Rien d'autre du flux acompte / solde n'est touché.

### Lot D, la console admin

| Fichier | Nature | Contenu |
|---|---|---|
| `supabase/migrations/20260824093000_admin_reservations.sql` | neuf | `admin_reservations(p_limit)`, tri à venir / en cours / passées |
| `src/lib/admin-data.ts` | édité | `adminReservations()` |
| `src/app/admin/actions.ts` | édité | `cancelReservationAction`, `requireAdmin()` en tête |
| `src/components/admin/ReservationTable.tsx` | neuf | tableau plus `<dialog>` de confirmation, modèle `BalanceTable` |
| `src/app/admin/page.tsx` | édité | rendu de la section |

### Lot E, CGV et consentement au checkout

| Fichier | Nature | Contenu |
|---|---|---|
| `content/cancellation-policy.json` | neuf | seuils et paliers, source unique des chiffres affichés |
| `scripts/check-cancellation-policy.mjs` | neuf | compare le JSON à la migration du moteur, appelé par `npm run check` |
| `src/lib/content.ts` | édité | export de la politique |
| `src/i18n/routing.ts` | édité | `/terms` : fr `/conditions`, en `/terms`, de `/agb`, it `/condizioni` |
| `src/app/[locale]/terms/page.tsx` | neuf | barème, longue durée, no-show, annulation hôte |
| `src/app/sitemap.ts` | édité | ajout de `/terms`, priorité 0.2 |
| `supabase/migrations/20260824094000_terms_acceptance.sql` | neuf | `terms_accepted_at`, `terms_version` sur `reservation_payments` |
| `src/app/api/checkout/route.ts` | édité | refus si `acceptedTerms` absent, transmis à `record_deposit_intent` |
| `src/components/BookingForm.tsx` | édité | case à cocher obligatoire avec lien vers les CGV, à côté de `consentNotice` |
| `messages/{fr,en,de,it}.json` | édités | `termsPage.*` et la copie du consentement |

---

## 6. Séquencement

`A` → `E` → `B` → `C` → `D`.

L'ordre du brief place les CGV en dernier. C'est exactement ce que la constitution VIII interdit :
le barème n'est opposable que s'il a été affiché et accepté **avant** le paiement, donc le Lot E
doit être en production avant que la première annulation self-service soit possible, c'est-à-dire
avant le Lot B. Le Lot A ne produisant aucun effet, il peut passer en premier sans risque.

Le Lot C peut être livré sans le bouton d'annulation si l'on veut publier la page plus tôt : la
consultation, l'ICS et la carte ne dépendent pas du Lot B. À l'inverse, le Lot B sans le Lot C reste
utilisable par la console (Lot D) seule.

Le « Lot 0 » du brief est supprimé (E1). Son seul reste est un test de non régression dans le Lot A.

---

## 7. Constitution Check

| Principe | Vérification |
|---|---|
| I. Intent avant implémentation | ce document, en attente de validation, 4 NC arbitrés et 4 nouveaux posés |
| II. Contenu séparé du code | seuils du barème dans `content/cancellation-policy.json`, copie dans `messages/`, aucune chaîne en dur |
| III. i18n de premier rang | 4 locales, y compris l'italien (NC-1), segments d'URL localisés, `hreflang` par `buildMetadata` |
| IV. Performance | page réservation en SSR, `force-dynamic`, CSS importé au niveau de la route, aucun JavaScript requis pour lire ou annuler |
| V. Accessibilité | `<dialog>` natif, focus piégé par le navigateur, parcours complet au clavier, `prefers-reduced-motion` respecté sur toute apparition |
| VI. Vie privée | token opaque de 24 octets, aucune donnée personnelle dans l'URL, `noindex` plus `robots`, ICS servi par nous. Écart connu : `MapEmbed` (D6, E3) |
| VII. Voix et zéro cadratin | copie relue en 4 langues, `npm run lint:copy` bloque le build |
| VIII. Pas de chemin d'argent à moitié construit | Lot E avant Lot B, idempotence par la base plus contrainte unique, échec de remboursement tracé et alerté (D8) |
| IX. SEO | page CGV indexable et au sitemap, page réservation `noindex` et hors sitemap |
| X. Pile ennuyeuse | aucune dépendance nouvelle. C'est la raison principale de D1 |

---

## 8. Complexity Tracking

**Deux fonctions de calcul plutôt qu'une.** `cancellation_tier` est séparée de `cancellation_quote`
pour que le palier soit testable seul, aux bornes, sans construire une quote. Alternative plus
simple écartée : une seule fonction, dont les tests de bornes auraient tous eu besoin d'un jsonb
complet, donc des tests plus longs et plus fragiles que la règle qu'ils vérifient.

**Une table de log plus des colonnes de montants.** Redondant en apparence. La contrainte unique sur
`(reservation_id, target)` est ce qui rend le double remboursement impossible au niveau de la base,
et les colonnes de montants sont ce que la console et les emails lisent sans agréger. Alternative
écartée : colonnes seules, où seule la logique applicative empêcherait un second appel Stripe.

**Refus sur `balance_in_flight` plutôt qu'attente ou annulation du prélèvement.** Interrompre un
débit en cours chez Stripe n'est pas possible de façon fiable. Attendre côté serveur bloquerait une
requête pour un claim qui peut durer jusqu'à 30 minutes. Le refus explicite, avec un message, est le
seul comportement honnête. Alternative écartée : annuler quand même et rembourser le solde juste
prélevé, ce qui produirait un débit et un remboursement à quelques secondes d'intervalle sur le
relevé du client.

---

## 9. Notes d'exécution

- **Vérification md5.** Toute migration ou fonction déployée par le MCP Supabase est relue et son
  md5 comparé après application, l'altération silencieuse ayant déjà été constatée sur ce projet.
- **Ne pas réécrire.** Flux acompte / solde, conversion de hold, moteur de prix, sync iCal : hors
  d'atteinte de ce lot. Les seuls points de contact autorisés sont ceux listés au §5, à savoir la
  condition ajoutée dans `claim_due_balances`, le lien ajouté dans `sendDepositEmails`, la case à
  cocher du checkout, et les entrées ajoutées dans `routing.ts`, `robots.ts` et `sitemap.ts`.
- **Zéro cadratin, zéro double tiret**, dans les 4 langues, y compris dans les nouveaux fichiers de
  contenu. `npm run lint:copy` bloque le build.
