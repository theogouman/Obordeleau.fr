# Reprise de session, Obordeleau.fr

Document de passation. Écrit le 20 août 2026, à la fin de la session de construction.
À lire en premier dans une nouvelle session, avec `README.md` juste après.

## Où en est le projet, en trois phrases

La totalité de la Phase 1 est écrite : 89 fichiers, site Next.js multilingue complet, dans
`/Users/gouman/Library/Mobile Documents/com~apple~CloudDocs/Obordeleau.fr`.
Le code est commité et poussé sur `github.com/theogouman/Obordeleau.fr`, branche `main`.
Le projet Vercel `obordeleau-fr` (équipe `g0uman`) est relié à ce dépôt, branche de production
`main`, et les domaines `obordeleau.fr` et `www.obordeleau.fr` y sont déjà rattachés.
Le premier build est passé sans erreur : 21 pages statiques, types validés, lint de copie vert.
Il reste à publier en production, ce qui se fait par un simple push sur `main`.

## Historique de déploiement

- Premier essai par envoi direct de fichiers : échec, l'appel était tronqué et Vercel n'a reçu
  qu'une moitié de projet. Méthode abandonnée, le dépôt est trop gros pour cette voie.
- Bascule sur le dépôt GitHub, qui est désormais la source des déploiements.
- Build de validation `dpl_8fBWzPayrd3uvocaoQfggrMiTxGK` : vert.
- Un correctif du matcher de `src/middleware.ts` a suivi ce build : l'entrée `'/'` y est désormais
  explicite, ce qui est la forme documentée par next-intl pour une locale par défaut non préfixée.
- Première mise en production : build vert, mais **toutes** les routes en 404, y compris
  `/robots.txt`. Cause réelle : le projet Vercel `obordeleau-fr` préexistait avec
  `framework: null`. Vercel exécutait bien `npm run build`, puis collectait `public/` comme sortie
  statique au lieu de l'application Next. Preuve : `/IMAGE-MANIFEST.md` et `/brand/wordmark.svg`
  répondaient 200 pendant que toutes les vraies routes répondaient 404. Corrigé par un
  `vercel.json` qui force `framework: nextjs`, réglage versionné et prioritaire sur le tableau de
  bord. Si le problème réapparaît, vérifier Settings, Build and Deployment, Framework Preset.

Note utile : la protection Vercel du projet est réglée sur `all_except_custom_domains`. Toute URL
en `*.vercel.app` répond donc par une redirection SSO, ce qui rend les tests automatiques peu
lisibles. Le seul test qui vaut est celui sur `obordeleau.fr`.

## La prochaine action

Déployer sur Vercel avec le connecteur MCP Vercel. La session précédente ne pouvait pas le faire :
seul le connecteur `Vercel Uneo` y était monté, et il pointe sur l'organisation `Uneo Retail`, qui
n'est pas le bon compte. Le bon connecteur a été autorisé depuis claude.ai, mais les serveurs MCP
sont chargés à l'ouverture d'une session, d'où cette passation.

Vérifier d'abord que le bon serveur est monté, puis lancer, par exemple :

> Déploie le projet Next.js de ce dossier sur Vercel avec le MCP Vercel : d'abord un déploiement de
> validation pour compiler, puis la production une fois le build vert. Le code n'a jamais été
> compilé, corrige les erreurs de build en lisant les logs.

`deploy_to_vercel` envoie les fichiers directement, sans dépôt git ni CLI, et c'est Vercel qui
installe et compile. C'est la voie retenue justement parce qu'il n'y a pas de Node en local.

Fichiers utiles au build à envoyer : `package.json`, `tsconfig.json`, `next.config.ts`,
`postcss.config.mjs`, `eslint.config.mjs`, `content/`, `messages/`, `scripts/`, `src/`.
Inutiles au build : `specs/`, `tests/`, `playwright.config.ts`, `lighthouserc.json`, `public/brand/`,
les `.gitkeep`. Attention, `npm run build` appelle `scripts/no-emdash.mjs` : ce dossier est requis.

**Ne pas déployer sur `Uneo Retail`** (`team_AdDwoPXkX6BGPnEBX9V2vvqH`), c'est une autre entité.

## Ce qui a été construit

Next.js 15 App Router, TypeScript, Tailwind CSS 4, next-intl 4, cible Vercel.

```text
constitution.md                 les dix principes qui priment sur les préférences
specs/001-obordeleau-site/      spec.md, plan.md, reviews-curation.md, seo-keywords.md
content/                        property.json, host.json, reviews.json, reviews-curation.json
messages/                       fr.json (source), en.json, de.json
public/images/                  hero, gallery, host, area, reviews (vides, voir IMAGE-MANIFEST.md)
src/app/[locale]/               page, reviews, legal-notice, privacy, not-found, opengraph-image
src/app/api/inquiry/route.ts    envoi de la demande par email
src/app/                        sitemap.ts, robots.ts, icon.svg
src/components/                 25 composants, un par section
src/i18n/                       routing (langues et chemins localisés), request, navigation
src/lib/                        content, reviews, seo, structured-data, analytics, assets
src/styles/                     globals.css (thème Tailwind), tokens.css (marque), _root.css (motion)
scripts/                        no-emdash.mjs, check-reviews.mjs
tests/e2e/                      journey, reviews, accessibility (Playwright et axe)
```

Sections de la page d'accueil, dans l'ordre imposé par FR-001 : héros en arche, barre de chiffres
clés, galerie avec visionneuse, équipements plus un accordéon « à savoir avant de réserver »,
« autour de vous », l'hôte, les avis, la carte, la réservation.

URLs : `/`, `/en`, `/de` pour l'accueil ; `/avis`, `/en/reviews`, `/de/bewertungen` ;
`/mentions-legales`, `/en/legal-notice`, `/de/impressum` ; `/confidentialite`, `/en/privacy`,
`/de/datenschutz`. Le français n'est pas préfixé.

## Vérifications déjà faites, et leurs limites

Faites, statiquement : tous les JSON parsent ; les trois catalogues de langue ont des arbres de clés
identiques ; toutes les clés de traduction utilisées dans le code se résolvent, y compris celles
construites dynamiquement depuis `content/property.json` ; aucun tiret cadratin ni double trait
d'union dans la copie visiteur.

Pas faites, faute de Node : `npm install`, `next build`, la vérification TypeScript, les tests
Playwright, Lighthouse. **Prévoir une ou deux itérations sur les logs de build Vercel.**

Points les plus susceptibles de casser au premier build, par ordre de probabilité :
1. une version de dépendance qui a bougé (`next-intl` 4, Tailwind 4, Next 15) ;
2. `src/app/[locale]/opengraph-image.tsx`, qui génère la carte sociale via `next/og` ; en cas de
   problème, supprimer ce seul fichier ne casse rien d'autre ;
3. une erreur de typage sur les assertions de `src/lib/content.ts`.

## Les trois manques bloquants, côté propriétaire

1. **`content/reviews.json` est un tableau vide.** L'export des 165 avis n'a jamais été fourni, et
   inventer des témoignages était exclu. Le badge de note, le bloc d'avis choisis, les citations du
   héros, les données structurées `Review` et la page `/avis` lisent tous ce fichier et affichent
   leur état vide. Déposer l'export, lancer `npm run check:reviews`, et tout s'allume sans toucher au
   code. Le format attendu est dans `content/reviews.schema.json`, les règles de curation issues du
   cahier des charges sont déjà dans `content/reviews-curation.json`.
2. **Aucune photo.** Chaque emplacement affiche un substitut à la bonne taille, donc rien ne casse.
   Les noms de fichiers exacts sont dans `public/IMAGE-MANIFEST.md`.
3. **Identité légale (FR-023).** Nom, statut, SIRET, numéro de déclaration en mairie et email de
   contact sont les `[NEEDS CLARIFICATION]` du cahier des charges. `/mentions-legales` affiche un
   « à compléter » visible pour chacun et reste hors indexation tant qu'ils ne sont pas remplis
   (voir `messages/*.json` sous `legalPage`, et `src/app/robots.ts`).

Conséquence à assumer : le site partira en production sans avis, sans photo et avec des mentions
légales incomplètes. Techniquement complet, visuellement incomplet.

## Décisions prises qui méritent d'être connues

- **Équipements non confirmés non affichés.** `content/property.json` marque wifi, cuisine,
  lave-linge, télévision, terrasse et accès de plain-pied en `"confirmed": false`. Ils ne sont pas
  rendus : le cahier des charges ne les confirmait pas, et annoncer un équipement absent est pire que
  de l'omettre. Basculer le drapeau dès que Corine confirme, et vérifier le texte associé dans les
  trois catalogues.
- **Distances sans chiffre inventé.** Seule la plage porte une mesure (70 m, 2 min). Commerces,
  restaurants et marché affichent « à pied ». Ajouter `distanceM` ou `walkMinutes` quand c'est connu.
- **Deux couleurs dérivées.** Sur le crème, `#CE4257` ne monte qu'à 4,3:1 et `#F25C54` à 3,0:1, sous
  le seuil AA pour du texte courant. `#A8253C` (6,6:1) porte les liens et l'emphase, `#6B5750`
  (6,3:1) le texte secondaire, les accents bruts restent décoratifs. Raisonnement dans
  `src/styles/tokens.css`.
- **Snippets transitions-dev absents.** La skill n'était pas disponible. `src/styles/_root.css`
  reprend les mêmes noms de variables et surtout la même garantie `prefers-reduced-motion` ; les
  transitions sont écrites à la main par-dessus. En collant les snippets officiels, conserver le bloc
  reduced-motion et les `will-change`.
- **ESLint ne bloque pas le build.** `next.config.ts` pose `eslint.ignoreDuringBuilds`, pour qu'une
  règle de style ne fasse pas échouer une mise en ligne. Le lint reste un contrôle à part entière via
  `npm run lint`. TypeScript et le lint anti-tiret cadratin, eux, restent bloquants.
- **Limitation de débit en mémoire** sur l'endpoint de demande. Les instances serverless étant
  recyclées, ce sont le pot de miel et le temps de remplissage minimum qui font l'essentiel du
  travail. Proportionné pour un formulaire sans paiement derrière.

## Variables d'environnement

Toutes optionnelles, le site se dégrade au lieu de casser. À poser dans Vercel :

| Variable | Sans elle |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Les URLs canoniques, `hreflang` et le sitemap pointent vers `https://www.obordeleau.fr`, ce qui est faux tant qu'on est sur une URL `*.vercel.app` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | La carte affiche l'adresse et un lien « ouvrir dans Maps » |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | La carte se charge sans le style de marque |
| `RESEND_API_KEY`, `INQUIRY_TO_EMAIL`, `INQUIRY_FROM_EMAIL` | En développement la demande est écrite dans la console et renvoie un succès ; en production l'endpoint renvoie 500 |

Restreindre la clé Maps au domaine **et** à l'API Maps JavaScript, puis poser un quota dur autour de
300 requêtes par jour : c'est ce qui garantit le coût de 0 EUR (SC-007).

## Après le déploiement

1. Poser `NEXT_PUBLIC_SITE_URL` sur l'URL réellement servie, puis redéployer.
2. Brancher le domaine depuis Hostinger vers Vercel. Sans domaine, la mise en production n'a pas de
   sens pour le référencement.
3. Vérifier à la main : les trois langues, le sélecteur de langue qui garde la page, l'absence totale
   de requête vers Google avant acceptation de la carte, et un envoi réel du formulaire.
4. Lancer les tests une fois Node disponible : `npm run check`, `npm run test:e2e`,
   `npx @lhci/cli autorun`.

## Ce qu'il ne faut pas faire

- Ne rien construire de la Phase 2 (FR-101 à FR-110). Aucune route, aucune dépendance, aucune
  variable d'environnement pour elle n'existe dans ce build, et c'est voulu (constitution VIII).
  Elle ne doit pas sortir avant que la grille tarifaire, les conditions de paiement, l'entité Stripe,
  la politique d'annulation et l'export iCal de Booking soient tous tranchés.
- Ne pas écrire de copie visiteur en dur dans un composant : les faits vont dans `content/`, les mots
  dans `messages/`.
- Ne pas inventer d'avis, de photo, ni de mention légale.
