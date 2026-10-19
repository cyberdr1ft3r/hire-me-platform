import { lazy } from 'react';

/** Route-level code splits (Console Workspace B1). Shell, auth, and navigation stay eager. */
export const LazyAdminPanel = lazy(() =>
  import('../admin/AdminPanel.js').then((m) => ({ default: m.AdminPanel })),
);
export const LazyAgendaPanel = lazy(() =>
  import('../agenda/index.js').then((m) => ({ default: m.AgendaPanel })),
);
export const LazyAccountingPanel = lazy(() =>
  import('../accounting/index.js').then((m) => ({ default: m.AccountingPanel })),
);
export const LazyCandidatesPanel = lazy(() =>
  import('../candidates/index.js').then((m) => ({ default: m.CandidatesPanel })),
);
export const LazyClientsPanel = lazy(() =>
  import('../clients/ClientsPanel.js').then((m) => ({ default: m.ClientsPanel })),
);
export const LazyCommercialPanel = lazy(() =>
  import('../commercial/index.js').then((m) => ({ default: m.CommercialPanel })),
);
export const LazyDocumentsPanel = lazy(() =>
  import('../documents/index.js').then((m) => ({ default: m.DocumentsPanel })),
);
export const LazyMeetingsPanel = lazy(() =>
  import('../meetings/index.js').then((m) => ({ default: m.MeetingsPanel })),
);
export const LazyMessagesPanel = lazy(() =>
  import('../messages/index.js').then((m) => ({ default: m.MessagesPanel })),
);
export const LazyMissionsPanel = lazy(() =>
  import('../missions/index.js').then((m) => ({ default: m.MissionsPanel })),
);
export const LazyReportingPanel = lazy(() =>
  import('../reporting/index.js').then((m) => ({ default: m.ReportingPanel })),
);
export const LazyTasksPanel = lazy(() =>
  import('../tasks/index.js').then((m) => ({ default: m.TasksPanel })),
);
export const LazyTrainingPanel = lazy(() =>
  import('../training/index.js').then((m) => ({ default: m.TrainingPanel })),
);
export const LazyPublicOpportunitiesPanel = lazy(() =>
  import('../public-opportunities/index.js').then((m) => ({ default: m.PublicOpportunitiesPanel })),
);
export const LazyPublicOpportunityDetailPanel = lazy(() =>
  import('../public-opportunities/index.js').then((m) => ({
    default: m.PublicOpportunityDetailPanel,
  })),
);
