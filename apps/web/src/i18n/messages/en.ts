import { plural } from '../message.js';

/**
 * The canonical HireMe dictionary.
 *
 * English defines the structural contract: every other locale is annotated with
 * `Messages` and must satisfy exactly this shape, so a missing or misspelled key
 * fails `pnpm typecheck` instead of falling back silently at runtime.
 *
 * Keys are semantic paths, never English sentences. Values are plain text; a
 * `{placeholder}` is replaced with text at render time.
 *
 * `HireMe` is a brand name and is not translated.
 */
export const enMessages = {
  common: {
    actions: {
      cancel: 'Cancel',
      close: 'Close',
      retry: 'Try again',
      save: 'Save',
    },
    counts: {
      candidates: plural({ one: '{count} candidate', other: '{count} candidates' }),
    },
    pagination: {
      results: plural({ one: '{count} result', other: '{count} results' }),
    },
    status: {
      working: 'Working…',
    },
  },
  navigation: {
    destinations: {
      accounting: 'Accounting',
      administration: 'Administration',
      candidates: 'Candidates',
      clients: 'Clients',
      commercial: 'Commercial',
      documents: 'Documents',
      missions: 'Missions',
      overview: 'Overview',
      reporting: 'Reporting',
      tasks: 'Tasks',
      training: 'Training',
    },
    groups: {
      business: 'Business',
      operations: 'Operations',
      recruitment: 'Recruitment',
      system: 'System',
      workspace: 'Workspace',
    },
  },
  shell: {
    api: {
      checking: 'API checking',
      healthy: 'API healthy',
      unavailable: 'API unavailable',
    },
    brand: {
      subtitle: 'Operations',
    },
    language: {
      label: 'Language',
    },
    navigation: {
      close: 'Close',
      closeNavigation: 'Close navigation',
      dismissNavigation: 'Dismiss navigation',
      menu: 'Menu',
      mobileRegion: 'Mobile navigation',
      openNavigation: 'Open navigation',
      primaryRegion: 'Primary navigation',
      sidebarRegion: 'Application sidebar',
      skipToMain: 'Skip to main content',
    },
    session: {
      refreshProfile: 'Refresh profile',
      signOut: 'Sign out',
    },
  },
  overview: {
    description:
      'Move between recruitment, operations, and business work from one consistent workspace.',
    eyebrow: 'Workspace',
    intro:
      'Choose an available destination from the navigation. What appears there reflects the permissions attached to this account.',
    introTitle: 'Your HireMe workspace',
    signedInAs: 'Signed in as {email}',
    title: 'Overview',
  },
  auth: {
    apiStatusRegion: 'API status',
    checkingApi: 'Checking API health status...',
    email: 'Email',
    failed: 'Authentication failed.',
    formRegion: 'Login',
    heading: 'Sign in',
    password: 'Password',
    submit: 'Login',
    subtitle: 'Sign in to continue to the internal HireMe workspace.',
    title: 'Recruitment operations workspace',
  },
  access: {
    deniedMessage: 'Permission denied.',
    deniedRegion: 'Protected workspace',
    deniedTitle: 'Protected workspace',
  },
  /**
   * Presentation labels for language-neutral values owned by the API, the
   * database, and the shared contracts. The stored value never changes; only its
   * label does, and a label is never sent back to the API or used in a branch.
   */
  domain: {
    recordState: {
      ACTIVE: 'Active',
      ARCHIVED: 'Archived',
      DRAFT: 'Draft',
    },
  },
  preview: {
    createItem: 'Create item',
    dataRegion: 'Synthetic data placeholder',
    description:
      'A synthetic workspace specimen for reviewing hierarchy, navigation density, and responsive behavior.',
    eyebrow: 'Internal workspace',
    formatting: 'Locale formatting: {values}',
    kicker: 'Neutral content region',
    owner: 'Owner',
    ownerValue: 'Example team',
    paragraph:
      'This placeholder demonstrates spacing and hierarchy without reproducing a future module design or using real business data.',
    reference: 'Reference',
    route: 'Preview route: {route}',
    secondaryAction: 'Secondary action',
    status: 'Status',
    title: 'AppShell review',
    workspaceTitle: 'Operational content belongs directly in the page',
  },
};

/** The structural contract every locale must satisfy. */
export type Messages = typeof enMessages;
