# 002 Galerie photos, onglets liquides et visionneuse morph

Statut : **en attente de validation**. Aucune ligne de code n'est écrite tant que
la section 4 n'est pas arbitrée.

Source : brief client « Nouvelle galerie photos Obordeleau.fr ». Ce document
n'est pas un résumé du brief : il enregistre l'écart entre le brief et le dépôt
à jour (`1a52a43`), et il fige ce qui sera construit.

## 1. Inventaire vérifié

Dépôt synchronisé sur `origin/main` le 2026-08-23. Les 20 photos ont bien été
remplacées par `75f7ea6`, et les 5 icônes SF Symbols sont arrivées avec
`1a52a43`. Les 20 fichiers ont été ouverts un par un.

- 20 fichiers `gallery-01.jpg` à `gallery-20.jpg`, tous en paysage, tous à
  2048 px de large. Dix-sept sont en 4:3 exact, trois (`06`, `15`, `18`) sont en
  2048x1473, soit 1,39:1. Quatre pour cent d'écart, invisible en `cover`. La
  grille et la visionneuse restent en 4:3 partout, comme le brief le demande.
- Les 16 `alt` de `messages/*.json` décrivent l'ancien jeu de photos et sont donc
  bien tous faux aujourd'hui, et il en manque quatre. **Les 20 sont à écrire**,
  en quatre langues.
- `sofa.svg`, `bed.double.fill.svg`, `fork.knife.svg`, `shower.fill.svg` et
  `photo.svg` sont en place, même exporteur Apple CoreSVG que les 15 icônes déjà
  inlinées dans `src/components/Icon.tsx`.

## 2. Classement : cinq erreurs dans la table du brief

La table 3.3 est juste pour quinze photos. Cinq sont mal rangées, vérifié à
l'image :

| Fichier | Le brief dit | La photo montre |
| --- | --- | --- |
| `gallery-13` | séjour, banquette sous la baie vitrée | la cuisine : évier, lave-linge, mur de briques de verre, et la niche du lit au fond |
| `gallery-15` | coin nuit, lit double face à la baie vitrée | la salle d'eau : douche, lavabo, miroir |
| `gallery-16` | canapé du séjour et meuble télé | le bar : plan, micro-ondes, bouilloire, étagère à verres, deux tabourets |
| `gallery-17` | plan de travail, évier, micro-ondes | le séjour : télévision, long meuble bas, banquette sous la baie vitrée |
| `gallery-19` | lavabo, miroir, douche | la pièce principale : le lit ouvert, le miroir, la baie vitrée |

Un sixième est discutable : `gallery-12` est rangé en cuisine pour son bar, mais
l'image est dominée par le canapé, le bar n'étant qu'au fond. Il passe au séjour.

### Classement retenu

| id | libellé FR | icône | photos, dans l'ordre | rangées |
| --- | --- | --- | --- | --- |
| `living` | Le séjour | `sofa` | 07, 01, 12, 05, 17 | `[2,3]` |
| `kitchen` | Cuisine et bar | `fork.knife` | 02, 16, 20, 13 | `[2,2]` |
| `bed` | Le coin nuit | `bed.double.fill` | 03, 04, 19, 11 | `[2,2]` |
| `bath` | Salle d'eau | `shower.fill` | 18, 15 | `[2]` |
| `overview` | Vue d'ensemble | `photo` | 14, 09, 06, 08, 10 | `[2,3]` |

Cinq onglets, comme le brief le veut. Vingt photos, aucune rangée orpheline,
chaque pièce ouvre sur sa meilleure vue d'ensemble.

Ordre des onglets et de la visionneuse : `living, kitchen, bed, bath, overview`.
Actif par défaut : `living`, ouvert sur `gallery-07`.

Le coin nuit réunit les deux couchages, qui sont deux endroits différents : la
niche fermée avec le lit fixe (03, 04) et le canapé-lit ouvert dans la pièce
principale (19, 11). C'est une information utile au voyageur, les `alt` le
diront.

Deux remarques de qualité, sans effet technique : `11` et `19` sont deux prises
presque identiques du lit ouvert, et `04` est une photo faible, cadrée sur un lit
vide et un mur. Les retirer donnerait `bed` à 2 et `overview` à 5. À dire si tu
veux.

## 3. Défilement des onglets sur mobile

Décision prise : **le rail défile horizontalement, avec un fondu sur les bords
quand il déborde.**

Le brief affirme que la surface liquide ne peut pas défiler. C'est vrai du tracé
tel qu'il est écrit, parce qu'il dessine d'un seul trait la bosse **et** le bord
supérieur du panneau avec ses deux coins arrondis : faire défiler l'ensemble
emporterait les coins du panneau hors de l'écran.

La séparation lève l'obstacle :

- Le **panneau** porte lui-même son fond blanc et ses coins hauts arrondis, en
  CSS. Il ne défile pas.
- La **surface** ne dessine plus que la bosse et ses raccords liquides, et se
  termine à plat sur la ligne de base, avec 2 px de recouvrement sur le panneau.
  Les deux blancs fusionnent, la jointure est invisible. `surfacePath()` perd sa
  queue (`Q`, `V` des coins du panneau) et garde tout le reste, bosse, rayons et
  courbes de raccord compris.
- Le SVG est tracé à la largeur du **contenu**, pas du cadre, et vit dans le
  conteneur qui défile. La bosse défile donc avec son onglet, toujours dessous.

Une seule formule produit les deux comportements :

```
tabW = max(mesureDuPlusLargeOnglet, (inner - GAP * (n - 1)) / n)
```

Sur desktop le second terme gagne : les onglets sont collés, de largeur égale, et
remplissent le cadre, exactement comme le brief le demande. Sous le point de
bascule le premier gagne : les onglets gardent leur largeur lisible et le rail
déborde, donc il défile. Aucun palier codé en dur, et la mesure étant faite sur
le rendu réel, l'allemand et l'italien décalent le point de bascule tout seuls
au lieu de tronquer un libellé.

Le fondu est un `mask-image` sur le conteneur, posé seulement du côté qui déborde
vraiment, piloté par la position de défilement (`data-overflow`). Les onglets se
dissolvent dans le cadre sable au lieu d'être coupés net.

Le rail ramène l'onglet actif dans le champ quand il change, y compris quand
c'est la visionneuse qui change de pièce, en `smooth` sauf sous
`prefers-reduced-motion`.

Conséquence assumée : sous le point de bascule, les onglets ne remplissent plus
le cadre. C'est le choix demandé, et il préserve les libellés entiers plutôt que
de tomber sur des icônes muettes.

## 4. Décisions, arbitrées

1. **Tokens** : ceux du site. Le cadre `#f1e9e0` et le panneau `#ffffff` du
   brief existent déjà comme `--color-sand` (`#f1eae0`, un chiffre hexadécimal
   d'écart) et `--color-shell`. Aucun littéral nouveau.
2. **Onglets sur mobile** : le rail défile, avec un fondu sur les bords. Voir
   section 3.
3. **Reclassement des cinq photos** : appliqué, section 2.
4. **Les vingt photos sont gardées**, `04` et la paire `11` / `19` comprises.

## 5. Plan de fichiers

| Action | Fichier | Rôle |
| --- | --- | --- |
| créer | `src/components/gallery/GalleryTabs.tsx` | client, rail défilant, surface liquide, visibilité des panneaux, clavier |
| créer | `src/components/gallery/GalleryPanel.tsx` | serveur, un panneau de pièce, titre et grille |
| créer | `src/components/gallery/GalleryTile.tsx` | client, tuile cliquable portant le `layoutId` |
| créer | `src/components/gallery/PhotoLightbox.tsx` | client, morph `layoutId`, cadre, navigation continue |
| créer | `src/components/gallery/liquid-path.ts` | `surfacePath()` et constantes, crédit beUI en tête |
| créer | `src/components/gallery/gallery-layout.ts` | `rowsFor()` |
| créer | `src/styles/gallery.css` | styles du bloc, importé par `globals.css` |
| modifier | `src/components/Gallery.tsx` | serveur, compose les données i18n et monte l'ensemble |
| modifier | `src/components/Icon.tsx` | 5 glyphes de pièce, `currentColor`, rectangle transparent retiré |
| modifier | `src/lib/content.ts` | `RoomId`, `ROOM_ORDER`, `galleryByRoom`, `gallerySequence`, retrait de `featuredGallery` |
| modifier | `content/property.json` | `room`, `width`, `height`, ordre, retrait de `featured` |
| modifier | `messages/{fr,en,de,it}.json` | 20 `alt` neufs, `gallery.rooms.*`, `gallery.roomSub.*`, `gallery.lightbox.roomCounter` |
| modifier | `package.json` | `framer-motion` |
| supprimer | `src/components/GalleryGrid.tsx` | remplacé |
| ajouter | `tests/e2e/gallery.spec.ts` | onglets, visionneuse, présence SSR des 20 photos |

`RoomIcon.tsx` n'est pas créé : `Icon.tsx` fait déjà exactement ce que le brief
lui demande, un second composant d'icônes serait un doublon.

`close`, `previous` et `next` existent déjà sous `common` et sont réutilisés.
`gallery.counter` existe. Seuls s'ajoutent les 5 libellés, les 5 sous-titres et
`roomCounter`.

`featuredGallery` est exporté par `content.ts` et consommé nulle part : il part,
et le champ `featured` avec.

`width` et `height` entrent dans `property.json`, ce qui donne à `next/image` de
quoi réserver la place et supprime le CLS de la grille.

## 6. Rendu sans JavaScript

Contrainte constitution IV et V, et exigence du brief.

Le serveur rend **les 5 panneaux empilés**, chacun avec son titre de pièce et sa
grille complète, `alt` compris, plus une barre de liens d'ancrage. Sans JS, la
page est une galerie classique en 5 sections, entièrement navigable.

À l'hydratation, `GalleryTabs` masque les panneaux inactifs, pose
`role="tablist"`, `role="tab"` et `aria-selected` sur les ancres depuis un effet
(des attributs posés en effet ne provoquent aucune divergence d'hydratation) et
intercepte le clic. Flèches gauche et droite, `tabindex` mobile, focus visibles.

La bosse demande une largeur mesurée, donc elle n'existe pas au premier rendu.
Comme le panneau porte déjà son propre fond blanc et ses coins arrondis
(section 3), il n'y a rien à masquer et aucun flash : la surface est purement
additive.

Conséquence pour la visionneuse : un panneau masqué est en `display: none`, donc
sa vignette n'a pas de boîte et ne peut pas servir de cible de morph. Le suivi de
l'onglet actif par la visionneuse n'est pas un confort, c'est ce qui rend la
fermeture possible.

## 7. Dépendance et coût

Pas de fichier de verrou dans le dépôt : Vercel lance `npm install`, donc ajouter
`framer-motion` à `package.json` suffit. Rien n'est installable ici, il n'y a ni
`node` ni `npm` sur cette machine, la compilation se vérifie sur Vercel.

`framer-motion` pèse environ 34 Ko compressés, sur la page d'accueil, donc dans
le chemin critique. Les animations de disposition exigent le jeu complet, la
version allégée n'y suffit pas. `PhotoLightbox` passe par `next/dynamic`, son
code n'arrive qu'à la première ouverture. Le reste est mesuré au Lighthouse déjà
configuré ; si le budget LCP bouge, la question se rouvre.

## 8. Mouvement

- Bosse : ressort Framer `stiffness 700, damping 50, mass 0.5`, suramorti, aucun
  rebond. Premier rendu en `jump()`, pas d'animation au chargement.
- Panneau : `translateY 8px`, opacité, `blur 2px`, `--duration-slow`,
  `--ease-out-expo`.
- Morph d'image : ressort `stiffness 300, damping 30`, interruptible, l'image ne
  fond jamais, le fond ne zoome jamais.
- `prefers-reduced-motion` : `useReducedMotion` coupe les ressorts côté JS,
  `_root.css` écrase les durées côté CSS, la visionneuse tombe sur un fondu. Les
  deux gardes, pas un seul.
- On anime `transform`, `opacity`, `filter`. Jamais `width`, `top`,
  `box-shadow`. Le recalcul du tracé n'est pas une transition de largeur.

## 9. Contrôle constitution

| Principe | Verdict |
| --- | --- |
| II, données hors code | `room`, `width`, `height` dans `property.json`, aucun libellé en dur |
| III, i18n | 20 `alt` plus 10 libellés écrits en quatre langues, aucune chaîne codée |
| IV, performance | +34 Ko, visionneuse différée, `width`/`height` supprimant le CLS |
| V, accessibilité | contenu complet sans JS, `tablist` clavier, `dialog` modal avec piège de focus, double garde reduced-motion |
| VII, copie | aucun tiret cadratin, vérifié par `scripts/no-emdash.mjs` |

Aucune dérogation demandée.

## 10. Ordre d'exécution

1. Ce document, validé. **Point d'arrêt.**
2. Données : `property.json`, `content.ts`, 20 `alt` et 10 libellés en 4 langues.
3. `liquid-path.ts`, `gallery-layout.ts`, glyphes dans `Icon.tsx`.
4. `GalleryTabs`, `GalleryPanel`, `GalleryTile`, `gallery.css`.
5. `PhotoLightbox`.
6. Composition dans `Gallery.tsx`, retrait de `GalleryGrid.tsx`.
7. Passe reduced-motion, test e2e, `npm run check` et build sur Vercel.

Un commit par étape, sur `feat/gallery-liquid-tabs`.
