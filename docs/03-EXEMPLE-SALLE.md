# EscapeUp — Exemple de salle générée et validée

> **Phase 3** — Une escape room complète, produite comme le ferait le pipeline
> (seed `LAB-7C42`, profil **moyen**), avec sa validation étape par étape.
> Le JSON complet correspondant : [`examples/salle-labo-7C42.json`](../examples/salle-labo-7C42.json).

---

## 1. Fiche de salle

| | |
|---|---|
| **Seed** | `LAB-7C42` |
| **Thème** | Laboratoire abandonné |
| **Titre** | *Protocole P-7* |
| **Objectif joueur** | Déclencher la purge de décontamination pour lever le confinement et sortir |
| **Zones** | 3 (accueil → salle d'expérimentation → réserve chimique) |
| **Puzzles** | 6 |
| **Durée estimée** | ~35 min |

### Histoire implicite (backstory interne — jamais montrée telle quelle)

Le 12 mars 1987, une fuite du composé **VX-Hélios** s'est produite dans la cuve principale du laboratoire Helios. Le Dr Elias Verne a déclenché le confinement d'urgence avant de disparaître. Le technicien de maintenance **Marc Roux**, notoirement négligent, a laissé derrière lui son badge et un casier au code prévisible. Des années plus tard, le joueur — enquêteur mandaté — entre par le sas de service. Le confinement ne se lèvera que si la cuve est neutralisée selon le **protocole P-7** que Verne avait consigné.

Le joueur *reconstitue* cette histoire : le mémo agacé contre Roux, le rapport d'incident, le post-it désabusé de Verne, le protocole dans son journal. Chaque indice de puzzle est aussi un fragment narratif — c'est la double fonction exigée par le GDD (§4).

---

## 2. Graphe de solution généré

Généré **à rebours** depuis l'objectif (l'ordre de génération est l'inverse de l'ordre de jeu) :

```
COUCHE 0 — Accueil (Z1)                COUCHE 1 — Expérimentation (Z2)      COUCHE 2 — Réserve (Z3)

info.memo_casier ──┐
                   ├─►[P1 casier n°3]──► item.cle_exp ──►[P2 porte EXP]──► access.z2
info.badge_roux ───┘        │                                    │
                            └─► item.lampe_uv ──┐                ├─► info.note_verne ──┐
                                                │                ├─► info.date_incident┴─►[P3 cadran ANNÉE]─► access.z3
                                                │                │                                               │
                                                ├────────────────┼─►[P4 tableau blanc + UV]                     │
                                                                 │         │                                    ▼
                                                                 │         ▼                          info.mapping_symboles
                                                                 └─► item.fusible ─┐                            │
                                                                                   ├─►[P5 tableau électrique]   │
                                                                 info.ordre_fusibles┘          │                │
                                                                                                ▼                │
                                                                                        state.courant ──┐       │
                                                                 info.protocole_ordre ──────────────────┼───────┤
                                                                                                         ▼       ▼
                                                                                                   [P6 panneau de purge]
                                                                                                         │
                                                                                                         ▼
                                                                                                    GOAL sortie
```

Propriétés visibles : DAG strict (aucun cycle), **2 branches parallèles** après l'ouverture de Z2 (branche chimie : P3→symboles ; branche électricité : P4→P5), **convergence** sur le puzzle final P6 qui est un puzzle de jointure multi-zones (`mapping_sequence`).

---

## 3. Zones, objets et indices

### Zone 1 — Bureau d'accueil (couche 0, accessible au départ)

| Objet | Famille | Interaction → ce qu'elle donne |
|-------|---------|-------------------------------|
| Tableau d'affichage | info | *Lire* → **mémo** : « Note de service — Les casiers doivent rester verrouillés. M. Roux : utiliser son numéro d'employé comme code de casier n'est PAS un code. Changez-le. — La direction » |
| Comptoir d'accueil | info | *Fouiller* → révèle le **badge** tombé derrière |
| Badge de M. Roux | info | *Lire* → « HELIOS LABS — ROUX Marc — Employé n° **418** — Casier **3** » |
| Casier n° 3 | mécanisme | Cadenas **3 chiffres** → contient la **clé « EXP »** et une **lampe UV** de maintenance |
| Porte « SALLE D'EXPÉRIMENTATION — EXP » | mécanisme | Serrure → clé étiquetée **EXP** |
| Porte « RÉSERVE CHIMIQUE » | mécanisme | Cadenas à cadran **étiqueté « ANNÉE »** (4 chiffres) |
| Tableau électrique | mécanisme | 4 porte-fusibles F1–F4 ; **F3 est grillé** ; disjoncteurs à réarmer dans un ordre précis |
| Sas de sortie : porte blindée + panneau de purge | mécanisme | Panneau éteint tant que le courant n'est pas rétabli ; demande une **séquence de 3 symboles** |
| Plante verte, affiche « La sécurité, c'est chaque jour » | décor | Ambiance uniquement (étiquetés `decor` en interne) |

### Zone 2 — Salle d'expérimentation (couche 1, derrière la clé EXP)

| Objet | Famille | Interaction → ce qu'elle donne |
|-------|---------|-------------------------------|
| Rapport d'incident (paillasse) | info | *Lire* → « RAPPORT D'INCIDENT — 12 mars **1987** — Fuite du composé VX-Hélios, cuve principale. Confinement activé. » |
| Post-it de Verne (lampe de bureau) | info | *Lire* → « Ils veulent que je change le code de la réserve chaque mois. Absurde. J'ai mis **l'année où tout a basculé** — impossible à oublier. — E.V. » |
| Journal du Dr Verne (bureau) | info | *Lire* → « Protocole d'urgence **P-7** : neutraliser la cuve en injectant **dans l'ordre : l'acide, puis la base, puis le catalyseur**. Les cuves de la réserve portent les symboles. » |
| Tiroir du bureau | contenant | *Ouvrir* → **fusible de rechange** |
| Tableau blanc effacé | info | *Utiliser la lampe UV dessus* → les traces du marqueur effacé redeviennent lisibles : « Réarmement : **F2 → F4 → F1 → F3** » |
| Microscope, chaise renversée | décor | Ambiance (la chaise renversée raconte l'évacuation précipitée) |

### Zone 3 — Réserve chimique (couche 2, derrière le cadran ANNÉE)

| Objet | Famille | Interaction → ce qu'elle donne |
|-------|---------|-------------------------------|
| Trois cuves étiquetées | info | *Lire* → « **▲ ACIDE** (H₂SO₄) » · « **● BASE** (NaOH) » · « **■ CATALYSEUR** K-12 » |
| Combinaison hazmat pendue, étagères de flacons | décor | Ambiance / narration (quelqu'un est parti sans sa combinaison…) |

---

## 4. Les 6 puzzles et leurs dérivations

Chaque puzzle expose sa `derivation` : la preuve interne que sa solution est déductible.

| Puzzle | Template | Solution | Dérivation (sources → règle) | Ancre anti-ambiguïté | Pas d'inférence |
|--------|----------|----------|------------------------------|----------------------|-----------------|
| **P1** Casier n° 3 | `code_from_document` | `418` | mémo (« code = numéro d'employé ») + badge (« employé n° 418, casier 3 ») → code du casier 3 = 418 | « numéro d'employé » présent dans les 2 indices | 2 |
| **P2** Porte EXP | `key_lock` | clé `EXP` | la clé est étiquetée « EXP », la porte aussi | « EXP » | 1 |
| **P3** Porte réserve | `labeled_dial_code` | `1987` | post-it (« code = l'année où tout a basculé ») + rapport (« incident du 12 mars 1987 ») → ANNÉE = 1987 | « ANNÉE » sur le cadran ; le rapport contient la seule année de la salle | 2 |
| **P4** Tableau blanc | `tool_reveal` | lampe UV **sur** tableau blanc | l'outil vient du casier (couche 0), le support est en couche 1 → ordre outil-avant-usage respecté | — | 1 |
| **P5** Tableau électrique | `mechanism_sequence` | insérer fusible en F3, réarmer `F2 → F4 → F1 → F3` | fusible (tiroir Z2) + écriture UV (tableau blanc Z2) | étiquettes « F1…F4 » communes au tableau et à l'indice | 2 |
| **P6** Panneau de purge | `mapping_sequence` | `▲ ● ■` | journal (**ordre** : acide → base → catalyseur) ⋈ cuves (**mapping** : ▲=acide, ●=base, ■=catalyseur) ; nécessite le courant (P5) | les mots « acide / base / catalyseur » relient les deux indices ; les symboles relient cuves et panneau | 2 |

---

## 5. Validation automatique — trace du solveur

Le solveur simule un joueur parfait : à chaque passe, il récolte tout ce qui est accessible, puis applique tous les puzzles dont les entrées sont satisfaites.

```
ÉTAT INITIAL   access={Z1}  inventory=∅  knowledge=∅  world={courant:coupé}

PASSE 1  (récolte Z1)
  lire tableau d'affichage    → +info.memo_casier
  fouiller comptoir           → badge visible ; lire badge → +info.badge_roux
  Applicables : P1 {memo_casier, badge_roux} ✓
  ► P1 résolu (code 418)      → +access.casier3, +item.cle_exp, +item.lampe_uv

PASSE 2
  Applicables : P2 {cle_exp} ✓
  ► P2 résolu (clé EXP)       → +access.Z2

PASSE 3  (récolte Z2)
  lire rapport d'incident     → +info.date_incident
  lire post-it                → +info.note_verne
  lire journal                → +info.protocole_ordre
  ouvrir tiroir               → +item.fusible
  Applicables : P3 {note_verne, date_incident} ✓ · P4 {lampe_uv, access.Z2} ✓
  ► P3 résolu (1987)          → +access.Z3
  ► P4 résolu (UV sur tableau)→ +info.ordre_fusibles

PASSE 4  (récolte Z3)
  lire cuves                  → +info.mapping_symboles
  Applicables : P5 {fusible, ordre_fusibles} ✓
  ► P5 résolu (F2→F4→F1→F3)   → world.courant = rétabli

PASSE 5
  Applicables : P6 {courant, protocole_ordre, mapping_symboles} ✓
  ► P6 résolu (▲ ● ■)         → GOAL atteint

RÉSULTAT : SOLVABLE — trace canonique en 5 passes, 6 puzzles.
```

### Résultats des lints de fairness

| Lint | Verdict | Détail |
|------|---------|--------|
| `dag-check` | ✅ | Tri topologique OK, 0 cycle |
| `source-check` | ✅ | Les 6 dérivations pointent vers des INFO atteignables avant leur puzzle (cf. trace) |
| `anchor-check` | ✅ | P1 « numéro d'employé », P2 « EXP », P3 « ANNÉE », P5 « F1–F4 », P6 « acide/base/catalyseur » + symboles |
| `ambiguity-check` | ✅ | Une seule année dans tous les textes (1987) ; un seul nombre à 3 chiffres (418) ; aucune autre séquence de 3 symboles |
| `tool-order-check` | ✅ | lampe UV obtenue couche 0 < tableau blanc couche 1 |
| `progress-check` | ✅ | Chaque puzzle produit un ACCESS, ITEM, INFO ou STATE consommé en aval |
| `no-loss-check` | ✅ | Aucun objet critique consommable ou perdable |
| `decoy-check` | ✅ | 0 leurre (profil moyen) ; le décor ne contient aucune valeur candidate |
| `dead-object-check` | ✅ | 17 objets : 14 dans le graphe, 3 étiquetés `decor` |

### Métriques de difficulté

| Métrique | Valeur | Cible « moyen » |
|----------|--------|-----------------|
| Profondeur du chemin critique | 5 puzzles (P1→P2→P4→P5→P6) | 5–7 ✓ |
| Branches parallèles | 2 (chimie / électricité) | 2 ✓ |
| Puzzles de jointure multi-zones | 1 (P6) | 1 ✓ |
| Pas d'inférence max | 2 | ≤ 2 ✓ |
| Zones | 3 | 3 ✓ |
| Durée estimée | ~35 min | ~35 min ✓ |

---

## 6. Walkthrough côté joueur (déroulé narratif)

1. **Sas d'entrée.** « Le confinement du laboratoire Helios ne peut être levé que de l'intérieur. Trouvez comment neutraliser la cuve, et sortez. » Le panneau de purge près de la porte blindée est **éteint**.
2. Le **mémo** du tableau d'affichage se moque d'un certain Roux qui utilise son numéro d'employé comme code de casier. En **fouillant le comptoir**, on trouve son badge : *employé n° 418, casier 3*. → cadenas du **casier 3 : 418**. Il contient une **clé « EXP »** et une **lampe UV**.
3. La clé ouvre la porte **EXP**. Dans la salle d'expérimentation : le **rapport d'incident** (12 mars 1987 — on comprend ce qui s'est passé), le **post-it** de Verne (« j'ai mis l'année où tout a basculé »), son **journal** (protocole P-7 : *acide, puis base, puis catalyseur*), un **fusible** dans le tiroir, et un tableau blanc effacé.
4. Le cadran de la **réserve** est étiqueté **ANNÉE** → **1987**. À l'intérieur, les trois cuves donnent le mapping : **▲ = acide, ● = base, ■ = catalyseur**.
5. La **lampe UV** sur le tableau blanc révèle l'ordre de réarmement : **F2 → F4 → F1 → F3**. Au tableau électrique : fusible dans F3, réarmement dans l'ordre → **le courant revient**, le panneau de purge s'allume.
6. Panneau de purge : le journal donne l'ordre, les cuves donnent les symboles → **▲ ● ■**. La purge s'exécute, le confinement se lève, la porte blindée s'ouvre.
7. **Épilogue** (affiché à la sortie) : « La cuve est neutralisée. Le protocole P-7 du Dr Verne aura fonctionné — neuf ans trop tard. Quant à savoir pourquoi sa combinaison est restée pendue dans la réserve… c'est une autre enquête. »

---

## 7. Ce que cet exemple démontre

- **Aucune solution scriptée** : `418`, `1987`, `F2→F4→F1→F3`, `▲●■` sont des *paramètres tirés par le générateur*, pas des constantes de design. Une autre seed tire d'autres valeurs, d'autres templates, d'autres justifications narratives — le même pipeline produit un hôtel avec un registre de chambres et un monte-charge à réarmer.
- **Chaque info a une source** et chaque source est un fragment d'histoire : la négligence de Roux *explique* le casier faible ; l'entêtement de Verne *explique* le code-année ; l'évacuation *explique* le tableau effacé.
- **La solvabilité est prouvée**, pas espérée : trace du solveur + 9 lints verts avant que la salle ne soit servie.
