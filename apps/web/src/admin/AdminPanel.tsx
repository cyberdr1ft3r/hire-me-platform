import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { DirectoryPage, InlineMessage } from '../ui/index.js';
import {
  adminSectionPath,
  canAccessAdminSection,
  visibleAdminSections,
  type AdminSection,
} from './admin-sections.js';
import { BillingSettingsPanel } from './BillingSettingsPanel.js';
import { AccessAdministrationPanel } from './AccessAdministrationPanel.js';
import { UserAdministrationPanel } from './UserAdministrationPanel.js';
import './admin.css';

const sectionLabels: Record<AdminSection, PlainMessageKey> = {
  billing: 'admin.sections.billing.title',
  users: 'admin.sections.users.title',
  access: 'admin.sections.access.title',
};

export function AdminPanel({
  accessToken,
  onNavigateSection,
  permissions = ['users:view'],
  section,
}: {
  accessToken: string;
  onNavigateSection?: (section: AdminSection) => void;
  permissions?: readonly string[];
  section?: AdminSection | null;
}) {
  const { t } = useI18n();
  const visibleSections = visibleAdminSections(permissions);
  const activeSection = section ?? visibleSections[0] ?? null;
  const requestedSectionDenied = Boolean(section && !canAccessAdminSection(section, permissions));

  return (
    <DirectoryPage
      className="admin-workspace"
      description={t('admin.header.description')}
      eyebrow={t('admin.header.eyebrow')}
      title={t('admin.header.title')}
      toolbar={
        visibleSections.length ? (
          <nav aria-label={t('admin.navigation.label')} className="admin-section-nav">
            <ul>
              {visibleSections.map((item) => (
                <li key={item}>
                  <a
                    aria-current={
                      !requestedSectionDenied && activeSection === item ? 'page' : undefined
                    }
                    href={adminSectionPath(item)}
                    onClick={(event) => {
                      if (!onNavigateSection) return;
                      event.preventDefault();
                      onNavigateSection(item);
                    }}
                  >
                    {t(sectionLabels[item])}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : undefined
      }
    >
      {requestedSectionDenied || !activeSection ? (
        <InlineMessage announce title={t('admin.denied.title')} tone="danger">
          {t('admin.denied.message')}
        </InlineMessage>
      ) : activeSection === 'billing' ? (
        <BillingSettingsPanel
          accessToken={accessToken}
          canManage={permissions.includes('billing_settings:manage')}
        />
      ) : activeSection === 'users' ? (
        <UserAdministrationPanel accessToken={accessToken} permissions={permissions} />
      ) : (
        <AccessAdministrationPanel accessToken={accessToken} permissions={permissions} />
      )}
    </DirectoryPage>
  );
}
