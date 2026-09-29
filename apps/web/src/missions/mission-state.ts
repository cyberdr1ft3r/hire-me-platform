import type {
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionSummary,
} from '@hire-me/contracts';

import type { MessageKey, PlainMessageKey } from '../i18n/index.js';
import type { MissionFailure } from './mission-errors.js';

export const MISSION_LIST_PAGE_SIZE = 20;
export const MISSION_OPTION_PAGE_SIZE = 20;
export const MISSION_PROCESS_PAGE_SIZE = 20;
/** One bounded page of the mission client's contacts for interview invitations. */
export const MISSION_CONTACT_PAGE_SIZE = 50;

/** A named record chosen from an option source; its ID is submitted, never shown. */
export type PickerOption = {
  id: string;
  label: string;
  detail?: string | null;
};

export type MissionFilterValues = {
  search: string;
  state: '' | MissionLifecycleState;
  priority: '' | MissionSummary['priority'];
  client: PickerOption | null;
  assignedToMe: boolean;
};

export const EMPTY_MISSION_FILTERS: MissionFilterValues = {
  search: '',
  state: '',
  priority: '',
  client: null,
  assignedToMe: false,
};

export type MissionListQuery = {
  filters: MissionFilterValues;
  page: number;
};

export const FIRST_MISSION_PAGE: MissionListQuery = {
  filters: EMPTY_MISSION_FILTERS,
  page: 1,
};

export function hasActiveMissionFilters(filters: MissionFilterValues): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.state !== '' ||
    filters.priority !== '' ||
    filters.client !== null ||
    filters.assignedToMe
  );
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type MissionListState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      missions: MissionSummary[];
      page: number;
      pageSize: number;
      total: number;
    };

/** One server page of the selected mission's candidate processes. */
export type MissionProcessPage = {
  candidates: MissionCandidateSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type MissionDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; mission: MissionSummary };

/** One independently loaded section of the selected mission. */
export type SectionState<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export const IDLE: SectionState<never> = { status: 'idle' };

export function sectionData<T>(section: SectionState<T>): T | null {
  return section.status === 'ready' ? section.data : null;
}

/**
 * Feedback keeps message keys, not text, so it is re-rendered in the new
 * language after a locale switch. `labelKey` fills a `{label}` placeholder.
 */
export type MissionFeedback =
  | { tone: 'success'; key: MessageKey; labelKey?: PlainMessageKey }
  | { tone: 'warning'; key: PlainMessageKey }
  | { tone: 'danger'; key: PlainMessageKey; failure: MissionFailure };

export type MissionPendingAction =
  | 'createMission'
  | 'updateMission'
  | 'lifecycle'
  | 'assignment'
  | 'process'
  | 'offer'
  | 'placement'
  | 'interview'
  | 'evaluation'
  | 'publicOpportunity';

export type MissionProfileValues = {
  title: string;
  priority: MissionSummary['priority'];
  numberOfPositions: string;
  location: string;
  workArrangement: string;
  engagementType: string;
};

export type MissionCreateValues = MissionProfileValues & {
  client: PickerOption | null;
  description: string;
  requirements: string;
};

export const EMPTY_MISSION_CREATE: MissionCreateValues = {
  client: null,
  title: '',
  description: '',
  requirements: '',
  priority: 'NORMAL',
  numberOfPositions: '1',
  location: '',
  workArrangement: '',
  engagementType: '',
};

export function missionToProfileValues(mission: MissionSummary): MissionProfileValues {
  return {
    title: mission.title,
    priority: mission.priority,
    numberOfPositions: String(mission.numberOfPositions),
    location: mission.location ?? '',
    workArrangement: mission.workArrangement ?? '',
    engagementType: mission.engagementType ?? '',
  };
}
