import { useState } from 'react';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { ReportingDashboard } from '../reporting/index.js';
import type { ReportingFilterValues } from '../reporting/index.js';
import { EMPTY_REPORTING_FILTERS } from '../reporting/index.js';
import { Select } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import {
  emptyReportingData,
  populatedReportingData,
  previewUser,
} from './reporting-preview-data.js';

/**
 * Development-only review surface for the recruitment reporting dashboard.
 *
 * It renders the real `ReportingDashboard` inside the real `AppShell` and the
 * real `I18nProvider`, so switching language here exercises the same components
 * production uses. There is no second, preview-only copy of the dashboard.
 *
 * It performs no request of any kind and contains no business data. It is not
 * linked from product navigation and is excluded from the production build.
 */
export function ReportingPreview() {
  return (
    <I18nProvider>
      <ReportingPreviewContent />
    </I18nProvider>
  );
}

type PreviewDataset = 'empty' | 'populated';

function ReportingPreviewContent() {
  const { t } = useI18n();
  const [dataset, setDataset] = useState<PreviewDataset>('populated');
  const [filters, setFilters] = useState<ReportingFilterValues>(EMPTY_REPORTING_FILTERS);

  return (
    <AppShell
      apiState={{ message: 'hire-me-api is ok', status: 'ready' }}
      currentRoute="reporting"
      onLogout={() => undefined}
      onNavigate={() => undefined}
      onRefreshUser={() => undefined}
      user={previewUser}
    >
      <div className="reporting-preview__switch">
        <Select
          label={t('preview.reporting.dataset')}
          onChange={(event) => setDataset(event.target.value === 'empty' ? 'empty' : 'populated')}
          value={dataset}
        >
          <option value="populated">{t('preview.reporting.populated')}</option>
          <option value="empty">{t('preview.reporting.empty')}</option>
        </Select>
      </div>
      <ReportingDashboard
        canExport
        exportFeedback={null}
        filters={filters}
        onApply={() => undefined}
        onExport={() => undefined}
        onFiltersChange={setFilters}
        onPageChange={() => undefined}
        onReset={() => setFilters({ ...EMPTY_REPORTING_FILTERS })}
        onRetry={() => undefined}
        report={{
          data: dataset === 'empty' ? emptyReportingData : populatedReportingData,
          status: 'ready',
        }}
        tableState="idle"
      />
    </AppShell>
  );
}
