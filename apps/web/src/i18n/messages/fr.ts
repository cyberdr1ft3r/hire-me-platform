import { plural } from '../message.js';
import type { Messages } from './en.js';

/**
 * French HireMe dictionary.
 *
 * The `Messages` annotation is the compile-time contract: a missing key, an
 * extra key, or a renamed group fails `pnpm typecheck`.
 *
 * Typography follows French convention: a literal U+00A0 no-break space precedes
 * a colon so the punctuation never wraps onto its own line, and the typographic
 * apostrophe U+2019 is used rather than a straight quote. Everything else that
 * depends on locale spacing is left to `Intl`.
 * `HireMe` is a brand name and stays untranslated.
 */
export const frMessages: Messages = {
  common: {
    actions: {
      cancel: 'Annuler',
      close: 'Fermer',
      retry: 'Réessayer',
      save: 'Enregistrer',
    },
    counts: {
      candidates: plural({
        many: '{count} de candidats',
        one: '{count} candidat',
        other: '{count} candidats',
      }),
    },
    pagination: {
      results: plural({
        many: '{count} de résultats',
        one: '{count} résultat',
        other: '{count} résultats',
      }),
    },
    status: {
      working: 'Traitement en cours…',
    },
  },
  navigation: {
    destinations: {
      accounting: 'Comptabilité',
      administration: 'Administration',
      candidates: 'Candidats',
      clients: 'Clients',
      commercial: 'Commercial',
      documents: 'Documents',
      missions: 'Missions',
      overview: 'Vue d’ensemble',
      reporting: 'Rapports',
      tasks: 'Tâches',
      training: 'Formation',
    },
    groups: {
      business: 'Gestion commerciale',
      operations: 'Opérations',
      recruitment: 'Recrutement',
      system: 'Système',
      workspace: 'Espace de travail',
    },
  },
  shell: {
    api: {
      checking: 'Vérification de l’API',
      healthy: 'API opérationnelle',
      unavailable: 'API indisponible',
    },
    brand: {
      subtitle: 'Opérations',
    },
    language: {
      label: 'Langue',
    },
    navigation: {
      close: 'Fermer',
      closeNavigation: 'Fermer la navigation',
      dismissNavigation: 'Masquer le panneau de navigation',
      menu: 'Menu',
      mobileRegion: 'Navigation mobile',
      openNavigation: 'Ouvrir la navigation',
      primaryRegion: 'Navigation principale',
      sidebarRegion: 'Barre latérale de l’application',
      skipToMain: 'Aller au contenu principal',
    },
    session: {
      refreshProfile: 'Actualiser le profil',
      signOut: 'Se déconnecter',
    },
  },
  overview: {
    description:
      'Naviguez entre le recrutement, les opérations et la gestion commerciale depuis un espace de travail unique et cohérent.',
    eyebrow: 'Espace de travail',
    intro:
      'Choisissez une destination disponible dans la navigation. Son contenu dépend des permissions associées à ce compte.',
    introTitle: 'Votre espace de travail HireMe',
    signedInAs: 'Session ouverte : {email}',
    title: 'Vue d’ensemble',
  },
  auth: {
    apiStatusRegion: 'État de l’API',
    checkingApi: 'Vérification de l’état de l’API…',
    email: 'Adresse e-mail',
    failed: 'Échec de l’authentification.',
    formRegion: 'Connexion',
    heading: 'Se connecter',
    password: 'Mot de passe',
    submit: 'Se connecter',
    subtitle: 'Connectez-vous pour accéder à l’espace de travail interne HireMe.',
    title: 'Espace de travail des opérations de recrutement',
  },
  access: {
    deniedMessage: 'Accès refusé.',
    deniedRegion: 'Espace protégé',
    deniedTitle: 'Espace protégé',
  },
  reporting: {
    empty: {
      pipeline: 'Aucun processus candidat dans le périmètre sélectionné.',
      report: 'Aucune donnée de reporting pour les filtres sélectionnés.',
      table: 'Aucun processus candidat ne correspond aux filtres sélectionnés.',
      trends: 'Aucune activité de recrutement enregistrée sur cette période.',
    },
    export: {
      action: 'Exporter en CSV',
    },
    feedback: {
      exportError: 'Impossible d’exporter le CSV des rapports de recrutement.',
      exportSuccess: '{filename} exporté.',
      exportTitle: 'Export CSV',
    },
    filters: {
      allClients: 'Tous les clients autorisés',
      allMissions: 'Toutes les missions autorisées',
      allRecruiters: 'Tous les recruteurs autorisés',
      apply: 'Appliquer les filtres',
      client: 'Client',
      end: 'Date de fin',
      mission: 'Mission',
      recruiter: 'Recruteur',
      region: 'Filtres de reporting',
      reset: 'Réinitialiser les filtres',
      start: 'Date de début',
    },
    header: {
      description:
        'Suivez l’activité de recrutement, l’avancement du pipeline et les placements réalisés.',
      eyebrow: 'Recrutement',
      scope: 'Rapports portant sur {scope}',
      title: 'Rapports de recrutement',
      window: 'Période du {start} au {end}',
    },
    metrics: {
      candidateProcesses: 'Processus candidats',
      closureEligible: 'Missions clôturables',
      confirmedPlacements: 'Placements confirmés',
      interviewsCompleted: 'Entretiens réalisés',
      interviewsScheduled: 'Entretiens planifiés',
      newApplications: 'Nouvelles candidatures',
      offersAccepted: 'Offres acceptées',
      openMissions: 'Missions ouvertes',
      overdueMissions: 'Missions en retard',
      presentedToClient: 'Présentés au client',
      primaryRegion: 'Indicateurs clés de recrutement',
      requestedPositions: 'Postes demandés',
      secondaryRegion: 'Indicateurs complémentaires de recrutement',
      totalMissions: 'Missions au total',
    },
    pagination: {
      next: 'Suivant',
      page: 'Page {page}',
      previous: 'Précédent',
      region: 'Pages du détail',
    },
    pipeline: {
      description:
        'Répartition des processus candidats par étape du pipeline sur les missions du périmètre.',
      title: 'Répartition du pipeline',
    },
    states: {
      error: 'Impossible de charger les rapports de recrutement.',
      errorTitle: 'Rapports indisponibles',
      loading: 'Chargement des rapports de recrutement…',
      loadingTable: 'Chargement des lignes de détail…',
      tableError: 'Impossible de charger cette page de lignes de reporting.',
      tableErrorTitle: 'Détail indisponible',
    },
    table: {
      candidate: 'Candidat',
      client: 'Client',
      mission: 'Mission',
      noSource: 'Non renseignée',
      recruiter: 'Recruteur',
      source: 'Source',
      state: 'Étape du pipeline',
      title: 'Détail des processus candidats',
      updated: 'Mise à jour',
    },
    trends: {
      description: 'Activité hebdomadaire de recrutement sur la période analysée.',
      tableCaption: 'Effectifs hebdomadaires pour chaque indicateur de tendance',
      title: 'Tendances hebdomadaires',
      total: 'Total sur la période : {total}',
      weekColumn: 'Semaine du',
    },
  },
  domain: {
    pipelineState: {
      ACCEPTED: 'Offre acceptée',
      CANDIDATE_REJECTED: 'Refus du candidat',
      CLIENT_INTERVIEW_1: 'Entretien client 1',
      CLIENT_INTERVIEW_2: 'Entretien client 2',
      CLIENT_OFFER: 'Offre du client',
      CLIENT_REJECTED: 'Refus du client',
      CV_TO_REVIEW: 'CV à examiner',
      HR_INTERVIEW_COMPLETED: 'Entretien RH réalisé',
      HR_INTERVIEW_SCHEDULED: 'Entretien RH planifié',
      HR_PRESELECTION: 'Présélection RH',
      INTEGRATED: 'Candidat intégré',
      INTERNAL_VALIDATION: 'Validation interne',
      NEW: 'Nouveau',
      POSTPONED: 'Reporté',
      PRESENTED_TO_CLIENT: 'Présenté au client',
      PROBATION_COMPLETED: 'Période d’essai validée',
      PROCESS_COMPLETED: 'Processus terminé',
      TALENT_POOL: 'Vivier de talents',
      TECHNICAL_TEST: 'Test technique',
      WAITING: 'En attente',
      WITHDRAWN: 'Retiré',
    },
    recordState: {
      ACTIVE: 'Actif',
      ARCHIVED: 'Archivé',
      DRAFT: 'Brouillon',
    },
    reportingScope: {
      assigned: 'les missions assignées',
      broad: 'toutes les missions',
    },
    trendMetric: {
      interviewsScheduled: 'Entretiens planifiés',
      offersCreated: 'Offres créées',
      placementsConfirmed: 'Placements confirmés',
      processesCreated: 'Processus créés',
      publicApplications: 'Candidatures publiques',
    },
  },
  preview: {
    createItem: 'Créer un élément',
    dataRegion: 'Exemple de données synthétiques',
    description:
      'Un spécimen d’espace de travail synthétique pour évaluer la hiérarchie, la densité de navigation et le comportement responsive.',
    eyebrow: 'Espace de travail interne',
    formatting: 'Mise en forme locale : {values}',
    kicker: 'Zone de contenu neutre',
    owner: 'Responsable',
    ownerValue: 'Équipe exemple',
    paragraph:
      'Cet exemple illustre l’espacement et la hiérarchie sans reproduire la future maquette d’un module ni utiliser de données métier réelles.',
    reference: 'Référence',
    reporting: {
      dataset: 'Jeu de données de prévisualisation',
      empty: 'Résultat vide',
      populated: 'Activité représentative',
    },
    route: 'Route de prévisualisation : {route}',
    secondaryAction: 'Action secondaire',
    status: 'Statut',
    title: 'Revue de l’AppShell',
    workspaceTitle: 'Le contenu opérationnel s’intègre directement dans la page',
  },
};
