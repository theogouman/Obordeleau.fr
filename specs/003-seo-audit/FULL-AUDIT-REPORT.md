# Audit SEO Obordeleau.fr

Date : 26 aout 2026
Perimetre : analyse statique du code source et du HTML reellement produit par `next build`
(30 pages generees, 4 langues). Aucune donnee de terrain (Search Console, CrUX, GBP)
n'etait accessible depuis cet environnement : les points qui en dependent sont
signales comme "a verifier en ligne" plutot que notes.

Methode : skills `claude-seo` (seo-audit, seo-technical, seo-schema, seo-hreflang,
seo-local, seo-geo, seo-content, seo-images), appliquees au code plutot qu'a un crawl,
ce qui permet de remonter a la cause dans le fichier concerne.

---

## Resume executif

**Score de sante SEO : 69/100**

Type d'activite detecte : hebergement touristique local (brick-and-mortar, un seul
etablissement), site vitrine multilingue avec reservation en direct.

Le socle technique est au-dessus de la moyenne du secteur : rendu serveur statique,
hreflang complet sur quatre langues avec segments d'URL traduits, sitemap genere,
CSP et HSTS, `next/image` partout, textes alternatifs redigees a la main et
descriptifs, JSON-LD `LodgingBusiness` deja riche. Il n'y a aucun probleme
d'indexabilite bloquant.

Ce qui limite le site aujourd'hui n'est pas la technique, c'est la surface de
recherche. Huit URL utiles sont indexables au total (accueil, avis, confidentialite,
fois quatre langues), le H1 de l'accueil ne contient aucun terme de recherche, et le
telephone n'apparait ni dans les donnees structurees ni comme lien cliquable. Les
pages long-tail prevues dans `specs/001-obordeleau-site/seo-keywords.md` (phase 1.5)
n'ont jamais ete construites.

### Les 5 problemes les plus couteux

1. Le suffixe du site est ecrit deux fois dans le titre de toutes les pages internes :
   `Avis des voyageurs | Obordeleau, Les Sablettes | Obordeleau` (12 pages).
2. Le H1 de l'accueil ne contient ni "studio", ni "Les Sablettes", ni "La Seyne-sur-Mer",
   alors que la strategie de mots-cles du repo le prevoyait explicitement.
3. Le titre de l'accueil depasse la largeur affichee par Google (80 caracteres en FR,
   92 en IT) et se fait couper avant "La Seyne-sur-Mer".
4. Le NAP est incomplet : aucun `telephone` dans le JSON-LD, aucun lien `tel:` sur le
   site, alors que le numero existe dans `content/legal.json`.
5. Le site n'a que 3 pages indexables par langue, sans aucun contenu repondant aux
   intentions de recherche identifiees ("que faire aux Sablettes", "navette bateau
   Toulon", "vacances sans voiture").

### Les 5 gains rapides

1. Corriger le template de titre (une ligne dans `src/lib/seo.ts`).
2. Raccourcir les titres d'accueil sous 60 caracteres.
3. Ajouter `telephone`, `email`, `priceRange` et `hasMap` au JSON-LD.
4. Completer `robots.ts` avec les URL italiennes oubliees.
5. Reecrire le H1 pour y placer le lieu sans casser le ton de la page.

---

## SEO technique

**Score : 82/100**

| Categorie | Etat | Detail |
|---|---|---|
| Exploration | pass | robots.txt valide, sitemap declare, aucun blocage de ressource |
| Indexabilite | warn | contradiction robots/noindex, URL italiennes oubliees |
| Securite | pass | HTTPS, CSP par liste d'hotes, HSTS 2 ans, X-Content-Type-Options, Referrer-Policy |
| Structure d'URL | pass | segments traduits par langue, pas de parametre, pas de chaine de redirection |
| Mobile | pass | responsive, viewport, aucun interstitiel |
| Core Web Vitals | warn | budget Lighthouse en place, page /avis lourde (756 Ko de HTML) |
| Donnees structurees | warn | voir section dediee |
| Rendu JavaScript | pass | tout le contenu critique est dans le HTML initial (SSG) |
| IndexNow | fail | non implemente |

### Ce qui fonctionne

Le rendu est statique pour les quatre langues : titres, canoniques, hreflang et JSON-LD
sont tous presents dans la reponse HTML initiale, ce qui est exactement ce que la
documentation JS SEO de Google recommande depuis decembre 2025. Le `<html lang>` est
corrige avant le premier paint par un script inline, sans passer par le rendu dynamique.

### T1. Les URL italiennes manquent dans robots.txt (High)

`src/app/robots.ts` interdit les trois traductions FR, EN et DE des mentions legales et
de la page de solde, mais pas les italiennes. Le fichier genere contient :

```
Disallow: /mentions-legales
Disallow: /legal-notice
Disallow: /impressum
Disallow: /solde
Disallow: /balance
Disallow: /restbetrag
```

`/it/note-legali` et `/it/saldo` ne sont pas couverts. Les deux pages portent bien un
`noindex` par ailleurs, donc l'impact reel est faible, mais la regle ment sur son
intention et le prochain ajout de langue reproduira l'oubli. La correction durable est
de deriver la liste depuis `routing.pathnames` plutot que de l'ecrire a la main.

### T2. Disallow et noindex se contredisent sur les mentions legales (Medium)

Les mentions legales sont a la fois bloquees dans robots.txt et marquees `noindex`
(`src/app/[locale]/legal-notice/page.tsx:24`). Un robot qui respecte le `Disallow` ne
telecharge pas la page, donc ne lit jamais le `noindex`. Google peut alors indexer
l'URL sans description, ce qui est precisement le resultat que le blocage voulait
eviter. Il faut choisir : le `noindex` seul suffit et fonctionne mieux.

Meme remarque pour `/solde` et ses traductions, qui cumulent aussi les deux.

### T3. IndexNow absent (Low)

Bing, Yandex et Naver acceptent une notification directe a chaque publication. Le site
est heberge sur Vercel et deja statique : une route `/[key].txt` plus un ping au
deploiement suffisent. Sans effet sur Google, utile sur le trafic allemand et italien
ou Bing pese plus lourd.

### T4. Incoherence de barre finale entre canonique et sitemap (Low)

L'accueil declare `<link rel="canonical" href="https://www.obordeleau.fr">` sans barre
finale, tandis que le sitemap liste `https://www.obordeleau.fr/` avec. Les deux
repondent, mais un crawler strict voit deux chaines differentes. A aligner sur la forme
avec barre finale, celle que le JSON-LD utilise deja.

---

## SEO on-page

**Score : 60/100**

C'est la categorie la plus penalisante, et celle qui se corrige le plus vite.

### O1. Le suffixe du site est duplique sur toutes les pages internes (High)

Verifie sur le HTML genere :

```
fr/reviews.html      Avis des voyageurs | Obordeleau, Les Sablettes | Obordeleau
fr/privacy.html      Politique de confidentialite | Obordeleau | Obordeleau
fr/legal-notice.html Mentions legales | Obordeleau | Obordeleau
```

Douze pages sont concernees (3 pages fois 4 langues). La cause : `[locale]/layout.tsx`
declare `title.template = '%s | siteName'`, et les fichiers `messages/*.json` ecrivent
deja le nom du site dans chaque titre. Le template s'applique aux segments enfants, pas
a la page d'accueil, ce qui explique que l'accueil y echappe et que le probleme soit
passe inapercu.

Deux corrections possibles : retirer `| Obordeleau` des titres dans les quatre fichiers
de messages, ou renvoyer `title: { absolute: title }` depuis `buildMetadata`. La
seconde est plus sure, parce qu'elle rend chaque page maitresse de son titre complet et
ne depend pas de la vigilance du prochain traducteur.

### O2. Le titre de l'accueil est trop long (High)

| Langue | Longueur | Coupe |
|---|---|---|
| FR | 80 | perd "\| La Seyne-sur-Mer" |
| EN | 72 | perd "from the beach" |
| DE | 67 | perd "zum Strand" |
| IT | 92 | perd "a 70 m dalla spiaggia \| La Seyne-sur-Mer" |

Google affiche environ 60 caracteres. Le nom de la commune, qui est le terme de
recherche le plus commercial du lot, est justement la partie coupee dans trois langues
sur quatre.

Proposition FR (58) : `Studio climatise aux Sablettes, 70 m de la plage | Obordeleau`
Proposition IT (57) : `Monolocale a Les Sablettes, 70 m dalla spiaggia | Obordeleau`

### O3. Le H1 ne porte aucune intention de recherche (High)

`messages/fr.json` produit :

> Ici, tout ce qui fait de bonnes vacances est a **deux minutes** a pied.

C'est une bonne phrase d'accroche, mais elle ne contient ni "studio", ni "location", ni
"Les Sablettes", ni "La Seyne-sur-Mer". Le lieu figure uniquement dans un `<p>`
au-dessus du titre (`hero.eyebrow`). Or `specs/001-obordeleau-site/seo-keywords.md`
prevoyait noir sur blanc : "Homepage (per locale): the primary cluster in H1 + title +
intro". Le H1 est le seul element de la strategie a ne pas avoir ete applique.

Le compromis n'oblige pas a sacrifier le ton. La structure `AccentHeading`
(lead / accent / tail) accepte une formulation qui garde le rythme tout en nommant le
lieu, par exemple :

> Aux Sablettes, la plage est a **deux minutes** a pied.

Le lieu passe en tete, la promesse reste, le mot accentue ne bouge pas.

### O4. Les meta descriptions des mentions legales sont courtes (Low)

Entre 82 et 93 caracteres selon la langue, contre 150 disponibles. Sans consequence :
ces pages sont en `noindex` de toute facon.

### Ce qui fonctionne

La hierarchie de titres est propre (un seul H1 par page, sections en H2 via
`AccentHeading`, H3 dans la section carte). Les descriptions de l'accueil et des avis
sont a la bonne longueur, redigees par benefice, sans bourrage. Le maillage interne est
court : toutes les pages sont a un clic de l'accueil.

---

## Donnees structurees

**Score : 70/100**

Le JSON-LD emis sur l'accueil est deja plus complet que la moyenne du secteur :
`LodgingBusiness` + `VacationRental`, `@id` stable, adresse postale, coordonnees
geographiques, classement 3 etoiles, capacite, surface, 16 `amenityFeature` traduits,
`containsPlace`, `sameAs` vers Airbnb et Booking, `aggregateRating` et 5 avis.
`BreadcrumbList` sur la page avis, `WebSite` rattache a l'entite par `publisher`.

### S1. NAP incomplet : pas de telephone (High)

`src/lib/structured-data.ts` n'emet ni `telephone`, ni `email`, alors que
`content/legal.json` contient `+33 6 01 99 55 58` et que `content/host.json` contient le
numero WhatsApp et l'adresse mail. Pour un etablissement local, le trio nom / adresse /
telephone est le socle de la coherence entre le site, la fiche Google et les
plateformes. Il manque un tiers du trio.

Manquent egalement, tous recommandes pour un hebergement : `priceRange`,
`checkinTime` / `checkoutTime`, `numberOfRooms`, `hasMap`, `logo`, `currenciesAccepted`,
`petsAllowed` (la cle existe mais vaut `undefined` et est supprimee au serialize,
`src/lib/structured-data.ts:59`).

### S2. La note affichee est arrondie a 5,0 alors que la moyenne est 4,96 (Medium)

`averageRating` applique `Math.round(x * 10) / 10` sur 168 avis dont un 3 etoiles,
quatre 4 etoiles et deux 4,5. La moyenne exacte est 4,958, publiee comme `5`.

Mathematiquement defendable, mais un 5,0 parfait sur 168 avis est le profil que les
systemes de detection de faux avis surveillent, et la page elle-meme affiche un avis a
3 etoiles juste en dessous. Publier `4.9` (arrondi vers le bas) ou la valeur exacte est
plus solide et tout aussi flatteur.

### S3. Les avis auto-heberges ne sont probablement pas eligibles aux rich results (Medium)

Depuis septembre 2019, Google n'accorde pas d'extrait enrichi aux avis qu'une entreprise
publie sur son propre site a propos d'elle-meme, pour les types `LocalBusiness` et
`Organization`, dont `LodgingBusiness` herite. Les avis viennent en plus d'Airbnb et de
Booking, donc republies depuis une plateforme tierce.

Le balisage n'est pas nuisible et reste utile aux moteurs de reponse, mais il ne faut
pas compter dessus pour des etoiles dans les resultats Google. A verifier avec le test
des resultats enrichis sur l'URL en production, et a ne pas presenter au proprietaire
comme un gain acquis.

### S4. Aucune donnee de prix ou de disponibilite (Medium)

Le site embarque un moteur de tarification et de reservation complet (`src/lib/pricing.ts`,
`/api/quote`, Stripe), mais rien n'en ressort dans le balisage. Un `Offer` ou un
`makesOffer` portant `priceCurrency`, `priceSpecification` et `availability` donne aux
moteurs, et surtout aux assistants de recherche, la matiere pour repondre a "combien
coute" sans quitter la page.

### S5. Le meme @id porte quatre URL differentes (Low)

`@id` vaut `https://www.obordeleau.fr/#lodging` dans les quatre langues, ce qui est
correct : c'est bien une seule entite. Mais `url` change avec la langue, ce qui envoie
un signal contradictoire. Le plus propre est de figer `url` sur la version francaise
canonique et de laisser `inLanguage` porter la difference.

---

## Contenu et E-E-A-T

**Score : 62/100**

### C1. La surface de recherche est trop petite (High)

Trois pages indexables par langue : accueil, avis, confidentialite. La page
confidentialite ne captera jamais de recherche commerciale. Il reste donc deux pages
utiles par langue, dont une seule vise reellement des requetes de sejour.

`specs/001-obordeleau-site/seo-keywords.md` avait identifie les intentions manquantes et
prevu une phase 1.5 : "Que faire aux Sablettes", "Rejoindre Toulon et Porquerolles en
bateau depuis Les Sablettes", "Vacances sans voiture aux Sablettes". Aucune n'existe.

Ce sont exactement les requetes qu'un voyageur formule avant d'avoir choisi son
logement, donc en amont du moment ou il compare des annonces. Elles sont aussi peu
disputees par les plateformes, qui ne produisent pas ce type de contenu. C'est le
levier de croissance le plus important du site, et de loin.

Le contenu source existe deja : `content/property.json` porte quatre points d'interet
avec distances et temps de marche verifies, les photos de quartier sont dans
`public/images/area/`, et les 168 avis contiennent des descriptions de premiere main du
quartier.

### C2. L'italien a ete ajoute sans recherche de mots-cles (Medium)

Le document de strategie couvre le francais, l'anglais et l'allemand. L'italien est
arrive ensuite : les traductions sont bonnes, mais aucune requete italienne n'a ete
etudiee, et le titre italien est le plus long des quatre (92 caracteres). Le marche
italien est pourtant pertinent pour le Var. A traiter comme les trois autres.

### Ce qui fonctionne

Le contenu est original, ecrit a la main, et il tient sans remplissage : environ 2 000
mots sur l'accueil, dont une section "autour" avec des distances chiffrees et une page
d'hote nominative. Les signaux E-E-A-T sont la ou ils comptent pour un hebergement :
l'hote est nommee et montree, les avis sont reels, dates, non filtres et affiches sans
tri, et les mentions legales identifient les deux personnes distinctes. Le principe
"aucun fait qui ne vienne de `content/*.json`" est une protection efficace contre les
incoherences de NAP.

---

## SEO local

**Score : 64/100**

Facteur le plus lourd du pack local, la fiche Google Business Profile, non verifiable
depuis ici. Le document de strategie porte encore la question ouverte
`[NEEDS CLARIFICATION: is there an existing Google Business Profile?]`. Si la fiche
n'existe pas ou n'est pas revendiquee, c'est le point numero un du plan d'action,
devant tout le reste de ce rapport.

### L1. Pas de lien cliquable vers le telephone (High)

Le pied de page propose WhatsApp et l'e-mail, jamais un `tel:`. Sur mobile, ou se joue
l'essentiel des recherches "location Les Sablettes", le clic-pour-appeler est le
raccourci de conversion le plus direct, et le numero visible en clair est aussi un
signal de coherence NAP lu par les moteurs.

WhatsApp ne le remplace pas : le numero n'apparait pas en texte, il est encode dans une
URL `wa.me`.

### L2. Le nom de la commune est absent du H1 (High)

Voir O3. Pour une recherche locale, le couple ville plus type de bien dans le H1 reste
un des signaux on-page les plus directs.

### L3. La carte se charge apres consentement (Low, a conserver)

`MapEmbed` n'affiche Google Maps qu'apres accord explicite. C'est le bon arbitrage :
la carte n'est pas un facteur de classement direct, et le choix protege le RGPD et le
LCP. A garder tel quel.

### Points a verifier en ligne

- Fiche Google Business Profile : existence, categorie principale, photos, horaires.
- Coherence NAP entre le site, la fiche Google, Airbnb et Booking.
- Presence dans les annuaires locaux (office de tourisme de La Seyne-sur-Mer,
  Var Tourisme, classement meuble de tourisme).

---

## Performance

**Score : 78/100**

### P1. La page avis pese 756 Ko de HTML (Medium)

Les 168 avis sont rendus cote serveur avec leurs traductions dans les quatre langues,
plus 159 avatars passes par `next/image`. Le HTML seul fait 756 Ko avant les images.
L'accueil, par comparaison, fait 276 Ko.

C'est sous la limite de 2 Mo que Googlebot telecharge, donc rien n'est perdu pour
l'indexation, mais cela pese sur le LCP et l'INP mobile. Une premiere fournee d'avis
rendue cote serveur, le reste charge a la demande, garderait le contenu indexable tout
en divisant le poids initial.

### P2. Images sources tres lourdes (Medium)

| Fichier | Poids |
|---|---|
| `public/images/host/corine-pierret.png` | 2,3 Mo |
| `public/images/annexes/laurel-right.png` | 1,3 Mo |
| `public/images/annexes/meuble-de-tourisme.png` | 1,0 Mo |
| `public/images/area/*.jpeg` | 660 Ko a 920 Ko chacune |
| `public/images/reviews/` (161 fichiers) | 28 Mo au total |

`next/image` les reencode a la volee en AVIF et WebP, donc le visiteur ne recoit pas ces
poids. Mais chaque original alourdit le depot, le temps de build et la premiere
generation de chaque variante. Un portrait de 2,3 Mo en PNG est une photographie
enregistree dans un format concu pour les aplats : le meme rendu tient dans moins de
200 Ko en JPEG. Les avatars d'avis, affiches a 40 pixels, ne justifient pas des sources
de 1 200 pixels de cote.

### Ce qui fonctionne

Generation statique des 30 pages, polices auto-hebergees par `next/font` sans requete
tierce, ratio d'aspect toujours reserve dans `SmartImage` (CLS maitrise meme quand une
photo manque), `priority` sur la seule image LCP du heros avec son `preload` correct,
budget Lighthouse verrouille dans `lighthouserc.json` (performance 0,9, SEO 1,
accessibilite 1, LCP 2,5 s, CLS 0,1).

---

## Images

**Score : 75/100**

Les textes alternatifs sont le meilleur travail du site : ecrits un par un, en quatre
langues, descriptifs sans bourrage ("Le sejour vu depuis le bar, le canape, la banquette
sous la baie vitree et le meuble tele"). Rien a redire.

### I1. La photo principale n'a pas de texte alternatif exploitable (Medium)

Le triptyque du heros porte `alt=""` sur ses trois fragments, avec un `aria-label` sur
le conteneur `role="img"`. Le choix est juste pour un lecteur d'ecran, puisque les trois
fragments sont une seule photo. Mais Google Images ne lit pas `aria-label` pour indexer
une image : la photo la plus visible du site n'a aucun texte associe. Poser l'alt
descriptif sur le premier fragment et laisser les deux autres vides preserve les deux
usages.

### I2. Pas de sitemap images (Low)

Seize photos du logement, quatre du quartier, aucune declaree dans le sitemap. Pour une
location saisonniere, ou la recherche se fait beaucoup a l'oeil, c'est un canal
sous-exploite.

---

## Visibilite dans les moteurs de reponse

**Score : 60/100**

### G1. Pas de `llms.txt` (Low)

Aucun moteur ne s'est engage a le lire, et Google le classe explicitement parmi les
recommandations sans effet demontre. A traiter comme tel : cout quasi nul, benefice non
prouve, a ne pas prioriser.

### G2. Le contenu est peu citable en l'etat (Medium)

Les assistants de recherche extraient des passages autonomes de 130 a 170 mots
repondant a une question precise. Le contenu de l'accueil est ecrit en continuite
narrative, ce qui est agreable a lire mais difficile a extraire : peu de titres
formules en question, peu de blocs qui se suffisent a eux-memes.

Les faits qui feraient une bonne citation existent pourtant et sont verifies : 70 m de
la plage, deux minutes a pied, bateau-bus au pied de la residence, 33 m2, quatre
personnes, classe 3 etoiles, 168 avis a 4,96. Ils sont disperses dans la prose et dans
`content/property.json` plutot que rassembles dans un passage extractible.

Les pages long-tail de C1 sont le bon endroit pour cela : une question en titre, la
reponse en tete de section, les chiffres dans le texte.

### Ce qui fonctionne

Tous les robots sont autorises sans distinction dans robots.txt, y compris GPTBot,
ClaudeBot et PerplexityBot. Pour un hebergement qui vit de sa visibilite, c'est le bon
arbitrage. Le JSON-LD factuel et le contenu entierement dans le HTML initial servent
directement ces moteurs.

---

## Assurance qualite

### Q1. Aucun test de non-regression SEO (Medium)

La suite Playwright couvre l'accessibilite, la galerie, le parcours et les avis. Rien ne
verifie les titres, les canoniques, les hreflang ni le JSON-LD. Le titre duplique de O1
serait apparu au premier commit avec un test de dix lignes.

Un fichier `tests/e2e/seo.spec.ts` verifiant, pour chaque langue : un seul H1, un titre
sous 60 caracteres sans nom de site repete, un canonique auto-referent, cinq alternates
hreflang, et un JSON-LD `LodgingBusiness` valide portant telephone et adresse, suffit a
figer les corrections de ce rapport.

---

## Detail du score

| Categorie | Poids | Note | Contribution |
|---|---|---|---|
| SEO technique | 22 % | 82 | 18,0 |
| Qualite de contenu | 23 % | 62 | 14,3 |
| On-page | 20 % | 60 | 12,0 |
| Donnees structurees | 10 % | 70 | 7,0 |
| Performance | 10 % | 78 | 7,8 |
| Moteurs de reponse | 10 % | 60 | 6,0 |
| Images | 5 % | 75 | 3,8 |
| **Total** | | | **69/100** |

Le score local (64) n'entre pas dans la ponderation standard : il recoupe les categories
on-page, donnees structurees et contenu.

---

## Comment savoir si ce rapport se trompe

Chaque constat ci-dessus est verifiable sans relancer d'audit :

- **Titres dupliques** : `grep -o "<title>[^<]*</title>" .next/server/app/fr/reviews.html`
  apres build. Corrige si "Obordeleau" n'apparait qu'une fois.
- **H1 sans mot-cle** : si les positions sur "studio Les Sablettes" ne bougent pas trois
  mois apres la reecriture du H1, l'hypothese etait fausse et le frein est ailleurs
  (autorite du domaine, fiche Google).
- **Surface de recherche** : le nombre de requetes distinctes rapportant au moins une
  impression dans Search Console. S'il stagne apres publication des pages long-tail,
  c'est le sujet des pages qui est mal choisi, pas leur absence.
- **Avis auto-heberges** : le test des resultats enrichis sur l'URL de production tranche
  en une minute. S'il affiche les etoiles, le point S3 est a ignorer.
- **Poids de la page avis** : `du -h .next/server/app/fr/reviews.html`.

Indicateurs a suivre sans reauditer : nombre de pages indexees et nombre de requetes
uniques dans Search Console, part du trafic mobile depuis la recherche locale, et
volume d'appels ou de messages WhatsApp entrants apres l'ajout du lien `tel:`.
