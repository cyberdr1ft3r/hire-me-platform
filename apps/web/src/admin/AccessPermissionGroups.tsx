import { useI18n } from '../i18n/index.js';

const areaPrefixes = {
  administration: ['users', 'roles', 'permissions', 'signing_credentials'],
  recruitment: [
    'candidates',
    'candidate_compensation',
    'candidate_consent',
    'candidate_profile',
    'evaluations',
    'client_feedback',
    'interviews',
    'interview_participants',
    'missions',
    'mission_assignments',
    'mission_candidate_notes',
    'mission_candidates',
    'offers',
    'placements',
    'public_applications',
    'public_opportunities',
  ],
  clients: ['clients', 'client_contacts'],
  collaboration: ['meetings', 'messages', 'notifications', 'tasks'],
  documents: ['documents', 'financial_documents'],
  finance: [
    'billing_settings',
    'client_balances',
    'commercial_data',
    'contracts',
    'expenses',
    'invoices',
    'mission_commercial_data',
    'payments',
    'placement_commercial_eligibility',
    'profitability',
    'purchase_orders',
    'quotations',
    'recruitment_financial_context',
  ],
  reporting: ['reporting'],
  training: [
    'training_enrollments',
    'training_participation',
    'training_programs',
    'training_sessions',
  ],
  uncategorized: [],
} as const;

export type PermissionArea = keyof typeof areaPrefixes;
export const permissionAreas = Object.keys(areaPrefixes) as PermissionArea[];
const areaByPrefix = new Map<string, PermissionArea>(
  permissionAreas.flatMap((area) => areaPrefixes[area].map((prefix) => [prefix, area] as const)),
);

export function permissionArea(code: string): PermissionArea {
  return areaByPrefix.get(code.split(':', 1)[0] ?? '') ?? 'uncategorized';
}

export interface PermissionEntry {
  code: string;
  description?: string;
  status?: 'ACTIVE' | 'DEPRECATED';
}

export function PermissionGroups({
  entries,
  emptyLabel,
}: {
  entries: readonly PermissionEntry[];
  emptyLabel: string;
}) {
  const { t } = useI18n();
  if (!entries.length) return <p>{emptyLabel}</p>;

  const groups = new Map<PermissionArea, PermissionEntry[]>();
  for (const entry of entries) {
    const area = permissionArea(entry.code);
    let group = groups.get(area);
    if (!group) {
      group = [];
      groups.set(area, group);
    }
    group.push(entry);
  }

  return (
    <div className="admin-permission-groups">
      {permissionAreas.map((area) => {
        const group = groups.get(area);
        if (!group) return null;
        return (
          <details key={area} className="admin-access-disclosure">
            <summary>
              {t('admin.access.groupSummary', {
                area: t(`admin.access.areas.${area}`),
                count: group.length,
              })}
            </summary>
            <ul className="admin-permission-list">
              {group.map(({ code, description, status }) => (
                <li key={code}>
                  {description ? <span lang="en">{description}</span> : null}
                  <code>{code}</code>
                  {status === 'DEPRECATED' ? <span>{t('admin.access.deprecated')}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
