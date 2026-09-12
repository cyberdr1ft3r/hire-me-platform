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
  task: {
    actions: {
      addAssignee: 'Add assignee',
      addComment: 'Add comment',
      addReminder: 'Schedule reminder',
      applyFilters: 'Apply filters',
      archiveNotification: 'Archive notification',
      archive: 'Archive task',
      cancel: 'Cancel',
      changeOwner: 'Change owner',
      create: 'Create task',
      edit: 'Edit task',
      markAllRead: 'Mark visible read',
      markRead: 'Mark read',
      newTask: 'New task',
      processReminders: 'Process due reminders',
      reset: 'Reset',
      retry: 'Try again',
      save: 'Save changes',
      transition: 'Change status',
    },
    comments: {
      body: 'Comment',
      empty: 'No comments yet.',
      mentions: 'Mention user UUIDs',
      mentionsHint: 'Separate multiple UUIDs with commas.',
      title: 'Comments',
    },
    detail: {
      assignments: 'Assignees',
      context: 'Linked context',
      created: 'Created',
      description: 'Description',
      history: 'Activity history',
      metadata: 'Task details',
      notRecorded: 'Not recorded',
      selectBody: 'Choose a task from the queue to see its operational detail.',
      selectTitle: 'Select a task',
      updated: 'Last updated',
    },
    feedback: {
      archived: 'Task archived.',
      assignmentAdded: 'Assignee added.',
      commentAdded: 'Comment added.',
      created: 'Task created.',
      errorTitle: 'Action failed',
      failed: 'The action could not be completed. Check the task and try again.',
      ownerChanged: 'Task owner changed.',
      reminderAdded: 'Reminder scheduled.',
      remindersProcessed: '{delivered} reminders delivered; {overdue} overdue notices created.',
      statusChanged: 'Task moved to {status}.',
      successTitle: 'Task updated',
      updated: 'Task updated.',
    },
    fields: {
      assignee: 'Assignee user UUID',
      description: 'Description',
      dueAt: 'Due date and time',
      missionCandidate: 'Mission candidate UUID',
      mission: 'Mission UUID',
      owner: 'Owner user UUID',
      priority: 'Priority',
      reason: 'Reason',
      search: 'Search tasks',
      status: 'Status',
      timezone: 'Timezone',
      title: 'Title',
    },
    filters: {
      anyPriority: 'Any priority',
      anyStatus: 'Any status',
      description: 'Search and narrow the current work queue.',
      title: 'Queue filters',
    },
    header: {
      description: 'Review ownership, deadlines, status, comments and reminders in one work queue.',
      title: 'Task pipeline',
    },
    list: {
      assignees: plural({ one: '{count} assignee', other: '{count} assignees' }),
      empty: 'There are no visible tasks.',
      filteredEmpty: 'No tasks match these filters.',
      region: 'Task queue',
      showing: 'Showing {shown} of {total}',
      title: 'Work queue',
    },
    notifications: {
      anyStatus: 'Any status',
      empty: 'No notifications.',
      read: 'Read',
      status: 'Notification status',
      title: 'Notifications',
      unread: 'Unread',
    },
    reminders: {
      empty: 'No reminders scheduled.',
      recipient: 'Recipient user UUID',
      remindAt: 'Reminder date and time',
      title: 'Reminders',
    },
    states: {
      detailError: 'Unable to load this task.',
      listError: 'Unable to load tasks.',
      loadingDetail: 'Loading task details…',
      loadingList: 'Loading tasks…',
    },
    validation: {
      reasonRequired: 'A reason is required for this status.',
      required: 'This field is required.',
    },
    values: {
      dueFuture: 'Due {date}',
      dueNone: 'No due date',
      dueOverdue: 'Overdue · {date}',
      dueToday: 'Due today · {date}',
    },
  },
  /**
   * The public opportunity pages and their application form. Every string here
   * is presentation only: nothing is sent to the API, and no business rule reads
   * it. Opportunity content itself (title, location, and so on) is the staff's
   * own public text and is shown exactly as published, never translated.
   */
  publicOpportunity: {
    application: {
      consent: 'I consent to HireMe processing this application.',
      description: 'Fields marked * are required.',
      fields: {
        availability: 'Availability',
        city: 'City',
        country: 'Country',
        currentPosition: 'Current position',
        email: 'Email',
        experienceYears: 'Years of experience',
        fullName: 'Full name',
        languages: 'Languages',
        motivation: 'Motivation',
        phone: 'Phone',
        professionalLinks: 'Professional links',
        salaryAmount: 'Amount',
        salaryCurrency: 'Currency',
        skills: 'Skills',
      },
      files: {
        choose: 'Choose a file',
        none: 'No file selected',
      },
      hints: {
        availability: 'For example, your notice period or earliest start date',
        documents: 'Accepted formats: {types}. Up to {fileSize} per file and {totalSize} in total.',
        professionalLinks: 'LinkedIn, portfolio, or personal website',
        salaryCurrency: 'Three-letter code, for example EUR or MAD',
      },
      sections: {
        about: 'About you',
        documents: 'Documents',
        experience: 'Experience',
        motivation: 'Links and motivation',
        salary: 'Salary expectation',
      },
      submit: 'Submit application',
      submitting: 'Submitting…',
      title: 'Apply for this role',
    },
    detail: {
      about: 'About the role',
      apply: 'Apply now',
      back: 'All open roles',
      keyDetails: 'Key details',
      loadingTitle: 'Opportunity',
      skills: 'Skills',
    },
    empty: {
      body: 'New opportunities are published on this page.',
      title: 'No open roles at the moment',
    },
    feedback: {
      browseRoles: 'Browse other open roles',
      failure: {
        failed: 'Your application could not be sent. Check your connection and try again.',
        invalid:
          'Some information could not be accepted. Check your details and documents, then try again.',
        rateLimited: 'Too many attempts in a short time. Wait a minute, then try again.',
        unavailable: 'This opportunity is no longer accepting applications.',
      },
      failureTitle: 'Application not sent',
      receivedBody:
        'Thank you. Your application has been received and will be reviewed if this opportunity is still available.',
      receivedTitle: 'Application received',
    },
    fields: {
      company: 'Company',
      deadline: 'Apply by',
      engagementType: 'Contract type',
      experienceLevel: 'Experience level',
      location: 'Location',
      salary: 'Salary',
      workArrangement: 'Work arrangement',
    },
    fileTypes: {
      jpeg: 'JPEG',
      pdf: 'PDF',
      png: 'PNG',
      text: 'plain text',
    },
    list: {
      count: plural({ one: '{count} open role', other: '{count} open roles' }),
      description: 'Browse the roles currently open and apply online.',
      title: 'Open roles',
      viewOpportunity: 'View opportunity',
    },
    site: {
      brandSubtitle: 'Opportunities',
      skipToMain: 'Skip to main content',
    },
    states: {
      detailError: 'We couldn’t load this opportunity. Check your connection and try again.',
      detailErrorTitle: 'Opportunity unavailable right now',
      listError: 'We couldn’t load the open roles. Check your connection and try again.',
      listErrorTitle: 'Open roles unavailable',
      loadingDetail: 'Loading opportunity…',
      loadingList: 'Loading open roles…',
      notFound: 'It may have closed, or the link may be incorrect.',
      notFoundTitle: 'This opportunity is not available',
    },
    validation: {
      consent: 'Your consent is needed to submit this application.',
      email: 'Enter a valid email address.',
      experienceYears: 'Enter a whole number from 0 to 80.',
      fileRequired: 'Add this document to apply.',
      fileSize: 'This file is larger than {size}.',
      fileTotal: 'Together, these files are larger than {size}.',
      fileType: 'This file type is not accepted.',
      required: 'This field is required.',
      summary: 'Correct the highlighted fields, then submit again.',
      summaryTitle: 'Check your application',
      wholeNumber: 'Enter a whole number, without spaces or symbols.',
    },
    values: {
      confidentialCompany: 'Confidential',
      deadline: '{date} UTC',
      salaryFrom: 'From {amount}',
      salaryRange: '{min} – {max}',
      salaryUpTo: 'Up to {amount}',
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
    publicApplicationFileCategory: {
      ADDITIONAL: 'Additional document',
      CERTIFICATION: 'Certification',
      CV: 'CV',
      DIPLOMA: 'Diploma',
    },
    taskPriority: {
      HIGH: 'High',
      LOW: 'Low',
      NORMAL: 'Normal',
      URGENT: 'Urgent',
    },
    taskStatus: {
      ARCHIVED: 'Archived',
      BLOCKED: 'Blocked',
      CANCELED: 'Canceled',
      COMPLETED: 'Completed',
      IN_PROGRESS: 'In progress',
      OPEN: 'Open',
      WAITING: 'Waiting',
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
    publicOpportunity: {
      detail: 'Opportunity detail',
      detailError: 'Detail request failure',
      detailLoading: 'Detail loading',
      empty: 'No open roles',
      list: 'Open roles list',
      listError: 'List request failure',
      listLoading: 'List loading',
      notFound: 'Opportunity not available',
      received: 'Application received',
      state: 'Preview state',
      submissionFailed: 'Application not sent',
    },
    paragraph:
      'This placeholder demonstrates spacing and hierarchy without reproducing a future module design or using real business data.',
    reference: 'Reference',
    reporting: {
      dataset: 'Preview dataset',
      empty: 'Empty result',
      populated: 'Representative activity',
    },
    task: {
      dataset: 'Preview dataset',
      empty: 'Empty workspace',
      filtered: 'Filtered empty result',
      populated: 'Representative tasks',
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
