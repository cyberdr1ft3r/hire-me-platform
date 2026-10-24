# Glossaire métier HireMe

Dernière mise à jour : 2026-10-23  
Périmètre : terminologie de présentation EN/FR, sans modification des contrats, des enums, du
schéma de données ni des transitions métier.

## Sources et niveau de validation

- **Questionnaire métier complété** : les cinq réponses reproduites dans la demande d'implémentation
  du 2026-10-23 sont la seule source portant explicitement le statut **Validé** dans ce document.
- **Documents métier officiels** : la demande référence un corpus de six documents. L'Issue #236
  nomme cinq brochures (`Hire_Me_Presentation_Cabinet.pdf`, `Hire_Me_Offre_Recrutement.pdf`,
  `Hire_Me_Catalogue_Formations.pdf`, `Hire_Me_Accompagnement_Professionnel.pdf` et
  `Hire_Me_Accompagnement.pdf`) et en résume les principaux concepts. Le sixième titre et les
  fichiers sources ne sont pas versionnés dans le dépôt ; ils restent à identifier pour une revue
  documentaire exhaustive.
- **Produit implémenté** : `docs/workflows.md`, `docs/domain-model.md` et les dictionnaires EN/FR
  décrivent la signification technique actuelle. Ils servent à éviter un renommage qui changerait
  le métier, mais ne valident pas une traduction à eux seuls.

Statuts employés :

- **Validé** : formulation confirmée par le questionnaire soumis.
- **Documenté** : sens étayé par l'Issue #236, les documents métier qui y sont résumés ou la
  documentation produit fusionnée, sans nouvelle validation du libellé.
- **En attente** : traduction, règle opérationnelle ou correspondance technique à confirmer.

## Les trois piliers

| Pilier | Sens | Frontière à préserver | Statut |
| --- | --- | --- | --- |
| **Recrutement** | Missions employeur, sourcing, évaluation, shortlist, présentation au client, entretiens client, placement et suivi post-intégration. | Un candidat reste une personne du vivier général ; son avancement pour un employeur appartient au `MissionCandidate` de la mission. | Documenté — Issue #236 et workflow fusionné |
| **Formation** | Programmes, sessions, inscriptions, participation, présence et certificats. | Une inscription ou participation à une formation ne devient pas une prestation d'accompagnement. | Documenté — Issue #236 et modèle fusionné |
| **Accompagnement** | Accompagnement professionnel ou personnel fourni à une **personne accompagnée**. | Ce pilier n'est ni le vivier de recrutement ni la formation. Les notes sensibles ne doivent pas être placées dans les fiches candidats génériques. | Terme bénéficiaire validé ; parcours et données en attente |

`INDIVIDUAL_COACHING` est une valeur existante du cycle d'inscription à une formation. Son libellé
actuel ne prouve pas l'existence d'un parcours Accompagnement et ne doit pas être remplacé ou
reclassifié sans décision métier et migration dédiées.

## Concepts validés par le questionnaire

| Concept | Français validé | Anglais de présentation retenu | Statut et usage |
| --- | --- | --- | --- |
| General candidate pool | **Vivier général** | **General candidate pool** | **Validé.** Ensemble transversal des profils candidats, indépendamment d'une mission donnée. |
| Candidates associated with a mission | **Candidats de la mission** | **Mission candidates** | **Validé.** Ensemble des processus candidats rattachés à une mission précise. Ce n'est pas le vivier général. |
| Client presentation shortlist | **Shortlist — 3 à 5 profils retenus pour présentation au client** | **Shortlist — 3 to 5 profiles selected for client presentation** | **Validé.** Sélection bornée destinée à l'étape de présentation ; elle n'est ni toute la liste des candidats de la mission ni l'acte de présentation lui-même. |
| Candidate in a specific recruitment mission | **Candidat de la mission** | **Mission candidate** | **Validé.** Un profil considéré dans le contexte d'une mission de recrutement précise. |
| Accompaniment recipient | **Personne accompagnée** | **Accompaniment recipient** | **Validé.** Bénéficiaire d'un parcours Accompagnement ; ne pas substituer automatiquement « candidat », « participant » ou `INDIVIDUAL_COACHING`. |

## Étapes de recrutement à ne pas confondre

| Terme | Définition de présentation | Différence structurante | Statut |
| --- | --- | --- | --- |
| **Présélection** | Premier tri interne des profils par rapport au besoin de la mission, avant constitution de la shortlist. | N'implique ni sélection dans les 3 à 5 profils ni visibilité client. Le produit conserve `HR_PRESELECTION` comme valeur technique. | Documenté ; critères et responsable en attente |
| **Shortlist** | **3 à 5 profils retenus pour présentation au client.** | Résultat de sélection interne. Ne signifie pas que les profils ont déjà été transmis ou rendus visibles au client. | **Validé** pour le nom, la taille et la finalité ; correspondance exacte avec les états techniques en attente |
| **Présentation au client** | Acte explicite par lequel HireMe présente au client les profils retenus dans le cadre de la mission. | Étape postérieure à la shortlist. Dans le produit actuel, l'entrée dans `PRESENTED_TO_CLIENT` reste réservée à l'action dédiée ; aucun libellé ne doit contourner cette règle. | Documenté ; format du dossier, anonymisation et autorisations de divulgation en attente |
| **Placement** | Résultat de recrutement confirmé à partir de l'offre acceptée, avec une date de début d'intégration. | L'acceptation d'une offre ne suffit pas. Le placement est distinct de l'intégration, du suivi post-intégration et de la clôture de mission. | Documenté par le workflow fusionné ; aucune transition modifiée |
| **Suivi post-intégration** | Suivi réalisé après le début de l'intégration pour vérifier l'installation et traiter les écarts. | N'est ni le placement ni le pilier Accompagnement. L'Issue #236 mentionne des jalons 30/60/90 ; leur déclencheur, propriétaire et stockage restent à confirmer. | Documenté ; détails opérationnels en attente |

## Correspondances techniques et garde-fous

| Présentation | Élément technique actuel | Règle |
| --- | --- | --- |
| Vivier général | `Candidate` et libellés de présentation de `CandidateStatus.TALENT_POOL` | L'enum et les valeurs persistées restent inchangés. |
| Candidat(s) de la mission | `MissionCandidate` et zone `missions.pipeline` | Aucun contrat, endpoint, filtre, permission ou pagination ne change. |
| Présentation au client | Action dédiée de présentation et état `PRESENTED_TO_CLIENT` | Ne pas rendre l'état accessible par une transition générique. |
| Placement | `MissionPlacement` créé à partir de l'offre courante acceptée | Ne pas assimiler offre acceptée et placement confirmé. |
| Suivi post-intégration | États existants d'intégration/période d'essai, sans parcours de suivi dédié confirmé | Ne pas inventer d'automatisation, d'enregistrement ou de transition. |
| Personne accompagnée | Aucun type de dossier Accompagnement confirmé dans le périmètre actuel | Ne pas reclasser les candidats, inscriptions Formation ou `INDIVIDUAL_COACHING`. |

## Éléments en attente

- Identifier le sixième document du corpus officiel et effectuer une comparaison ligne à ligne des
  traductions restantes.
- Valider les équivalents anglais officiels, notamment **Personne accompagnée**.
- Décider à quel état ou artefact technique correspond la shortlist sans renommer les états
  existants ni modifier les transitions.
- Valider le contenu, l'anonymisation, l'approbation et la divulgation des dossiers présentés au
  client. Le commentaire de l'Issue #236 est une proposition de contrat, pas une fonctionnalité
  existante.
- Définir le propriétaire, les jalons, les données et les actions du suivi post-intégration.
- Concevoir séparément le parcours Accompagnement, ses permissions et le cloisonnement de ses
  données sensibles avant toute implémentation.
