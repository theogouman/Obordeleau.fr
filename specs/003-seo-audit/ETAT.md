# Etat d'application du plan

Mise a jour du 26 aout 2026, apres application. Le rapport
(`FULL-AUDIT-REPORT.md`) et le plan (`ACTION-PLAN.md`) decrivent l'etat
**avant** ces corrections et restent le point de comparaison.

## Fait

| Ref | Action | Ou |
|---|---|---|
| O1 | Suffixe du site duplique dans les titres des 12 pages internes | `src/lib/seo.ts` |
| O2 | Quatre titres d'accueil ramenes sous 60 caracteres | `messages/*.json` |
| O4 | Description italienne des avis ramenee sous 160 | `messages/it.json` |
| S1 | telephone, email, hasMap, logo, currenciesAccepted, six images au JSON-LD | `src/lib/structured-data.ts` |
| S2 | Note arrondie vers le bas: 4,9 et non 5,0 | `src/lib/reviews.ts` |
| S5 | Une seule URL pour l'entite, quelle que soit la langue | `src/lib/structured-data.ts` |
| L1 | Lien `tel:` et numero en toutes lettres au pied de page | `src/components/Footer.tsx` |
| T1 | URL italiennes: le probleme disparait avec le blocage | `src/app/robots.ts` |
| T2 | Blocage robots retire des pages qui portent deja un noindex | `src/app/robots.ts` |
| T3 | IndexNow: cle publique et script manuel | `scripts/indexnow.mjs` |
| T4 | Barre finale alignee entre canonique et sitemap | `src/lib/seo.ts` |
| I1 | Alt indexable sur la photo du heros | `src/components/Hero.tsx` |
| I2 | Les seize photos du logement declarees au sitemap | `src/app/sitemap.ts` |
| P1 | Avis: mise en page differee hors ecran, sans rien retirer du DOM | `src/styles/reviews.css` |
| P2 | Images sources: 43 Mo a 11 Mo | `public/images/` |
| C1 | Trois guides en quatre langues, 12 a 24 URL au sitemap | `src/app/[locale]/{what-to-do,boat-to-toulon,car-free}` |
| Q1 | 51 cas de non-regression sur le head | `tests/e2e/seo.spec.ts` |

Hors plan, trouve en chemin: le test `reviews.spec.ts` lisait
`content/reviews.json` comme un tableau alors que c'est une enveloppe. Sa
longueur valait `undefined`, donc le garde ne sautait jamais et le compte etait
compare a `undefined`. Il echouait a chaque execution, quoi que fasse la page.
Repare.

## Volontairement non fait

**Le H1 reste inchange** (O3, L2), sur demande. C'etait le constat on-page le
plus lourd du rapport: le titre principal de l'accueil ne contient ni "studio",
ni "Les Sablettes", ni "La Seyne-sur-Mer", et la commune n'apparait que dans le
paragraphe au-dessus. Les guides compensent en partie, puisque leurs H1 portent
le nom du lieu, mais la page d'accueil reste la plus forte du site et son titre
principal ne dit toujours pas ou elle se trouve.

**Le chargement des avis par lots** (P1 du plan). Retirer 138 des 168 avis de la
premiere reponse aurait allege la page, mais ces avis sont ce qu'elle a a
offrir et ce qu'un moteur y lit. `content-visibility` donne le gain de rendu
sans le cout d'indexation, et le HTML reste largement sous la limite de 2 Mo
que Googlebot telecharge.

**Le balisage de prix** (S4, 4.3). `priceRange` attend une valeur dans
`content/property.json`, ou il est a `null`: rien n'est publie tant qu'il l'est.
Une fourchette inventee est pire qu'une fourchette absente, et le moteur de
tarification lit une base de donnees que le rendu statique ne peut pas
interroger au build. `Offer` avec prix et disponibilite reste a faire une fois
la fourchette arretee.

**Les horaires du bateau.** Ils ne sont ni dans le depot, ni verifiables d'ici,
et ils changent selon la saison. La page correspondante dit ou les verifier
plutot que de les recopier. Les y ajouter demande de les faire entrer dans
`content/` avec leur source et leur date.

## A verifier en ligne, hors depot

Ces points pesent plus lourd que tout ce qui precede et ne se traitent pas dans
le code.

1. **La fiche Google Business Profile**: existence, revendication, categorie
   principale, photos, horaires. La question est ouverte depuis
   `seo-keywords.md` et sans reponse. Premier facteur du pack local.
2. **La coherence NAP** entre le site, la fiche Google, Airbnb et Booking. Le
   telephone du site est maintenant celui de `content/legal.json`: verifier que
   c'est bien le meme partout ailleurs.
3. **Le test des resultats enrichis** sur l'URL de production, pour trancher le
   point S3: les avis republies depuis Airbnb et Booking ne sont probablement
   pas eligibles aux etoiles dans les resultats Google. Une minute suffit.
4. **La soumission du sitemap** dans Search Console, et le premier `npm run
   seo:indexnow` apres mise en ligne.

## Un defaut preexistant, non corrige

`tests/e2e/accessibility.spec.ts` echoue sur les sept pages, et echouait deja
avant ce travail: verifie par bisection sur `d59ed37`, le commit qui precede le
premier de cette branche.

Le mot "eau" du logo, en `--color-raspberry-ink` (#a8253c) sur le fond `night`
(#2a1e1b) du pied de page, donne un contraste de 2,3:1 la ou WCAG AA en demande
4,5. Le budget Lighthouse du projet exige pourtant `accessibility: 1`.

Le correctif tient en une ligne, mais il change une couleur de l'identite
visuelle sur fond sombre, ce qui est une decision de design et non une
correction technique. A arbitrer par le proprietaire du site.
