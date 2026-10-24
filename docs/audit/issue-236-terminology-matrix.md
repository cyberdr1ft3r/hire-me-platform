# Issue #236 — matrice terminologique avant/après

Date : 2026-10-23  
Portée : corrections de présentation confirmées uniquement. Aucun enum, colonne, contrat API,
workflow, permission, route ou onglet B2 n'est modifié.

Source de validation abrégée dans les tableaux : **questionnaire validé 2026-10-23** désigne les
réponses reproduites dans la demande d'implémentation. Les équivalents anglais sont les formulations
de présentation parallèles ; le questionnaire ne les marque pas comme traductions officielles.

## Clés modifiées

| Clé | EN avant | EN après | FR avant | FR après | Source de validation |
| --- | --- | --- | --- | --- | --- |
| `candidate.directory.title` | Candidate directory | General candidate pool | Répertoire des candidats | Vivier général | Questionnaire : general candidate pool → **Vivier général** ; le répertoire est le vivier transversal |
| `candidate.list.title` | Candidate list | General candidate pool | Liste des candidats | Vivier général | Même validation ; titre visible de liste |
| `candidate.list.region` | Candidate list | General candidate pool | Liste des candidats | Vivier général | Même validation ; nom accessible de région |
| `candidate.lifecycle.moveTo.TALENT_POOL` | Move to talent pool | Move to general candidate pool | Placer dans le vivier | Placer dans le vivier général | Même validation ; libellé de présentation uniquement |
| `domain.candidateStatus.TALENT_POOL` | Talent pool | General candidate pool | Vivier de talents | Vivier général | Même validation ; enum inchangé |
| `domain.pipelineState.TALENT_POOL` | Talent pool | General candidate pool | Vivier de talents | Vivier général | Même validation ; état technique inchangé |
| `missions.detail.nav.pipeline` | Pipeline | Mission candidates | Vivier | Candidats de la mission | Questionnaire : candidates associated with a mission → **Candidats de la mission** |
| `missions.pipeline.title` | Candidate pipeline | Mission candidates | Vivier de candidats | Candidats de la mission | Même validation ; zone limitée à une mission |
| `missions.pipeline.region` | Candidate pipeline | Mission candidates | Vivier de candidats | Candidats de la mission | Même validation ; nom accessible de région |
| `missions.pipeline.pagination.region` | Candidate pipeline pages | Mission candidate pages | Pages du vivier de candidats | Pages des candidats de la mission | Même validation ; pagination limitée à la mission |
| `missions.pipeline.selectProcessDetail` | Select a candidate in the pipeline… | Select a mission candidate… | Sélectionnez un candidat dans le vivier… | Sélectionnez un candidat de la mission… | Questionnaire : **Candidat de la mission** ; rédaction de présentation |
| `task.context.kinds.missionCandidate` | Mission candidate | Mission candidate | Candidat de mission | Candidat de la mission | Questionnaire : candidate in a specific recruitment mission → **Candidat de la mission** |

## Termes audités sans remplacement applicatif

| Terme | Constat | Décision |
| --- | --- | --- |
| Présélection | Les libellés `HR_PRESELECTION` décrivent déjà une présélection RH interne. | Conservés ; aucun changement d'état ou de transition. |
| Shortlist | Aucun libellé actuel ne représente sans ambiguïté la shortlist validée de 3 à 5 profils. | Définie dans le glossaire ; mapping technique laissé en attente au lieu de renommer `FINAL_SELECTION` ou `CANDIDATE_PRESENTATION`. |
| Présentation au client | L'action dédiée et `PRESENTED_TO_CLIENT` existent et sont distinctes de la liste des candidats de la mission. | Libellés conservés ; contrat et visibilité inchangés. |
| Placement | Les libellés correspondent au `MissionPlacement` confirmé depuis l'offre acceptée. | Conservés ; aucune assimilation à l'offre acceptée. |
| Suivi post-intégration | Aucun parcours de suivi 30/60/90 confirmé n'est exposé. | Sens documenté ; aucune action ou transition inventée. |
| Personne accompagnée | Aucun dossier Accompagnement confirmé n'existe dans ce périmètre. | Terme validé dans le glossaire uniquement ; aucune reclassification de Formation ou de candidats. |
| `INDIVIDUAL_COACHING` | Valeur existante du cycle d'inscription Formation. | Conservée telle quelle ; aucune substitution par un processus Accompagnement. |

## Résultats des vérifications

| Vérification | Résultat |
| --- | --- |
| Tests ciblés de traduction EN/FR | Réussi — `translate.test.ts` : 21/21 |
| Tests Candidates affectés | Réussi — `CandidateWorkspace.test.tsx` : 48/48 ; `CandidatesPanel.test.tsx` : 84/84 |
| Tests Missions affectés | Réussi — `MissionsWorkspace.test.tsx` : 35/35 |
| Test du shell applicatif affecté | Réussi — `App.test.tsx` : 44/44 |
| Suite web complète | 1 111/1 113 réussis. L'échec de focus Commercial observé en exécution parallèle réussit seul (1/1) ; l'autre échec est l'assertion CSS préexistante sensible aux fins de ligne CRLF sous Windows dans `foundation.test.tsx`. Aucun des deux fichiers n'est modifié par ce lot. |
| Formatage | Réussi — Prettier, tous les fichiers conformes |
| Architecture et styles | Réussi — frontière Prisma, jetons de couleur CSS et contrastes |
| Lint | Réussi — 0 erreur ; 1 avertissement préexistant dans `ClientsPanel.test.tsx` |
| Typecheck | Réussi — `tsc -b --noEmit` |
| Build de production | Réussi — `tsc -b && vite build` ; avertissement Rollup préexistant sur un chunk supérieur à 500 kB |

Les résultats finaux et l'identifiant exact du commit sont consignés dans la pull request draft.
