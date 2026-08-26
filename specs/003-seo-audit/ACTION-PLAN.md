# Plan d'action SEO Obordeleau.fr

Issu de `FULL-AUDIT-REPORT.md`, 26 aout 2026. Les actions sont ordonnees par rapport
entre impact et cout, et sequencees selon leurs dependances : la phase 1 est du code,
la phase 2 ouvre le sujet du contenu, la phase 3 le remplit.

Aucune action de ce plan n'est bloquante pour l'indexation : le site est correctement
explore et indexable aujourd'hui. Il s'agit de gagner de la surface et de la precision,
pas de reparer une panne.

---

## Phase 0 : hors code, a verifier en premier (semaine 1)

Ces deux points pesent plus lourd que tout le reste du plan et ne se traitent pas dans
le depot.

| # | Action | Pourquoi |
|---|---|---|
| 0.1 | Verifier l'existence et la revendication de la fiche Google Business Profile | Premier facteur du pack local. La question est encore ouverte dans `seo-keywords.md`. |
| 0.2 | Aligner le NAP entre site, fiche Google, Airbnb et Booking | La coherence du trio nom / adresse / telephone conditionne la confiance locale. |

Si la fiche n'existe pas, la creer passe avant toute action de la phase 1.

---

## Phase 1 : corrections de code (semaine 1, environ une demi-journee)

Toutes independantes les unes des autres, toutes verifiables par un build.

| # | Action | Fichier | Priorite |
|---|---|---|---|
| 1.1 | Supprimer la duplication du nom de site dans les titres | `src/lib/seo.ts` ou `messages/*.json` | High |
| 1.2 | Raccourcir les quatre titres d'accueil sous 60 caracteres | `messages/*.json` | High |
| 1.3 | Ajouter `telephone`, `email`, `priceRange`, `hasMap`, `logo` au JSON-LD | `src/lib/structured-data.ts` | High |
| 1.4 | Ajouter un lien `tel:` dans le pied de page, a cote de WhatsApp | `src/components/Footer.tsx` | High |
| 1.5 | Deriver les `Disallow` depuis `routing.pathnames` | `src/app/robots.ts` | High |
| 1.6 | Retirer le `Disallow` des pages deja en `noindex` | `src/app/robots.ts` | Medium |
| 1.7 | Publier la note exacte plutot qu'arrondie a 5,0 | `src/lib/reviews.ts` | Medium |
| 1.8 | Poser l'alt descriptif sur le premier fragment du heros | `src/components/Hero.tsx` | Medium |
| 1.9 | Aligner la barre finale entre canonique et sitemap | `src/lib/seo.ts` | Low |
| 1.10 | Supprimer la cle morte `petsAllowed: undefined` | `src/lib/structured-data.ts` | Low |

Pour 1.3, le numero est deja dans `content/legal.json` et `content/host.json` : aucune
donnee nouvelle a saisir, il s'agit de la faire remonter.

Pour 1.7, remplacer `Math.round(x * 10) / 10` par un arrondi vers le bas donne 4,9, qui
est a la fois exact et coherent avec l'avis a 3 etoiles affiche sur la page.

**Verification de fin de phase** : `npm run build` puis relire les titres generes, le
robots.txt et le JSON-LD dans `.next/server/app/`.

---

## Phase 2 : filet de securite et H1 (semaine 2)

| # | Action | Priorite |
|---|---|---|
| 2.1 | Reecrire le H1 des quatre langues pour y placer la commune sans casser le ton | High |
| 2.2 | Ajouter `tests/e2e/seo.spec.ts` : un H1, titre sous 60 caracteres, canonique auto-referent, 5 hreflang, JSON-LD valide avec telephone | Medium |

2.2 vient apres 2.1 pour que le test soit ecrit contre l'etat corrige, et non contre
l'etat actuel qu'il faudrait ensuite modifier.

Le H1 est traite a part de la phase 1 parce que c'est une decision editoriale, pas une
correction technique : la formulation doit etre validee par le proprietaire avant
d'etre traduite quatre fois.

---

## Phase 3 : surface de recherche (mois 2)

C'est le levier principal. Les pages etaient deja prevues dans
`specs/001-obordeleau-site/seo-keywords.md`, phase 1.5, jamais construite.

| # | Page | Intention visee |
|---|---|---|
| 3.1 | Que faire aux Sablettes | recherche d'inspiration, en amont du choix du logement |
| 3.2 | Rejoindre Toulon et Porquerolles en bateau depuis Les Sablettes | requete pratique, tres peu disputee |
| 3.3 | Des vacances sans voiture aux Sablettes | requete de differenciation, alignee sur l'atout principal du bien |

Regles de construction, tirees des garde-fous de qualite des skills :

- Une page ne sort que si elle apporte une information que ni Airbnb ni un office de
  tourisme ne donnent : distances mesurees, horaires reels, photos prises sur place.
- Chaque page commence par une reponse autonome de 130 a 170 mots, extractible sans
  contexte, avec les chiffres dedans. C'est ce qui la rend citable par les moteurs de
  reponse et lisible par un visiteur presse.
- Un titre formule comme une question, des sections courtes, un tableau quand il y a
  des chiffres a comparer.
- Deux a cinq liens internes contextuels vers l'accueil et la page avis, avec des
  ancres descriptives.
- Quatre langues des la publication, sitemap et hreflang inclus (les deux sont
  automatiques dans l'architecture actuelle : il suffit d'ajouter l'entree dans
  `routing.pathnames` et dans `sitemap.ts`).

Le contenu source existe : distances verifiees dans `content/property.json`, photos de
quartier dans `public/images/area/`, et 168 avis qui decrivent le quartier de premiere
main.

**Prealable** : valider les volumes de recherche avec un outil de mots-cles avant de
figer les titres. Le document de strategie le demandait deja et ce point n'a jamais ete
leve.

---

## Phase 4 : optimisations de fond (mois 2 a 3)

| # | Action | Priorite |
|---|---|---|
| 4.1 | Rendre les 30 premiers avis cote serveur, charger le reste a la demande | Medium |
| 4.2 | Reencoder les images sources lourdes (portrait PNG 2,3 Mo, lauriers, avatars) | Medium |
| 4.3 | Ajouter `Offer` avec prix et disponibilite au JSON-LD | Medium |
| 4.4 | Recherche de mots-cles pour l'italien, au meme niveau que FR, EN et DE | Medium |
| 4.5 | Declarer les images du logement dans le sitemap | Low |
| 4.6 | Implementer IndexNow pour Bing | Low |

4.3 depend de la stabilisation du moteur de tarification : un prix balise doit
correspondre au prix affiche, sinon le balisage devient un risque plutot qu'un gain.

---

## Ce qu'il ne faut pas faire

- **Pas de `FAQPage`** : Google a retire les resultats enrichis FAQ pour tous les sites
  le 7 mai 2026. Aucun benefice en resultats de recherche.
- **Pas de `HowTo`** : type deprecie depuis septembre 2023.
- **Pas de pages par ville alentour** ("location Toulon", "location Six-Fours") : un
  seul bien, une seule adresse. Ces pages seraient des pages satellites, exactement le
  motif sanctionne par les mises a jour de qualite.
- **Ne pas retirer le consentement avant chargement de la carte** : le gain SEO serait
  nul et le cout en conformite reel.
- **Ne pas compter sur `llms.txt`** : Google le classe parmi les recommandations sans
  effet demontre.

---

## Suivi

Indicateurs a regarder chaque mois, sans relancer d'audit :

| Indicateur | Ou | Ce qu'il dit |
|---|---|---|
| Nombre de requetes uniques avec impressions | Search Console | si la surface de recherche s'elargit (phase 3) |
| Pages indexees | Search Console | si les nouvelles pages sont prises en compte |
| Position moyenne sur "studio Les Sablettes" | Search Console | si la phase 2 a porte |
| Appels et messages entrants | telephone, WhatsApp | si le lien `tel:` de 1.4 convertit |
| Core Web Vitals sur `/avis` | Search Console, CrUX | si 4.1 etait necessaire |

Si trois mois apres la phase 3 le nombre de requetes uniques n'a pas bouge, le frein
n'est pas la surface de contenu mais l'autorite du domaine, et la suite se joue sur les
citations locales et la fiche Google, pas sur le site.
