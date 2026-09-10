import { plural, type WidenMessages } from '../message.js';

/**
 * The canonical HireMe dictionary.
 *
 * English defines the structural contract: every other locale is annotated with
 * `Messages` and must satisfy exactly this shape, so a missing or misspelled key
 * fails `pnpm typecheck` instead of falling back silently at runtime.
 *
 * It is declared `as const` so each template keeps its literal type. That is what
 * lets the translator derive a key's required `{placeholder}` names and its
 * count requirement at compile time.
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
   * Recruitment reporting. Every string here is presentation only: filters,
   * metric labels, and state labels never travel back to the API, and no
   * business rule reads them.
   */
  reporting: {
    empty: {
      pipeline: 'No candidate processes in the selected scope.',
      report: 'No reporting data for the selected filters.',
      table: 'No candidate processes match the selected filters.',
      trends: 'No recruitment activity was recorded in this window.',
    },
    export: {
      action: 'Export CSV',
    },
    feedback: {
      exportError: 'Unable to export recruitment reporting CSV.',
      exportSuccess: 'Exported {filename}.',
      exportTitle: 'CSV export',
    },
    filters: {
      allClients: 'All clients',
      allMissions: 'All missions',
      allRecruiters: 'All recruiters',
      apply: 'Apply filters',
      client: 'Client',
      end: 'End date',
      mission: 'Mission',
      recruiter: 'Recruiter',
      region: 'Reporting filters',
      reset: 'Reset filters',
      start: 'Start date',
    },
    header: {
      description: 'Monitor recruitment activity, pipeline movement, and placement outcomes.',
      eyebrow: 'Recruitment',
      scope: 'Reporting on {scope}',
      title: 'Recruitment reporting',
      window: 'Window {start} to {end}',
    },
    metrics: {
      candidateProcesses: 'Candidate processes',
      closureEligible: 'Closure-eligible missions',
      confirmedPlacements: 'Confirmed placements',
      interviewsCompleted: 'Interviews completed',
      interviewsScheduled: 'Interviews scheduled',
      newApplications: 'New applications',
      offersAccepted: 'Offers accepted',
      openMissions: 'Open missions',
      overdueMissions: 'Overdue missions',
      presentedToClient: 'Presented to client',
      primaryRegion: 'Key recruitment metrics',
      requestedPositions: 'Requested positions',
      secondaryRegion: 'Supporting recruitment metrics',
      totalMissions: 'Total missions',
    },
    pagination: {
      next: 'Next',
      page: 'Page {page}',
      previous: 'Previous',
      region: 'Drilldown pages',
    },
    pipeline: {
      description: 'Candidate processes by pipeline state across the missions in scope.',
      title: 'Pipeline distribution',
    },
    states: {
      error: 'Unable to load recruitment reporting.',
      errorTitle: 'Reporting unavailable',
      loading: 'Loading recruitment reporting…',
      loadingTable: 'Loading drilldown rows…',
      tableError: 'Unable to load this page of reporting rows.',
      tableErrorTitle: 'Drilldown unavailable',
    },
    table: {
      candidate: 'Candidate',
      client: 'Client',
      mission: 'Mission',
      noSource: 'Not recorded',
      recruiter: 'Recruiter',
      source: 'Source',
      state: 'Pipeline state',
      title: 'Candidate process drilldown',
      updated: 'Updated',
    },
    trends: {
      description: 'Weekly recruitment activity across the reporting window.',
      tableCaption: 'Weekly counts for every trend metric',
      title: 'Weekly trends',
      total: 'Window total {total}',
      weekColumn: 'Week starting',
    },
  },
  /**
   * The Candidate workspace. Every string here is presentation only: lifecycle
   * labels, filter options, and feedback never travel back to the API, and no
   * business rule reads them.
   */
  candidate: {
    actions: {
      cancel: 'Cancel',
      create: 'Create candidate',
      edit: 'Edit profile',
      newCandidate: 'New candidate',
      region: 'Candidate actions',
      save: 'Save changes',
    },
    compensation: {
      notRecorded: 'Not recorded',
      salaryExpectation: 'Salary expectation',
      title: 'Compensation',
    },
    consent: {
      notRecorded: 'Not recorded',
      recordedAt: 'Recorded',
      status: 'Consent status',
      title: 'Consent',
    },
    create: {
      description: 'Only the name is required. Other details can be completed later.',
      title: 'New candidate',
    },
    education: {
      add: 'Add education',
      empty: 'No education recorded.',
      field: 'Field of study',
      institution: 'Institution',
      qualification: 'Qualification',
      title: 'Education',
    },
    empty: {
      noCandidates: 'Candidate profiles appear here once they are created.',
      noCandidatesTitle: 'No candidates yet',
      noMatches: 'No candidate matches the current search.',
      noMatchesTitle: 'No matching candidates',
      noSelection: 'Select a candidate to review their profile, lifecycle, and structured records.',
      noSelectionTitle: 'No candidate selected',
    },
    experience: {
      add: 'Add experience',
      current: 'Current role',
      employer: 'Employer',
      empty: 'No work experience recorded.',
      endDate: 'End date',
      dateHint: 'As recorded, for example 2021-03',
      isCurrent: 'Current role',
      jobTitle: 'Job title',
      period: '{start} – {end}',
      present: 'Present',
      startDate: 'Start date',
      title: 'Work experience',
      undated: 'Dates not recorded',
    },
    feedback: {
      archived: 'Candidate archived.',
      created: 'Candidate created.',
      educationAdded: 'Education added.',
      experienceAdded: 'Experience added.',
      failure: {
        archived: 'This candidate has been archived and can no longer be changed.',
        conflict: 'This candidate changed while you were working. Review it and try again.',
        duplicateEmail: 'A candidate with this email already exists.',
        forbidden: 'Your access does not allow this change.',
        invalid: 'Some values were not accepted. Check the fields and try again.',
        notFound: 'This candidate is no longer available.',
        unavailable: 'The change could not be saved. Try again.',
      },
      failureTitle: 'Not saved',
      languageAdded: 'Language added.',
      skillAdded: 'Skill added.',
      statusChanged: 'Candidate status changed to {status}.',
      successTitle: 'Saved',
      updated: 'Candidate updated.',
    },
    fields: {
      availabilityNotice: 'Availability',
      city: 'City',
      country: 'Country',
      currentJobTitle: 'Current title',
      displayName: 'Full name',
      email: 'Email',
      linkedinUrl: 'LinkedIn',
      location: 'Location',
      phone: 'Phone',
      professionalSummary: 'Professional summary',
      source: 'Source',
      sourceDetail: 'Source detail',
    },
    filters: {
      anyStatus: 'Any status',
      region: 'Candidate search',
      reset: 'Clear search',
      search: 'Search',
      searchHint: 'Name, email, title, city, or country',
      status: 'Status',
      submit: 'Search candidates',
    },
    header: {
      description: 'Manage candidate profiles and recruitment information.',
      eyebrow: 'Recruitment',
      title: 'Candidates',
    },
    languages: {
      add: 'Add language',
      empty: 'No languages recorded.',
      language: 'Language',
      proficiency: 'Proficiency',
      title: 'Languages',
    },
    lifecycle: {
      archive: 'Archive candidate',
      archivedNotice:
        'This candidate is archived. Archived profiles are read-only and keep their history.',
      confirmArchive: 'Archive this candidate profile? Archived profiles become read-only.',
      confirmStatus: 'Change this candidate’s status to {status}?',
      moveTo: {
        ACTIVE: 'Mark active',
        INACTIVE: 'Mark inactive',
        TALENT_POOL: 'Move to talent pool',
      },
    },
    list: {
      region: 'Candidate list',
      showing: 'Showing {shown} of {total}',
      truncated: 'Only the {shown} most recent matches are listed. Refine the search to narrow it.',
      title: 'Candidate list',
      updated: 'Updated {date}',
    },
    profile: {
      archived: 'Archived {date}',
      archivedLabel: 'Archived',
      contactTitle: 'Contact and profile',
      created: 'Created {date}',
      createdLabel: 'Created',
      editTitle: 'Edit profile',
      noHeadline: 'No current title or location recorded',
      notRecorded: 'Not recorded',
      sourceTitle: 'Source and record',
      updated: 'Updated {date}',
      updatedLabel: 'Last updated',
    },
    records: {
      archived: 'Archived',
      unavailable: 'Structured profile records are not available with your current access.',
      unavailableTitle: 'Profile records',
    },
    sensitive: {
      description: 'Shown only to roles with access to this information.',
      label: 'Restricted',
      title: 'Restricted information',
    },
    skills: {
      add: 'Add skill',
      empty: 'No skills recorded.',
      level: 'Level',
      name: 'Skill',
      title: 'Skills',
    },
    states: {
      detailError: 'Unable to load this candidate.',
      detailErrorTitle: 'Candidate unavailable',
      listError: 'Unable to load candidates.',
      listErrorTitle: 'Candidates unavailable',
      loadingDetail: 'Loading candidate profile…',
      loadingList: 'Loading candidates…',
    },
    validation: {
      duplicateEmail: 'A candidate with this email already exists.',
      email: 'Enter a valid email address.',
      required: 'This field is required.',
      summary: 'Correct the highlighted fields and try again.',
      summaryTitle: 'Check the form',
    },
  },
  /**
   * Presentation labels for language-neutral values owned by the API, the
   * database, and the shared contracts. The stored value never changes; only its
   * label does, and a label is never sent back to the API or used in a branch.
   */
  domain: {
    candidateStatus: {
      ACTIVE: 'Active',
      ARCHIVED: 'Archived',
      INACTIVE: 'Inactive',
      TALENT_POOL: 'Talent pool',
    },
    consentStatus: {
      EXPIRED: 'Expired',
      GRANTED: 'Granted',
      REVOKED: 'Revoked',
      UNKNOWN: 'Unknown',
    },
    pipelineState: {
      ACCEPTED: 'Offer accepted',
      CANDIDATE_REJECTED: 'Declined by candidate',
      CLIENT_INTERVIEW_1: 'Client interview 1',
      CLIENT_INTERVIEW_2: 'Client interview 2',
      CLIENT_OFFER: 'Client offer',
      CLIENT_REJECTED: 'Declined by client',
      CV_TO_REVIEW: 'CV to review',
      HR_INTERVIEW_COMPLETED: 'HR interview completed',
      HR_INTERVIEW_SCHEDULED: 'HR interview scheduled',
      HR_PRESELECTION: 'HR preselection',
      INTEGRATED: 'Candidate integrated',
      INTERNAL_VALIDATION: 'Internal validation',
      NEW: 'New',
      POSTPONED: 'Postponed',
      PRESENTED_TO_CLIENT: 'Presented to client',
      PROBATION_COMPLETED: 'Probation completed',
      PROCESS_COMPLETED: 'Process completed',
      TALENT_POOL: 'Talent pool',
      TECHNICAL_TEST: 'Technical test',
      WAITING: 'Waiting',
      WITHDRAWN: 'Withdrawn',
    },
    recordState: {
      ACTIVE: 'Active',
      ARCHIVED: 'Archived',
      DRAFT: 'Draft',
    },
    reportingScope: {
      assigned: 'assigned missions',
      broad: 'all missions',
    },
    trendMetric: {
      interviewsScheduled: 'Interviews scheduled',
      offersCreated: 'Offers created',
      placementsConfirmed: 'Placements confirmed',
      processesCreated: 'Processes created',
      publicApplications: 'Public applications',
    },
  },
  preview: {
    candidate: {
      access: 'Preview access',
      accessFull: 'Full access',
      accessRecruiter: 'Recruiter without restricted data',
      accessViewer: 'Read-only viewer',
      dataset: 'Preview dataset',
      empty: 'No candidates',
      populated: 'Representative candidates',
    },
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
    reporting: {
      dataset: 'Preview dataset',
      empty: 'Empty result',
      populated: 'Representative activity',
    },
    route: 'Preview route: {route}',
    secondaryAction: 'Secondary action',
    status: 'Status',
    title: 'AppShell review',
    workspaceTitle: 'Operational content belongs directly in the page',
  },
} as const;

/** Canonical English, with every literal template preserved. */
export type CanonicalMessages = typeof enMessages;

/**
 * The structural contract every locale must satisfy: the same tree and the same
 * count-sensitive entries, with its own text and its own plural categories.
 */
export type Messages = WidenMessages<CanonicalMessages>;
