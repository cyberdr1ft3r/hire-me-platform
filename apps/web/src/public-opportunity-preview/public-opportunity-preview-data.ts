import type { PublicOpportunity } from '@hire-me/contracts';

import type { Locale } from '../i18n/index.js';

/**
 * Synthetic public opportunities for the development-only review surface.
 *
 * Every value is invented and obviously fake. Each record has exactly the
 * public contract's shape, so nothing internal can appear in the preview: no
 * identifiers, pipeline data, recruiters, notes, or unapproved compensation.
 *
 * The product never translates published text; staff write it in their own
 * words. The preview therefore carries one English and one French synthetic
 * set, so each locale can be reviewed with same-language content.
 */

const UPLOAD_REQUIREMENTS: PublicOpportunity['uploadRequirements'] = {
  additionalAttachmentsEnabled: true,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
  certificationsEnabled: true,
  certificationsRequired: false,
  cvRequired: true,
  diplomasEnabled: false,
  diplomasRequired: false,
  maxFileSizeBytes: 1_500_000,
  maxTotalUploadBytes: 5_000_000,
};

const SHARED = {
  applicationDeadline: null,
  clientName: null,
  salary: null,
  uploadRequirements: UPLOAD_REQUIREMENTS,
} as const;

const ENGLISH: PublicOpportunity[] = [
  {
    ...SHARED,
    applicationDeadline: '2026-10-30T17:00:00.000Z',
    clientName: 'Example Client Company',
    publicDescription:
      'This synthetic role exists only to review the public page. It describes a platform engineering position that maintains internal services, reviews changes with a small team, and improves reliability over time.\n\nThe team works in short planning cycles and documents decisions in writing. Every sentence here is placeholder text for layout review.',
    publicEngagementType: 'Permanent contract',
    publicExperienceLevel: 'Senior',
    publicLocation: 'Example City',
    publicSkills: 'TypeScript, PostgreSQL, service reliability, written communication',
    publicSlug: 'preview-synthetic-platform-engineer',
    publicSummary:
      'A synthetic senior engineering role for reviewing reading rhythm, key details, and the application form.',
    publicTitle: 'Synthetic Platform Engineer',
    publicWorkArrangement: 'Hybrid',
    salary: { salaryCurrency: 'EUR', salaryMaxCents: 5_800_000, salaryMinCents: 4_600_000 },
  },
  {
    ...SHARED,
    publicDescription:
      'A placeholder operations role with a longer title, used to check wrapping in both languages.',
    publicEngagementType: 'Fixed-term contract',
    publicExperienceLevel: 'Intermediate',
    publicLocation: 'Sample Town',
    publicSkills: null,
    publicSlug: 'preview-synthetic-operations-coordinator',
    publicSummary:
      'A synthetic coordination role whose longer summary checks that list rows stay readable when published text runs across several lines on narrow screens.',
    publicTitle: 'Synthetic Recruitment Operations and Onboarding Coordinator',
    publicWorkArrangement: 'On site',
  },
  {
    ...SHARED,
    publicDescription: null,
    publicEngagementType: null,
    publicExperienceLevel: null,
    publicLocation: 'Remote placeholder',
    publicSkills: null,
    publicSlug: 'preview-synthetic-data-analyst',
    publicSummary: null,
    publicTitle: 'Synthetic Data Analyst',
    publicWorkArrangement: null,
  },
];

const FRENCH: PublicOpportunity[] = [
  {
    ...SHARED,
    applicationDeadline: '2026-10-30T17:00:00.000Z',
    clientName: 'Entreprise Cliente Exemple',
    publicDescription:
      'Ce poste fictif sert uniquement à relire la page publique. Il décrit un poste d’ingénierie plateforme chargé de maintenir des services internes, de relire les modifications avec une petite équipe et d’améliorer la fiabilité dans la durée.\n\nL’équipe travaille par cycles de planification courts et documente ses décisions par écrit. Chaque phrase de ce texte est un contenu d’exemple destiné à la relecture de la mise en page.',
    publicEngagementType: 'CDI',
    publicExperienceLevel: 'Confirmé',
    publicLocation: 'Ville Exemple',
    publicSkills: 'TypeScript, PostgreSQL, fiabilité des services, communication écrite',
    publicSlug: 'preview-synthetic-platform-engineer',
    publicSummary:
      'Un poste fictif d’ingénieur confirmé pour relire le rythme de lecture, les informations clés et le formulaire de candidature.',
    publicTitle: 'Ingénieur plateforme fictif',
    publicWorkArrangement: 'Hybride',
    salary: { salaryCurrency: 'EUR', salaryMaxCents: 5_800_000, salaryMinCents: 4_600_000 },
  },
  {
    ...SHARED,
    publicDescription:
      'Un poste d’exemple avec un intitulé plus long, utilisé pour vérifier les retours à la ligne dans les deux langues.',
    publicEngagementType: 'CDD',
    publicExperienceLevel: 'Intermédiaire',
    publicLocation: 'Bourg Exemple',
    publicSkills: null,
    publicSlug: 'preview-synthetic-operations-coordinator',
    publicSummary:
      'Un poste de coordination fictif dont le résumé plus long vérifie que les lignes de la liste restent lisibles lorsque le texte publié s’étend sur plusieurs lignes sur petit écran.',
    publicTitle: 'Coordinateur fictif des opérations de recrutement et de l’intégration',
    publicWorkArrangement: 'Sur site',
  },
  {
    ...SHARED,
    publicDescription: null,
    publicEngagementType: null,
    publicExperienceLevel: null,
    publicLocation: 'Télétravail (exemple)',
    publicSkills: null,
    publicSlug: 'preview-synthetic-data-analyst',
    publicSummary: null,
    publicTitle: 'Analyste de données fictif',
    publicWorkArrangement: null,
  },
];

export function previewOpportunities(locale: Locale): PublicOpportunity[] {
  return locale === 'fr' ? FRENCH : ENGLISH;
}
