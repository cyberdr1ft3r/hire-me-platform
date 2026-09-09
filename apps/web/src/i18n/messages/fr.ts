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
  domain: {
    recordState: {
      ACTIVE: 'Actif',
      ARCHIVED: 'Archivé',
      DRAFT: 'Brouillon',
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
    route: 'Route de prévisualisation : {route}',
    secondaryAction: 'Action secondaire',
    status: 'Statut',
    title: 'Revue de l’AppShell',
    workspaceTitle: 'Le contenu opérationnel s’intègre directement dans la page',
  },
};
