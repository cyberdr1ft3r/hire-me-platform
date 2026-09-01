import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AdminPermission,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserSummary,
  AuthenticatedUser,
  CandidateDetail,
  CandidateSummary,
  CandidateEvaluation,
  ClientContactSummary,
  ClientSummary,
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateState,
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionSummary,
  MissionPlacement,
  OfferAggregate,
  InternalPublicApplicationSummary,
  InternalPublicOpportunity,
  Notification,
  PublicOpportunity,
  TaskSummary,
} from '@hire-me/contracts';

import {
  archiveCandidate,
  archiveClient,
  archiveClientContact,
  archiveNotification,
  archiveMission,
  archiveMissionAssignment,
  archiveInterview,
  cancelInterview,
  addTaskAssignment,
  assignAdminRole,
  changeTaskOwner,
  completeInterview,
  createTask as createInternalTask,
  createTaskComment,
  createTaskReminder,
  createCandidate,
  createCandidateEducation,
  createCandidateLanguage,
  createCandidateSkill,
  createCandidateWorkExperience,
  createClient,
  createClientContact,
  createMission,
  createMissionAssignment,
  createEvaluation,
  createAdminUser,
  fetchHealthStatus,
  fetchMeWithRefresh,
  finalizeEvaluation,
  getClient,
  getCandidate,
  getMission,
  getInternalPublicOpportunity,
  getAdminUser,
  listCandidates,
  listClientContacts,
  listClients,
  listMissionAssignments,
  listMissions,
  listNotifications,
  listTasks,
  listInternalPublicApplications,
  listPublicOpportunities,
  listEvaluations,
  listInterviews,
  listAdminPermissions,
  listAdminRoles,
  listAdminUsers,
  login,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  removeAdminRole,
  revokeAdminSession,
  revokeAllAdminSessions,
  updateAdminUser,
  updateAdminUserStatus,
  updateCandidate,
  updateCandidateStatus,
  updateClient,
  updateClientContact,
  updateClientContactStatus,
  updateClientStatus,
  updateMission,
  updateMissionAssignment,
  updateMissionStatus,
  updateInternalPublicOpportunity,
  closeMission,
  confirmMissionCandidatePlacement,
  correctMissionCandidatePlacement,
  createMissionCandidateOffer,
  createMissionCandidate,
  getMissionCandidateOffers,
  getMissionCandidatePlacement,
  setMissionLeadRecruiter,
  scheduleInterview,
  submitPublicApplication,
  getPublicOpportunity,
  listMissionCandidates,
  presentMissionCandidate,
  postponeInterview,
  processDueTaskReminders,
  refresh,
  rescheduleInterview,
  transferMissionCandidate,
  transitionMissionCandidate,
  markMissionCandidateOfferSent,
  recordMissionCandidateOfferResponse,
  reviseMissionCandidateOffer,
  withdrawMissionCandidateOffer,
  updateTaskStatus,
} from './api.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type Route = 'home' | 'admin' | 'clients' | 'candidates' | 'missions' | 'tasks';

const ADMIN_ROUTE_PERMISSION = 'users:view';
const CLIENTS_ROUTE_PERMISSION = 'clients:view';
const CANDIDATES_ROUTE_PERMISSION = 'candidates:view';
const MISSIONS_ROUTE_PERMISSION = 'missions:view';
const TASKS_ROUTE_PERMISSION = 'tasks:view';

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() =>
    window.location.pathname === '/admin'
      ? 'admin'
      : window.location.pathname === '/clients'
        ? 'clients'
        : window.location.pathname === '/candidates'
          ? 'candidates'
          : window.location.pathname === '/missions'
            ? 'missions'
            : window.location.pathname === '/tasks'
              ? 'tasks'
              : 'home',
  );

  useEffect(() => {
    let isMounted = true;

    fetchHealthStatus()
      .then((health) => {
        if (isMounted) {
          setApiState({
            status: 'ready',
            message: `${health.service} is ${health.status}`,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setApiState({
            status: 'error',
            message: 'API health status is unavailable',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    refresh()
      .then((auth) => {
        if (isMounted) {
          setAccessToken(auth.accessToken);
          setUser(auth.user);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError(null);

    const formData = new FormData(event.currentTarget);
    const emailValue = formData.get('email');
    const passwordValue = formData.get('password');
    const email = typeof emailValue === 'string' ? emailValue : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';

    try {
      const auth = await login(email, password);
      setAccessToken(auth.accessToken);
      setUser(auth.user);
    } catch {
      setAuthError('Authentication failed.');
    }
  }

  async function handleRefreshUser(): Promise<void> {
    if (!accessToken) {
      return;
    }

    try {
      const { accessToken: nextAccessToken, me } = await fetchMeWithRefresh(accessToken);
      setAccessToken(nextAccessToken);
      setUser(me.user);
    } catch {
      setAccessToken(null);
      setUser(null);
    }
  }

  async function handleLogout(): Promise<void> {
    if (accessToken) {
      await logout(accessToken);
    }
    setAccessToken(null);
    setUser(null);
    navigate('home');
  }

  function navigate(nextRoute: Route): void {
    setRoute(nextRoute);
    window.history.pushState(
      {},
      '',
      nextRoute === 'admin'
        ? '/admin'
        : nextRoute === 'clients'
          ? '/clients'
          : nextRoute === 'candidates'
            ? '/candidates'
            : nextRoute === 'missions'
              ? '/missions'
              : nextRoute === 'tasks'
                ? '/tasks'
                : '/',
    );
  }

  const publicOpportunityMatch = window.location.pathname.match(/^\/opportunities\/([^/]+)$/);
  if (window.location.pathname === '/opportunities') {
    return <PublicOpportunitiesPage />;
  }
  if (publicOpportunityMatch?.[1]) {
    return <PublicOpportunityDetailPage publicSlug={publicOpportunityMatch[1]} />;
  }

  const canOpenAdmin = Boolean(user?.permissions.includes(ADMIN_ROUTE_PERMISSION));
  const canOpenClients = Boolean(user?.permissions.includes(CLIENTS_ROUTE_PERMISSION));
  const canOpenCandidates = Boolean(user?.permissions.includes(CANDIDATES_ROUTE_PERMISSION));
  const canOpenMissions = Boolean(user?.permissions.includes(MISSIONS_ROUTE_PERMISSION));
  const canOpenTasks = Boolean(user?.permissions.includes(TASKS_ROUTE_PERMISSION));

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Hire Me Platform</p>
        <h1 id="page-title">Recruitment operations workspace</h1>
        <p>The monorepo foundation is ready for product modules after the next approved tasks.</p>
      </section>

      <section className="status-panel" aria-live="polite" aria-label="API status">
        <span className={`status-dot status-dot--${apiState.status}`} />
        <div>
          <h2>API health</h2>
          <p>
            {apiState.status === 'loading' ? 'Checking API health status...' : apiState.message}
          </p>
        </div>
      </section>

      {user ? (
        <section className="auth-panel" aria-label="Authenticated workspace">
          <div>
            <h2>Signed in</h2>
            <p>{user.displayName}</p>
          </div>
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                void handleRefreshUser();
              }}
            >
              Refresh profile
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('admin');
              }}
            >
              Administration
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('clients');
              }}
            >
              Clients
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('candidates');
              }}
            >
              Candidates
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('missions');
              }}
            >
              Missions
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('tasks');
              }}
            >
              Tasks
            </button>
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
            >
              Logout
            </button>
          </div>
        </section>
      ) : (
        <form
          className="auth-panel"
          aria-label="Login"
          onSubmit={(event) => {
            void handleLogin(event);
          }}
        >
          <h2>Sign in</h2>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Login</button>
          {authError ? <p role="alert">{authError}</p> : null}
        </form>
      )}

      {route === 'admin' && user && accessToken ? (
        canOpenAdmin ? (
          <AdminPanel accessToken={accessToken} />
        ) : (
          <section className="admin-panel" aria-label="Administration">
            <h2>Administration</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'clients' && user && accessToken ? (
        canOpenClients ? (
          <ClientsPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Clients">
            <h2>Clients</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'candidates' && user && accessToken ? (
        canOpenCandidates ? (
          <CandidatesPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Candidates">
            <h2>Candidates</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'missions' && user && accessToken ? (
        canOpenMissions ? (
          <MissionsPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Missions">
            <h2>Missions</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'tasks' && user && accessToken ? (
        canOpenTasks ? (
          <TasksPanel accessToken={accessToken} user={user} />
        ) : (
          <section className="admin-panel" aria-label="Tasks">
            <h2>Tasks</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
    </main>
  );
}

function TasksPanel({ accessToken, user }: { accessToken: string; user: AuthenticatedUser }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskOwnerFilter, setTaskOwnerFilter] = useState('');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState('');
  const [taskTotal, setTaskTotal] = useState(0);
  const [notificationStatusFilter, setNotificationStatusFilter] = useState('');
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const permissions = new Set(user.permissions);
  const canViewTasks = permissions.has('tasks:view');
  const canCreateTasks = permissions.has('tasks:create');
  const canAssignTasks = permissions.has('tasks:assign');
  const canTransitionTasks = permissions.has('tasks:transition');
  const canCommentTasks = permissions.has('tasks:comment');
  const canManageReminders = permissions.has('tasks:reminders:manage');
  const canViewNotifications = permissions.has('notifications:view_own');

  useEffect(() => {
    void loadTasks();
    void loadNotifications();
  }, []);

  async function loadTasks(
    nextSearch = taskSearch,
    nextStatus = taskStatusFilter,
    nextOwner = taskOwnerFilter,
    nextAssignee = taskAssigneeFilter,
  ): Promise<void> {
    if (!canViewTasks) {
      return;
    }
    const response = await listTasks(accessToken, {
      search: nextSearch || undefined,
      status: nextStatus ? (nextStatus as TaskSummary['status']) : undefined,
      ownerUserId: nextOwner || undefined,
      assigneeUserId: nextAssignee || undefined,
      pageSize: 25,
    });
    setTasks(response.tasks);
    setTaskTotal(response.pageInfo.total);
    setSelectedTaskId((current) => current || response.tasks[0]?.id || '');
  }

  async function loadNotifications(nextStatus = notificationStatusFilter): Promise<void> {
    if (!canViewNotifications) {
      return;
    }
    const response = await listNotifications(accessToken, {
      status: notificationListStatus(nextStatus),
      pageSize: 25,
    });
    setNotifications(response.notifications);
    setNotificationTotal(response.pageInfo.total);
  }

  async function handleTaskFilters(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadTasks(taskSearch, taskStatusFilter, taskOwnerFilter, taskAssigneeFilter);
  }

  async function handleNotificationFilters(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadNotifications(notificationStatusFilter);
  }

  async function createTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const assigneeUserId = formValue(formData, 'assigneeUserId');
    const created = await createInternalTask(accessToken, {
      title: formValue(formData, 'title'),
      description: formValue(formData, 'description') || null,
      priority: formValue(formData, 'priority', 'NORMAL') as TaskSummary['priority'],
      ownerUserId: user.id,
      assigneeUserIds: assigneeUserId ? [assigneeUserId] : [],
      dueAt: localDateTimeToIso(formValue(formData, 'dueAt')),
      context: {
        recruitmentMissionId: formValue(formData, 'recruitmentMissionId') || null,
        missionCandidateId: formValue(formData, 'missionCandidateId') || null,
      },
    });
    setSelectedTaskId(created.task.id);
    setMessage('Task created.');
    form.reset();
    await loadTasks();
    await loadNotifications();
  }

  async function transitionTask(status: TaskSummary['status']): Promise<void> {
    if (!selectedTaskId) {
      return;
    }
    await updateTaskStatus(accessToken, selectedTaskId, {
      status,
      reason:
        status === 'CANCELED'
          ? 'Canceled from the internal task workspace.'
          : status === 'BLOCKED'
            ? 'Blocked from the internal task workspace.'
            : null,
    });
    setMessage(`Task moved to ${status}.`);
    await loadTasks();
    await loadNotifications();
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    await addTaskAssignment(accessToken, selectedTaskId, {
      userId: formValue(formData, 'userId'),
      reason: formValue(formData, 'reason') || null,
    });
    setMessage('Task assignee added.');
    form.reset();
    await loadTasks();
    await loadNotifications();
  }

  async function changeOwner(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    await changeTaskOwner(accessToken, selectedTaskId, {
      ownerUserId: formValue(formData, 'ownerUserId'),
      reason: formValue(formData, 'reason') || null,
    });
    setMessage('Task owner changed.');
    form.reset();
    await loadTasks();
    await loadNotifications();
  }

  async function addComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    const mentionedUserIds = formValue(formData, 'mentionedUserIds')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    await createTaskComment(accessToken, selectedTaskId, {
      body: formValue(formData, 'body'),
      mentionedUserIds,
    });
    setMessage('Task comment added.');
    form.reset();
    await loadNotifications();
  }

  async function addReminder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    await createTaskReminder(accessToken, selectedTaskId, {
      recipientUserId: formValue(formData, 'recipientUserId'),
      remindAt: localDateTimeToIso(formValue(formData, 'remindAt')) ?? new Date().toISOString(),
    });
    setMessage('Task reminder created.');
    form.reset();
    await loadTasks();
  }

  async function processReminders(): Promise<void> {
    const response = await processDueTaskReminders(accessToken);
    setMessage(
      `Processed ${response.remindersDelivered} reminders and ${response.overdueNotificationsCreated} overdue notices.`,
    );
    await loadNotifications();
  }

  async function readNotification(notificationId: string): Promise<void> {
    await markNotificationRead(accessToken, notificationId);
    setMessage('Notification marked read.');
    await loadNotifications();
  }

  async function readAllNotifications(): Promise<void> {
    const response = await markAllNotificationsRead(accessToken);
    setMessage(`${response.updatedCount} notifications marked read.`);
    await loadNotifications();
  }

  async function archiveOneNotification(notificationId: string): Promise<void> {
    await archiveNotification(accessToken, notificationId);
    setMessage('Notification archived.');
    await loadNotifications();
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  return (
    <section className="admin-panel" aria-label="Tasks">
      <div className="panel-heading">
        <div>
          <h2>Tasks</h2>
          <p>Internal operational tasks, reminders, comments, and in-app notifications.</p>
        </div>
        {canManageReminders ? (
          <button type="button" onClick={() => void processReminders()}>
            Process reminders
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {canViewTasks ? (
        <div className="grid-two">
          <section aria-label="Task list">
            <h3>Visible tasks</h3>
            <form
              className="compact-form"
              aria-label="Filter tasks"
              onSubmit={(event) => void handleTaskFilters(event)}
            >
              <input
                aria-label="Search tasks"
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Search tasks"
              />
              <select
                aria-label="Task status"
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
              >
                <option value="">Any status</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="WAITING">Waiting</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELED">Canceled</option>
              </select>
              <input
                aria-label="Owner user UUID"
                value={taskOwnerFilter}
                onChange={(event) => setTaskOwnerFilter(event.target.value)}
                placeholder="Owner user UUID"
              />
              <input
                aria-label="Assignee user UUID"
                value={taskAssigneeFilter}
                onChange={(event) => setTaskAssigneeFilter(event.target.value)}
                placeholder="Assignee user UUID"
              />
              <button type="submit">Filter tasks</button>
            </form>
            <p>{taskTotal} visible tasks.</p>
            {tasks.length > 0 ? (
              <ul className="plain-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <button type="button" onClick={() => setSelectedTaskId(task.id)}>
                      {task.title}
                    </button>
                    <span>
                      {task.status} - {task.priority}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No visible tasks.</p>
            )}
          </section>
          <section aria-label="Selected task">
            <h3>{selectedTask?.title ?? 'Select a task'}</h3>
            {selectedTask ? (
              <>
                <p>
                  {selectedTask.status} - owner {selectedTask.ownerDisplayName ?? 'Unassigned'}
                </p>
                {canTransitionTasks ? (
                  <div className="action-row" aria-label="Task lifecycle actions">
                    <button type="button" onClick={() => void transitionTask('IN_PROGRESS')}>
                      Start
                    </button>
                    <button type="button" onClick={() => void transitionTask('BLOCKED')}>
                      Block
                    </button>
                    <button type="button" onClick={() => void transitionTask('COMPLETED')}>
                      Complete
                    </button>
                    <button type="button" onClick={() => void transitionTask('CANCELED')}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                {canAssignTasks ? (
                  <>
                    <form className="compact-form" onSubmit={(event) => void changeOwner(event)}>
                      <h4>Change owner</h4>
                      <input name="ownerUserId" placeholder="New owner user UUID" required />
                      <input name="reason" placeholder="Reason" />
                      <button type="submit">Change owner</button>
                    </form>
                    <form className="compact-form" onSubmit={(event) => void addAssignment(event)}>
                      <h4>Add assignee</h4>
                      <input name="userId" placeholder="Internal user UUID" required />
                      <input name="reason" placeholder="Reason" />
                      <button type="submit">Assign</button>
                    </form>
                  </>
                ) : null}
                {canCommentTasks ? (
                  <form className="compact-form" onSubmit={(event) => void addComment(event)}>
                    <h4>Add comment</h4>
                    <textarea name="body" placeholder="Internal comment" required />
                    <input
                      name="mentionedUserIds"
                      placeholder="Mention user UUIDs, comma-separated"
                    />
                    <button type="submit">Comment</button>
                  </form>
                ) : null}
                {canManageReminders ? (
                  <form className="compact-form" onSubmit={(event) => void addReminder(event)}>
                    <h4>Add reminder</h4>
                    <input name="recipientUserId" placeholder="Recipient user UUID" required />
                    <input name="remindAt" type="datetime-local" required />
                    <button type="submit">Remind</button>
                  </form>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : (
        <p role="alert">Permission denied.</p>
      )}
      {canCreateTasks ? (
        <form
          className="admin-form"
          aria-label="Create task"
          onSubmit={(event) => void createTask(event)}
        >
          <h3>Create task</h3>
          <input name="title" placeholder="Task title" required />
          <textarea name="description" placeholder="Description" />
          <select name="priority" defaultValue="NORMAL">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
          <input name="dueAt" type="datetime-local" />
          <input name="assigneeUserId" placeholder="Initial assignee UUID" />
          <input name="recruitmentMissionId" placeholder="Mission UUID" />
          <input name="missionCandidateId" placeholder="Mission candidate UUID" />
          <button type="submit">Create task</button>
        </form>
      ) : null}
      {canViewNotifications ? (
        <section aria-label="Notifications">
          <h3>Notifications</h3>
          <form
            className="compact-form"
            aria-label="Filter notifications"
            onSubmit={(event) => void handleNotificationFilters(event)}
          >
            <select
              aria-label="Notification status"
              value={notificationStatusFilter}
              onChange={(event) => setNotificationStatusFilter(event.target.value)}
            >
              <option value="">Any status</option>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
            </select>
            <button type="submit">Filter notifications</button>
            <button type="button" onClick={() => void readAllNotifications()}>
              Mark visible read
            </button>
          </form>
          <p>{notificationTotal} visible notifications.</p>
          {notifications.length > 0 ? (
            <ul className="plain-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <strong>{notification.title}</strong>
                  <span>{notification.status}</span>
                  {notification.status === 'UNREAD' ? (
                    <button type="button" onClick={() => void readNotification(notification.id)}>
                      Mark read
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void archiveOneNotification(notification.id)}
                  >
                    Archive
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No notifications.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}

function notificationListStatus(status: string): 'UNREAD' | 'READ' | undefined {
  return status === 'UNREAD' || status === 'READ' ? status : undefined;
}

function AdminPanel({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadCatalog();
    void loadUsers();
  }, []);

  async function loadCatalog(): Promise<void> {
    const [roleList, permissionList] = await Promise.all([
      listAdminRoles(accessToken),
      listAdminPermissions(accessToken),
    ]);
    setRoles(roleList.roles);
    setPermissions(permissionList.permissions);
  }

  async function loadUsers(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listAdminUsers({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setUsers(response.users);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadUsers(search, statusFilter);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createAdminUser(accessToken, {
      displayName: formValue(formData, 'displayName'),
      email: formValue(formData, 'email'),
      initialPassword: formValue(formData, 'initialPassword'),
      locale: formValue(formData, 'locale', 'en'),
    });
    form.reset();
    setSelectedUser(created.user);
    setMessage('User created.');
    await loadUsers();
  }

  async function selectUser(userId: string): Promise<void> {
    const response = await getAdminUser(accessToken, userId);
    setSelectedUser(response.user);
    setMessage(null);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateAdminUser(accessToken, selectedUser.id, {
      displayName: formValue(formData, 'displayName', selectedUser.displayName),
      locale: formValue(formData, 'locale', selectedUser.locale),
    });
    setSelectedUser(updated.user);
    setMessage('User updated.');
    await loadUsers();
  }

  async function handleAssignRole(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const roleName = formValue(formData, 'roleName') as AdminRoleName;
    const updated = await assignAdminRole(accessToken, selectedUser.id, { roleName });
    setSelectedUser(updated.user);
    setMessage('Role assigned.');
    await loadUsers();
  }

  async function removeRole(roleName: string): Promise<void> {
    if (!selectedUser || !window.confirm(`Remove ${roleName} from this user?`)) {
      return;
    }
    const updated = await removeAdminRole(accessToken, selectedUser.id, roleName);
    setSelectedUser(updated.user);
    setMessage('Role removed.');
    await loadUsers();
  }

  async function changeStatus(status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'): Promise<void> {
    if (!selectedUser || !window.confirm(`Change this user status to ${status}?`)) {
      return;
    }
    const updated = await updateAdminUserStatus(accessToken, selectedUser.id, { status });
    setSelectedUser(updated.user);
    setMessage(`Status changed to ${status}.`);
    await loadUsers();
  }

  async function revokeOneSession(sessionId: string): Promise<void> {
    if (!selectedUser || !window.confirm('Revoke this selected refresh session?')) {
      return;
    }
    const response = await revokeAdminSession(accessToken, selectedUser.id, sessionId);
    setSelectedUser({ ...selectedUser, sessions: response.sessions });
    setMessage('Session revoked.');
  }

  async function revokeAllSessions(): Promise<void> {
    if (!selectedUser || !window.confirm('Revoke all active refresh sessions for this user?')) {
      return;
    }
    const response = await revokeAllAdminSessions(accessToken, selectedUser.id);
    setSelectedUser({ ...selectedUser, sessions: response.sessions, activeSessionCount: 0 });
    setMessage('All sessions revoked.');
    await loadUsers();
  }

  return (
    <section className="admin-panel" aria-label="Administration">
      <div className="admin-grid">
        <section aria-label="User administration">
          <h2>Administration</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                name="status"
              >
                <option value="">Any</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search users</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((adminUser) => (
                <tr key={adminUser.id}>
                  <td>
                    <button type="button" onClick={() => void selectUser(adminUser.id)}>
                      {adminUser.displayName}
                    </button>
                  </td>
                  <td>{adminUser.status}</td>
                  <td>{adminUser.roles.join(', ') || 'None'}</td>
                  <td>{adminUser.activeSessionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create internal user"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create internal user</h3>
            <input name="displayName" placeholder="Display name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="locale" placeholder="Locale" defaultValue="en" required />
            <input
              name="initialPassword"
              type="password"
              placeholder="Initial password"
              autoComplete="new-password"
              required
            />
            <button type="submit">Create user</button>
          </form>
        </section>

        <section aria-label="Selected user detail">
          {selectedUser ? (
            <>
              <h2>{selectedUser.displayName}</h2>
              <p>{selectedUser.email}</p>
              <p>Status: {selectedUser.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                <input
                  name="displayName"
                  aria-label="Display name"
                  defaultValue={selectedUser.displayName}
                />
                <input name="locale" aria-label="Locale" defaultValue={selectedUser.locale} />
                <button type="submit">Update profile</button>
              </form>

              <div className="action-row">
                <button type="button" onClick={() => void changeStatus('ACTIVE')}>
                  Reactivate
                </button>
                <button type="button" onClick={() => void changeStatus('SUSPENDED')}>
                  Suspend
                </button>
                <button type="button" onClick={() => void changeStatus('ARCHIVED')}>
                  Archive
                </button>
              </div>

              <form className="inline-form" onSubmit={(event) => void handleAssignRole(event)}>
                <label>
                  Role
                  <select name="roleName" required>
                    {roles.map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Assign role</button>
              </form>

              <ul>
                {selectedUser.roles.map((roleName) => (
                  <li key={roleName}>
                    {roleName}{' '}
                    <button type="button" onClick={() => void removeRole(roleName)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Active sessions</h3>
              <button type="button" onClick={() => void revokeAllSessions()}>
                Revoke all sessions
              </button>
              <ul>
                {selectedUser.sessions.map((session) => (
                  <li key={session.id}>
                    {session.createdAt}{' '}
                    <button type="button" onClick={() => void revokeOneSession(session.id)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Effective permissions</h3>
              <p>{selectedUser.effectivePermissions.join(', ') || 'None'}</p>
            </>
          ) : (
            <p>Select a user to inspect safe profile, roles, permissions, and sessions.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
        </section>
      </div>

      <section aria-label="Permission catalog">
        <h2>Permission catalog</h2>
        <p>{permissions.map((permission) => permission.code).join(', ')}</p>
      </section>
    </section>
  );
}

function ClientsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [contacts, setContacts] = useState<ClientContactSummary[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [selectedContact, setSelectedContact] = useState<ClientContactSummary | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSeeCommercial = permissions.includes('commercial_data:access');
  const canCreateClients = permissions.includes('clients:create');
  const canUpdateClients = permissions.includes('clients:update');
  const canManageClientStatus = permissions.includes('clients:status:manage');
  const canArchiveClients = permissions.includes('clients:archive');
  const canViewContacts = permissions.includes('client_contacts:view');
  const canCreateContacts = permissions.includes('client_contacts:create');
  const canUpdateContacts = permissions.includes('client_contacts:update');
  const canManageContactStatus = permissions.includes('client_contacts:status:manage');
  const canArchiveContacts = permissions.includes('client_contacts:archive');

  useEffect(() => {
    void loadClients();
  }, []);

  async function loadClients(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listClients({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setClients(response.clients);
  }

  async function loadContacts(clientId: string): Promise<void> {
    if (!canViewContacts) {
      setContacts([]);
      return;
    }

    const response = await listClientContacts({ accessToken, clientId, pageSize: 20 });
    setContacts(response.contacts);
  }

  async function handleClientSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadClients(search, statusFilter);
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createClient(accessToken, {
        name: formValue(formData, 'name'),
        industry: optionalFormValue(formData, 'industry'),
        website: optionalFormValue(formData, 'website'),
        mainPhone: optionalFormValue(formData, 'mainPhone'),
        country: optionalFormValue(formData, 'country'),
        city: optionalFormValue(formData, 'city'),
        ...(canSeeCommercial
          ? { commercialSummary: optionalFormValue(formData, 'commercialSummary') }
          : {}),
      });
      form.reset();
      setSelectedClient(created.client);
      setContacts([]);
      setMessage('Client created.');
      await loadClients();
      if (canViewContacts) {
        await loadContacts(created.client.id);
      }
    } catch {
      setError('Client could not be created.');
    }
  }

  async function selectClient(clientId: string): Promise<void> {
    setError(null);
    const [client] = await Promise.all([
      getClient(accessToken, clientId),
      canViewContacts ? loadContacts(clientId) : Promise.resolve(),
    ]);
    setSelectedClient(client.client);
    setSelectedContact(null);
    setMessage(null);
  }

  async function handleUpdateClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient) {
      return;
    }
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      const updated = await updateClient(accessToken, selectedClient.id, {
        name: formValue(formData, 'name', selectedClient.name),
        industry: nullableFormValue(formData, 'industry'),
        website: nullableFormValue(formData, 'website'),
        mainPhone: nullableFormValue(formData, 'mainPhone'),
        country: nullableFormValue(formData, 'country'),
        city: nullableFormValue(formData, 'city'),
        ...(canSeeCommercial
          ? { commercialSummary: nullableFormValue(formData, 'commercialSummary') }
          : {}),
      });
      setSelectedClient(updated.client);
      setMessage('Client updated.');
      await loadClients();
    } catch {
      setError('Client could not be updated.');
    }
  }

  async function changeClientStatus(status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (!selectedClient || !window.confirm(`Change this client status to ${status}?`)) {
      return;
    }
    const updated = await updateClientStatus(accessToken, selectedClient.id, { status });
    setSelectedClient(updated.client);
    setMessage(`Client status changed to ${status}.`);
    await loadClients();
  }

  async function archiveSelectedClient(): Promise<void> {
    if (!selectedClient || !window.confirm('Archive this client and its contacts?')) {
      return;
    }
    const archived = await archiveClient(accessToken, selectedClient.id);
    setSelectedClient(archived.client);
    setMessage('Client archived.');
    await loadClients();
    if (canViewContacts) {
      await loadContacts(archived.client.id);
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient || !canCreateContacts) {
      return;
    }
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createClientContact(accessToken, selectedClient.id, {
        displayName: formValue(formData, 'displayName'),
        email: formValue(formData, 'email'),
        phone: optionalFormValue(formData, 'phone'),
        roleTitle: optionalFormValue(formData, 'roleTitle'),
      });
      form.reset();
      setSelectedContact(created.contact);
      setMessage('Client contact created.');
      if (canViewContacts) {
        await loadContacts(selectedClient.id);
      }
    } catch {
      setError('Client contact could not be created.');
    }
  }

  async function handleUpdateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient || !selectedContact || !canUpdateContacts) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateClientContact(accessToken, selectedClient.id, selectedContact.id, {
      displayName: formValue(formData, 'displayName', selectedContact.displayName),
      email: formValue(formData, 'email', selectedContact.email),
      phone: nullableFormValue(formData, 'phone'),
      roleTitle: nullableFormValue(formData, 'roleTitle'),
    });
    setSelectedContact(updated.contact);
    setMessage('Client contact updated.');
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  async function changeContactStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (
      !selectedClient ||
      !selectedContact ||
      !canManageContactStatus ||
      !window.confirm(`Change this contact status to ${status}?`)
    ) {
      return;
    }
    const updated = await updateClientContactStatus(
      accessToken,
      selectedClient.id,
      selectedContact.id,
      { status },
    );
    setSelectedContact(updated.contact);
    setMessage(`Contact status changed to ${status}.`);
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  async function archiveSelectedContact(): Promise<void> {
    if (
      !selectedClient ||
      !selectedContact ||
      !canArchiveContacts ||
      !window.confirm('Archive this client contact?')
    ) {
      return;
    }
    const archived = await archiveClientContact(accessToken, selectedClient.id, selectedContact.id);
    setSelectedContact(archived.contact);
    setMessage('Client contact archived.');
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  return (
    <section className="admin-panel" aria-label="Clients">
      <div className="admin-grid">
        <section aria-label="Client list">
          <h2>Clients</h2>
          <form className="inline-form" onSubmit={(event) => void handleClientSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                name="status"
              >
                <option value="">Any</option>
                <option value="PROSPECT">Prospect</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search clients</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Industry</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <button type="button" onClick={() => void selectClient(client.id)}>
                      {client.name}
                    </button>
                  </td>
                  <td>{client.status}</td>
                  <td>{client.industry ?? 'None'}</td>
                  <td>{[client.city, client.country].filter(Boolean).join(', ') || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create client"
            onSubmit={(event) => void handleCreateClient(event)}
          >
            <h3>Create client</h3>
            <input name="name" placeholder="Client name" required />
            <input name="industry" placeholder="Industry" />
            <input name="website" placeholder="Website" />
            <input name="mainPhone" placeholder="Main phone" />
            <input name="country" placeholder="Country" />
            <input name="city" placeholder="City" />
            {canSeeCommercial ? (
              <textarea name="commercialSummary" placeholder="Commercial summary" />
            ) : null}
            <button type="submit" disabled={!canCreateClients}>
              Create client
            </button>
          </form>
        </section>

        <section aria-label="Client detail">
          {selectedClient ? (
            <>
              <h2>{selectedClient.name}</h2>
              <p>Status: {selectedClient.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdateClient(event)}>
                <input name="name" aria-label="Client name" defaultValue={selectedClient.name} />
                <input
                  name="industry"
                  aria-label="Industry"
                  defaultValue={selectedClient.industry ?? ''}
                />
                <input
                  name="website"
                  aria-label="Website"
                  defaultValue={selectedClient.website ?? ''}
                />
                <input
                  name="mainPhone"
                  aria-label="Main phone"
                  defaultValue={selectedClient.mainPhone ?? ''}
                />
                <input
                  name="country"
                  aria-label="Country"
                  defaultValue={selectedClient.country ?? ''}
                />
                <input name="city" aria-label="City" defaultValue={selectedClient.city ?? ''} />
                {canSeeCommercial ? (
                  <textarea
                    name="commercialSummary"
                    aria-label="Commercial summary"
                    defaultValue={selectedClient.commercial?.commercialSummary ?? ''}
                  />
                ) : null}
                <button
                  type="submit"
                  disabled={!canUpdateClients || selectedClient.status === 'ARCHIVED'}
                >
                  Update client
                </button>
              </form>

              <div className="action-row">
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('PROSPECT')}
                >
                  Prospect
                </button>
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('ACTIVE')}
                >
                  Active
                </button>
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('INACTIVE')}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  disabled={!canArchiveClients}
                  onClick={() => void archiveSelectedClient()}
                >
                  Archive client
                </button>
              </div>

              {canViewContacts ? (
                <>
                  <h3>Contacts</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td>
                            <button type="button" onClick={() => setSelectedContact(contact)}>
                              {contact.displayName}
                            </button>
                          </td>
                          <td>{contact.status}</td>
                          <td>{contact.roleTitle ?? 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {canCreateContacts ? (
                <form
                  className="stacked-form"
                  aria-label="Create client contact"
                  onSubmit={(event) => void handleCreateContact(event)}
                >
                  <h3>Create contact</h3>
                  <input name="displayName" placeholder="Contact name" required />
                  <input name="email" type="email" placeholder="Contact email" required />
                  <input name="phone" placeholder="Phone" />
                  <input name="roleTitle" placeholder="Role title" />
                  <button type="submit" disabled={selectedClient.status === 'ARCHIVED'}>
                    Create contact
                  </button>
                </form>
              ) : null}

              {selectedContact ? (
                <form
                  className="stacked-form"
                  aria-label="Selected client contact"
                  onSubmit={(event) => void handleUpdateContact(event)}
                >
                  <h3>{selectedContact.displayName}</h3>
                  <input
                    name="displayName"
                    aria-label="Contact name"
                    defaultValue={selectedContact.displayName}
                  />
                  <input
                    name="email"
                    type="email"
                    aria-label="Contact email"
                    defaultValue={selectedContact.email}
                  />
                  <input
                    name="phone"
                    aria-label="Contact phone"
                    defaultValue={selectedContact.phone ?? ''}
                  />
                  <input
                    name="roleTitle"
                    aria-label="Contact role title"
                    defaultValue={selectedContact.roleTitle ?? ''}
                  />
                  <button
                    type="submit"
                    disabled={!canUpdateContacts || selectedContact.status === 'ARCHIVED'}
                  >
                    Update contact
                  </button>
                  <div className="action-row">
                    <button
                      type="button"
                      disabled={!canManageContactStatus}
                      onClick={() => void changeContactStatus('ACTIVE')}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      disabled={!canManageContactStatus}
                      onClick={() => void changeContactStatus('INACTIVE')}
                    >
                      Inactive
                    </button>
                    <button
                      type="button"
                      disabled={!canArchiveContacts}
                      onClick={() => void archiveSelectedContact()}
                    >
                      Archive contact
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <p>Select a client to inspect its profile, lifecycle, and contacts.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

function CandidatesPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateDetail | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = permissions.includes('candidates:create');
  const canUpdate = permissions.includes('candidates:update');
  const canManageStatus = permissions.includes('candidates:status:manage');
  const canArchive = permissions.includes('candidates:archive');
  const canManageProfile = permissions.includes('candidate_profile:manage');
  const canSeeCompensation = permissions.includes('candidate_compensation:view');
  const canSeeConsent = permissions.includes('candidate_consent:view');

  useEffect(() => {
    void loadCandidates();
  }, []);

  async function loadCandidates(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listCandidates({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setCandidates(response.candidates);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadCandidates(search, statusFilter);
  }

  async function selectCandidate(candidateId: string): Promise<void> {
    const response = await getCandidate(accessToken, candidateId);
    setSelectedCandidate(response.candidate);
    setMessage(null);
    setError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createCandidate(accessToken, {
        displayName: formValue(formData, 'displayName'),
        email: optionalFormValue(formData, 'email'),
        phone: optionalFormValue(formData, 'phone'),
        city: optionalFormValue(formData, 'city'),
        country: optionalFormValue(formData, 'country'),
        currentJobTitle: optionalFormValue(formData, 'currentJobTitle'),
        source: optionalFormValue(formData, 'source'),
      });
      form.reset();
      setSelectedCandidate(created.candidate);
      setMessage('Candidate created.');
      await loadCandidates();
    } catch {
      setError('Candidate could not be created.');
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateCandidate(accessToken, selectedCandidate.id, {
      displayName: formValue(formData, 'displayName', selectedCandidate.displayName),
      email: nullableFormValue(formData, 'email'),
      phone: nullableFormValue(formData, 'phone'),
      city: nullableFormValue(formData, 'city'),
      country: nullableFormValue(formData, 'country'),
      currentJobTitle: nullableFormValue(formData, 'currentJobTitle'),
      professionalSummary: nullableFormValue(formData, 'professionalSummary'),
      source: nullableFormValue(formData, 'source'),
    });
    setSelectedCandidate(updated.candidate);
    setMessage('Candidate updated.');
    await loadCandidates();
  }

  async function changeStatus(status: 'ACTIVE' | 'INACTIVE' | 'TALENT_POOL'): Promise<void> {
    if (!selectedCandidate || !window.confirm(`Change this candidate status to ${status}?`)) {
      return;
    }
    const updated = await updateCandidateStatus(accessToken, selectedCandidate.id, { status });
    setSelectedCandidate(updated.candidate);
    setMessage(`Candidate status changed to ${status}.`);
    await loadCandidates();
  }

  async function archiveSelected(): Promise<void> {
    if (!selectedCandidate || !window.confirm('Archive this candidate profile?')) {
      return;
    }
    const archived = await archiveCandidate(accessToken, selectedCandidate.id);
    setSelectedCandidate(archived.candidate);
    setMessage('Candidate archived.');
    await loadCandidates();
  }

  async function handleAddSkill(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateSkill(accessToken, selectedCandidate.id, {
      name: formValue(formData, 'name'),
      level: optionalFormValue(formData, 'level'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Skill added.');
  }

  async function handleAddLanguage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateLanguage(accessToken, selectedCandidate.id, {
      language: formValue(formData, 'language'),
      proficiency: formValue(formData, 'proficiency'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Language added.');
  }

  async function handleAddExperience(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateWorkExperience(accessToken, selectedCandidate.id, {
      employer: formValue(formData, 'employer'),
      title: formValue(formData, 'title'),
      startDate: optionalFormValue(formData, 'startDate'),
      endDate: optionalFormValue(formData, 'endDate'),
      isCurrent: formData.get('isCurrent') === 'on',
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Experience added.');
  }

  async function handleAddEducation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateEducation(accessToken, selectedCandidate.id, {
      institution: formValue(formData, 'institution'),
      qualification: formValue(formData, 'qualification'),
      field: optionalFormValue(formData, 'field'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Education added.');
  }

  return (
    <section className="admin-panel" aria-label="Candidates">
      <div className="admin-grid">
        <section aria-label="Candidate list">
          <h2>Candidates</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                name="status"
              >
                <option value="">Any</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TALENT_POOL">Talent pool</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search candidates</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Title</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <button type="button" onClick={() => void selectCandidate(candidate.id)}>
                      {candidate.displayName}
                    </button>
                  </td>
                  <td>{candidate.status}</td>
                  <td>{candidate.currentJobTitle ?? 'None'}</td>
                  <td>
                    {[candidate.city, candidate.country].filter(Boolean).join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create candidate"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create candidate</h3>
            <input name="displayName" placeholder="Candidate name" required />
            <input name="email" type="email" placeholder="Candidate email" />
            <input name="phone" placeholder="Phone" />
            <input name="currentJobTitle" placeholder="Current job title" />
            <input name="city" placeholder="City" />
            <input name="country" placeholder="Country" />
            <input name="source" placeholder="Source" />
            <button type="submit" disabled={!canCreate}>
              Create candidate
            </button>
          </form>
        </section>

        <section aria-label="Candidate detail">
          {selectedCandidate ? (
            <>
              <h2>{selectedCandidate.displayName}</h2>
              <p>Status: {selectedCandidate.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                <input
                  name="displayName"
                  aria-label="Candidate name"
                  defaultValue={selectedCandidate.displayName}
                />
                <input
                  name="email"
                  type="email"
                  aria-label="Candidate email"
                  defaultValue={selectedCandidate.email ?? ''}
                />
                <input
                  name="phone"
                  aria-label="Candidate phone"
                  defaultValue={selectedCandidate.phone ?? ''}
                />
                <input
                  name="currentJobTitle"
                  aria-label="Current job title"
                  defaultValue={selectedCandidate.currentJobTitle ?? ''}
                />
                <input name="city" aria-label="City" defaultValue={selectedCandidate.city ?? ''} />
                <input
                  name="country"
                  aria-label="Country"
                  defaultValue={selectedCandidate.country ?? ''}
                />
                <input
                  name="source"
                  aria-label="Source"
                  defaultValue={selectedCandidate.source ?? ''}
                />
                <textarea
                  name="professionalSummary"
                  aria-label="Professional summary"
                  defaultValue={selectedCandidate.professionalSummary ?? ''}
                />
                <button
                  type="submit"
                  disabled={!canUpdate || selectedCandidate.status === 'ARCHIVED'}
                >
                  Update candidate
                </button>
              </form>

              <div className="action-row">
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('ACTIVE')}
                >
                  Active
                </button>
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('INACTIVE')}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('TALENT_POOL')}
                >
                  Talent pool
                </button>
                <button type="button" disabled={!canArchive} onClick={() => void archiveSelected()}>
                  Archive candidate
                </button>
              </div>

              {canSeeCompensation ? (
                <p>
                  Compensation:{' '}
                  {selectedCandidate.compensation?.salaryExpectationCents
                    ? `${selectedCandidate.compensation.salaryExpectationCents} ${selectedCandidate.compensation.salaryExpectationCurrency ?? ''}`
                    : 'None'}
                </p>
              ) : null}
              {canSeeConsent ? (
                <p>Consent: {selectedCandidate.consent?.consentStatus ?? 'Hidden'}</p>
              ) : null}

              <h3>Skills</h3>
              <p>{selectedCandidate.skills.map((skill) => skill.name).join(', ') || 'None'}</p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddSkill(event)}>
                  <input name="name" placeholder="Skill" required />
                  <input name="level" placeholder="Level" />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add skill
                  </button>
                </form>
              ) : null}

              <h3>Languages</h3>
              <p>
                {selectedCandidate.languages
                  .map((language) => `${language.language} ${language.proficiency}`)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddLanguage(event)}>
                  <input name="language" placeholder="Language" required />
                  <input name="proficiency" placeholder="Proficiency" required />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add language
                  </button>
                </form>
              ) : null}

              <h3>Experience</h3>
              <p>
                {selectedCandidate.workExperiences
                  .map((experience) => `${experience.title} at ${experience.employer}`)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddExperience(event)}>
                  <input name="employer" placeholder="Employer" required />
                  <input name="title" placeholder="Title" required />
                  <input name="startDate" placeholder="Start date" />
                  <input name="endDate" placeholder="End date" />
                  <label>
                    Current
                    <input name="isCurrent" type="checkbox" />
                  </label>
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add experience
                  </button>
                </form>
              ) : null}

              <h3>Education</h3>
              <p>
                {selectedCandidate.education
                  .map((education) => education.qualification)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddEducation(event)}>
                  <input name="institution" placeholder="Institution" required />
                  <input name="qualification" placeholder="Qualification" required />
                  <input name="field" placeholder="Field" />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add education
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <p>Select a candidate to inspect profile, lifecycle, and structured data.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

function MissionsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [assignments, setAssignments] = useState<MissionAssignmentSummary[]>([]);
  const [candidateProcesses, setCandidateProcesses] = useState<MissionCandidateSummary[]>([]);
  const [offersByProcessId, setOffersByProcessId] = useState<Record<string, OfferAggregate | null>>(
    {},
  );
  const [placementsByProcessId, setPlacementsByProcessId] = useState<
    Record<string, MissionPlacement | null>
  >({});
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<CandidateEvaluation[]>([]);
  const [publicOpportunity, setPublicOpportunity] = useState<InternalPublicOpportunity | null>(
    null,
  );
  const [publicApplications, setPublicApplications] = useState<InternalPublicApplicationSummary[]>(
    [],
  );
  const [selectedMission, setSelectedMission] = useState<MissionSummary | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const canCreate = permissions.includes('missions:create');
  const canUpdate = permissions.includes('missions:update');
  const canManageStatus = permissions.includes('missions:status:manage');
  const canClose = permissions.includes('missions:closure:manage');
  const canArchive = permissions.includes('missions:archive');
  const canViewAssignments = permissions.includes('mission_assignments:view');
  const canManageAssignments = permissions.includes('mission_assignments:manage');
  const canViewProcesses = permissions.includes('mission_candidates:view');
  const canCreateProcesses = permissions.includes('mission_candidates:create');
  const canTransitionProcesses = permissions.includes('mission_candidates:transition');
  const canTransferProcesses = permissions.includes('mission_candidates:transfer');
  const canPresentProcesses = permissions.includes('mission_candidates:present');
  const canViewInterviews = permissions.includes('interviews:view');
  const canScheduleInterviews = permissions.includes('interviews:schedule');
  const canRescheduleInterviews = permissions.includes('interviews:reschedule');
  const canCompleteInterviews = permissions.includes('interviews:complete');
  const canCancelInterviews = permissions.includes('interviews:cancel');
  const canArchiveInterviews = permissions.includes('interviews:archive');
  const canViewEvaluations = permissions.includes('evaluations:view');
  const canCreateEvaluations = permissions.includes('evaluations:create');
  const canFinalizeEvaluations = permissions.includes('evaluations:finalize');
  const canViewPublicOpportunity = permissions.includes('public_opportunities:view');
  const canManagePublicOpportunity = permissions.includes('public_opportunities:manage');
  const canPublishPublicOpportunity = permissions.includes('public_opportunities:publish');
  const canViewPublicApplications = permissions.includes('public_applications:view');
  const canViewOffers = permissions.includes('offers:view');
  const canCreateOffers = permissions.includes('offers:create');
  const canUpdateOffers = permissions.includes('offers:update');
  const canSendOffers = permissions.includes('offers:send_or_mark_sent');
  const canRecordOfferResponses = permissions.includes('offers:record_response');
  const canWithdrawOffers = permissions.includes('offers:withdraw');
  const canViewPlacements = permissions.includes('placements:view');
  const canConfirmPlacements = permissions.includes('placements:confirm');
  const canCorrectPlacements = permissions.includes('placements:correct');
  const canViewPlacementCommercialEligibility = permissions.includes(
    'placement_commercial_eligibility:view',
  );

  useEffect(() => {
    void loadMissions();
  }, []);

  async function loadMissions(nextSearch = search, nextState = stateFilter): Promise<void> {
    const response = await listMissions({
      accessToken,
      search: nextSearch || undefined,
      state: nextState || undefined,
      pageSize: 20,
    });
    setMissions(response.missions);
  }

  async function selectMission(missionId: string): Promise<void> {
    const response = await getMission(accessToken, missionId);
    setSelectedMission(response.mission);
    setMessage(null);
    setActiveProcessId(null);
    setInterviews([]);
    setActiveInterviewId(null);
    setEvaluations([]);
    setPublicOpportunity(null);
    setPublicApplications([]);
    setOffersByProcessId({});
    setPlacementsByProcessId({});
    if (canViewAssignments) {
      const assignmentResponse = await listMissionAssignments(accessToken, missionId);
      setAssignments(assignmentResponse.assignments);
    }
    if (canViewProcesses) {
      const processResponse = await listMissionCandidates(accessToken, missionId);
      setCandidateProcesses(processResponse.candidates);
    }
    if (canViewPublicOpportunity) {
      const opportunityResponse = await getInternalPublicOpportunity(accessToken, missionId);
      setPublicOpportunity(opportunityResponse.publicOpportunity);
    }
    if (canViewPublicApplications) {
      const applicationResponse = await listInternalPublicApplications(accessToken, missionId);
      setPublicApplications(applicationResponse.applications);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadMissions(search, stateFilter);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createMission(accessToken, {
      clientId: formValue(formData, 'clientId'),
      title: formValue(formData, 'title'),
      description: optionalFormValue(formData, 'description'),
      requirements: optionalFormValue(formData, 'requirements'),
      priority: formValue(formData, 'priority', 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      numberOfPositions: Number(formValue(formData, 'numberOfPositions', '1')),
      location: optionalFormValue(formData, 'location'),
      workArrangement: optionalFormValue(formData, 'workArrangement'),
      engagementType: optionalFormValue(formData, 'engagementType'),
    });
    form.reset();
    setSelectedMission(created.mission);
    setMessage('Mission created.');
    await loadMissions();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateMission(accessToken, selectedMission.id, {
      title: formValue(formData, 'title', selectedMission.title),
      priority: formValue(formData, 'priority', selectedMission.priority) as
        'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      numberOfPositions: Number(
        formValue(formData, 'numberOfPositions', String(selectedMission.numberOfPositions)),
      ),
      location: nullableFormValue(formData, 'location'),
      workArrangement: nullableFormValue(formData, 'workArrangement'),
      engagementType: nullableFormValue(formData, 'engagementType'),
    });
    setSelectedMission(updated.mission);
    setMessage('Mission updated.');
    await loadMissions();
  }

  async function changeState(state: MissionLifecycleState): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const updated = await updateMissionStatus(accessToken, selectedMission.id, { state });
    setSelectedMission(updated.mission);
    setMessage(`Mission moved to ${state}.`);
    await loadMissions();
  }

  async function closeSelectedMission(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await closeMission(accessToken, selectedMission.id, {
      state: formValue(formData, 'state') as
        | 'CLOSED_WITH_RECRUITMENT'
        | 'CLOSED_WITHOUT_RECRUITMENT'
        | 'CANCELED'
        | 'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
      closureReason: formValue(formData, 'closureReason') as
        | 'CLIENT_CLOSED_OR_CANCELED'
        | 'CLOSED_WITHOUT_RECRUITMENT'
        | 'DEADLINE_EXPIRED_WITHOUT_RENEWAL'
        | 'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED',
      filledPlacementCount: Number(
        formValue(formData, 'filledPlacementCount', String(selectedMission.filledPlacementCount)),
      ),
    });
    setSelectedMission(updated.mission);
    setMessage('Mission closed.');
    await loadMissions();
  }

  async function archiveSelectedMission(): Promise<void> {
    if (!selectedMission || !window.confirm('Archive this recruitment mission?')) {
      return;
    }
    const archived = await archiveMission(accessToken, selectedMission.id);
    setSelectedMission(archived.mission);
    setAssignments([]);
    setCandidateProcesses([]);
    setMessage('Mission archived.');
    await loadMissions();
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const isLead = formData.get('isLead') === 'on';
    await createMissionAssignment(accessToken, selectedMission.id, {
      userId: formValue(formData, 'userId'),
      role: isLead
        ? 'LEAD_RECRUITER'
        : (formValue(formData, 'role', 'RECRUITER') as 'RECRUITER' | 'SOURCER' | 'CONTRIBUTOR'),
      isLead,
    });
    form.reset();
    await selectMission(selectedMission.id);
    setMessage('Assignment created.');
  }

  async function makeLead(assignmentId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await setMissionLeadRecruiter(accessToken, selectedMission.id, { assignmentId });
    await selectMission(selectedMission.id);
    setMessage('Lead recruiter changed.');
  }

  async function deactivateAssignment(assignmentId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await updateMissionAssignment(accessToken, selectedMission.id, assignmentId, {
      status: 'INACTIVE',
    });
    await selectMission(selectedMission.id);
    setMessage('Assignment deactivated.');
  }

  async function archiveSelectedAssignment(assignmentId: string): Promise<void> {
    if (!selectedMission || !window.confirm('Archive this mission assignment?')) {
      return;
    }
    await archiveMissionAssignment(accessToken, selectedMission.id, assignmentId);
    await selectMission(selectedMission.id);
    setMessage('Assignment archived.');
  }

  async function handleCreateProcess(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createMissionCandidate(accessToken, selectedMission.id, {
      candidateId: formValue(formData, 'candidateId'),
      responsibleRecruiterUserId: formValue(formData, 'responsibleRecruiterUserId'),
      source: optionalFormValue(formData, 'source'),
      sourceContext: optionalFormValue(formData, 'sourceContext'),
      priority: formValue(formData, 'priority', 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      internalNotes: optionalFormValue(formData, 'internalNotes'),
    });
    form.reset();
    await selectMission(selectedMission.id);
    setMessage('Candidate linked to mission.');
  }

  async function moveProcess(
    processId: string,
    currentState: MissionCandidateState,
    nextState: MissionCandidateState,
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await transitionMissionCandidate(accessToken, selectedMission.id, processId, {
      state: nextState,
      reason: 'Updated from the protected mission workspace.',
      skip: isOptionalProcessSkip(currentState, nextState),
    });
    await selectMission(selectedMission.id);
    setMessage(`Candidate process moved to ${nextState}.`);
  }

  async function transferProcess(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    await transferMissionCandidate(accessToken, selectedMission.id, processId, {
      responsibleRecruiterUserId: formValue(formData, 'responsibleRecruiterUserId'),
      reason: formValue(formData, 'reason'),
    });
    await selectMission(selectedMission.id);
    setMessage('Responsible recruiter transferred.');
  }

  async function presentProcess(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await presentMissionCandidate(accessToken, selectedMission.id, processId, {
      reason: 'Explicit client presentation approved.',
    });
    await selectMission(selectedMission.id);
    setMessage('Candidate presented to client.');
  }

  async function loadOfferPlacement(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    if (canViewOffers) {
      const offerResponse = await getMissionCandidateOffers(
        accessToken,
        selectedMission.id,
        processId,
      );
      setOffersByProcessId((current) => ({ ...current, [processId]: offerResponse.offer }));
    }
    if (canViewPlacements) {
      const placementResponse = await getMissionCandidatePlacement(
        accessToken,
        selectedMission.id,
        processId,
      );
      setPlacementsByProcessId((current) => ({
        ...current,
        [processId]: placementResponse.placement,
      }));
    }
    setMessage('Offer and placement details loaded.');
  }

  async function handleCreateOffer(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission || !canCreateOffers) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await createMissionCandidateOffer(accessToken, selectedMission.id, processId, {
      offeredSalaryAmountCents: optionalNumber(formData, 'offeredSalaryAmountCents'),
      offeredSalaryCurrency: optionalFormValue(formData, 'offeredSalaryCurrency'),
      contractType: optionalFormValue(formData, 'contractType'),
      proposedStartDate: optionalDateTimeFormValue(formData, 'proposedStartDate') ?? undefined,
      probationPeriod: optionalFormValue(formData, 'probationPeriod'),
      clientFacingRemarks: optionalFormValue(formData, 'clientFacingRemarks'),
      internalRecruiterRemarks: optionalFormValue(formData, 'internalRecruiterRemarks'),
    });
    form.reset();
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer draft created.');
  }

  async function reviseOffer(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canUpdateOffers) {
      return;
    }
    const currentVersion = offer.versions.find((version) => version.id === offer.currentVersionId);
    const response = await reviseMissionCandidateOffer(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        reason: 'Offer revised from the protected mission workspace.',
        offeredSalaryAmountCents: currentVersion?.offeredSalaryAmountCents ?? undefined,
        offeredSalaryCurrency: currentVersion?.offeredSalaryCurrency ?? undefined,
        contractType: currentVersion?.contractType ?? undefined,
        clientFacingRemarks: currentVersion?.clientFacingRemarks ?? undefined,
        internalRecruiterRemarks: currentVersion?.internalRecruiterRemarks ?? undefined,
      },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer revised into a new version.');
  }

  async function markOfferSent(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canSendOffers) {
      return;
    }
    const response = await markMissionCandidateOfferSent(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      { reason: 'Offer sent by staff.' },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer marked as sent.');
  }

  async function recordOfferResponse(
    processId: string,
    offer: OfferAggregate,
    status: 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED',
  ): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canRecordOfferResponses) {
      return;
    }
    const response = await recordMissionCandidateOfferResponse(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        status,
        reason:
          status === 'REJECTED'
            ? 'Candidate rejected the offer.'
            : `Offer response recorded as ${status}.`,
      },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage(`Offer response recorded as ${status}.`);
  }

  async function withdrawOffer(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canWithdrawOffers) {
      return;
    }
    const response = await withdrawMissionCandidateOffer(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      { reason: 'Offer withdrawn by staff.' },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer withdrawn.');
  }

  async function confirmPlacement(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canConfirmPlacements) {
      return;
    }
    const response = await confirmMissionCandidatePlacement(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        integrationStartDate: new Date().toISOString(),
        eligibleForInvoicing: false,
        operationalNote: 'Placement confirmed from the protected mission workspace.',
      },
    );
    await selectMission(selectedMission.id);
    setPlacementsByProcessId((current) => ({ ...current, [processId]: response.placement }));
    await loadMissions();
    setMessage('Placement confirmed from accepted offer.');
  }

  async function correctPlacement(processId: string): Promise<void> {
    if (!selectedMission || !canCorrectPlacements) {
      return;
    }
    const response = await correctMissionCandidatePlacement(
      accessToken,
      selectedMission.id,
      processId,
      {
        reason: 'ADMINISTRATIVE_ERROR',
        comment: 'Placement corrected from the protected mission workspace.',
      },
    );
    await selectMission(selectedMission.id);
    setPlacementsByProcessId((current) => ({ ...current, [processId]: response.placement }));
    await loadMissions();
    setMessage('Placement correction recorded.');
  }

  async function loadProcessInterviews(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const response = await listInterviews(accessToken, selectedMission.id, processId);
    setActiveProcessId(processId);
    setInterviews(response.interviews);
    setActiveInterviewId(null);
    setEvaluations([]);
    setMessage('Interviews loaded.');
  }

  async function handleScheduleInterview(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await scheduleInterview(accessToken, selectedMission.id, processId, {
      type: formValue(formData, 'type') as
        'HR' | 'TECHNICAL' | 'INTERNAL_VALIDATION' | 'CLIENT_INTERVIEW_1' | 'CLIENT_INTERVIEW_2',
      scheduledStartAt: dateTimeFormValue(formData, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(formData, 'scheduledEndAt'),
      timezone: formValue(formData, 'timezone', 'UTC'),
      format: formValue(formData, 'format', 'VIDEO') as 'ONSITE' | 'PHONE' | 'VIDEO' | 'OTHER',
      location: optionalFormValue(formData, 'location'),
      meetingUrl: optionalFormValue(formData, 'meetingUrl'),
      organizerUserId: formValue(formData, 'organizerUserId'),
      internalUserParticipantIds: csvValues(formData, 'internalUserParticipantIds'),
      clientContactParticipantIds: csvValues(formData, 'clientContactParticipantIds'),
      externalParticipants: [],
    });
    form.reset();
    await loadProcessInterviews(processId);
    setMessage('Interview scheduled.');
  }

  async function updateInterviewStatus(
    processId: string,
    interviewId: string,
    action: 'postpone' | 'complete' | 'cancel' | 'archive',
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    if (action === 'postpone') {
      await postponeInterview(accessToken, selectedMission.id, processId, interviewId, {
        reason: 'Updated from the protected mission workspace.',
      });
    } else if (action === 'complete') {
      await completeInterview(accessToken, selectedMission.id, processId, interviewId, {
        outcome: 'Completed from the protected mission workspace.',
      });
    } else if (action === 'cancel') {
      await cancelInterview(accessToken, selectedMission.id, processId, interviewId, {
        reason: 'Canceled from the protected mission workspace.',
      });
    } else {
      await archiveInterview(accessToken, selectedMission.id, processId, interviewId);
    }
    await loadProcessInterviews(processId);
    setMessage(`Interview ${action} action completed.`);
  }

  async function handleRescheduleInterview(
    event: FormEvent<HTMLFormElement>,
    processId: string,
    interviewId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    await rescheduleInterview(accessToken, selectedMission.id, processId, interviewId, {
      scheduledStartAt: dateTimeFormValue(formData, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(formData, 'scheduledEndAt'),
      timezone: formValue(formData, 'timezone', 'UTC'),
      reason: formValue(formData, 'reason'),
    });
    await loadProcessInterviews(processId);
    setMessage('Interview rescheduled.');
  }

  async function loadInterviewEvaluations(processId: string, interviewId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const response = await listEvaluations(accessToken, selectedMission.id, processId, interviewId);
    setActiveProcessId(processId);
    setActiveInterviewId(interviewId);
    setEvaluations(response.evaluations);
    setMessage('Evaluations loaded.');
  }

  async function handleCreateEvaluation(
    event: FormEvent<HTMLFormElement>,
    processId: string,
    interviewId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createEvaluation(accessToken, selectedMission.id, processId, interviewId, {
      evaluationType: formValue(formData, 'evaluationType', 'INTERNAL_HR') as
        'INTERNAL_HR' | 'INTERNAL_TECHNICAL' | 'CLIENT',
      overallScore: optionalNumber(formData, 'overallScore'),
      communicationScore: optionalNumber(formData, 'communicationScore'),
      technicalScore: optionalNumber(formData, 'technicalScore'),
      roleFitScore: optionalNumber(formData, 'roleFitScore'),
      cultureFitScore: optionalNumber(formData, 'cultureFitScore'),
      motivationScore: optionalNumber(formData, 'motivationScore'),
      salaryAlignmentScore: optionalNumber(formData, 'salaryAlignmentScore'),
      recommendation: formValue(formData, 'recommendation', 'NEUTRAL') as
        'STRONG_YES' | 'YES' | 'NEUTRAL' | 'NO' | 'STRONG_NO',
      strengths: optionalFormValue(formData, 'strengths'),
      weaknesses: optionalFormValue(formData, 'weaknesses'),
      risks: optionalFormValue(formData, 'risks'),
      comment: optionalFormValue(formData, 'comment'),
      finalOpinion: formData.get('finalOpinion') === 'on',
      clientVisible: false,
    });
    form.reset();
    await loadInterviewEvaluations(processId, interviewId);
    await loadProcessInterviews(processId);
    setMessage('Evaluation saved.');
  }

  async function finalizeSelectedEvaluation(
    processId: string,
    interviewId: string,
    evaluationId: string,
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await finalizeEvaluation(accessToken, selectedMission.id, processId, interviewId, evaluationId);
    await loadInterviewEvaluations(processId, interviewId);
    setMessage('Evaluation finalized.');
  }

  async function handlePublicOpportunityUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission || !publicOpportunity || !canManagePublicOpportunity) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateInternalPublicOpportunity(accessToken, selectedMission.id, {
      publicTitle: formValue(formData, 'publicTitle', publicOpportunity.publicTitle),
      publicSummary: nullableFormValue(formData, 'publicSummary'),
      publicDescription: nullableFormValue(formData, 'publicDescription'),
      publicLocation: nullableFormValue(formData, 'publicLocation'),
      publicWorkArrangement: nullableFormValue(formData, 'publicWorkArrangement'),
      publicEngagementType: nullableFormValue(formData, 'publicEngagementType'),
      publicExperienceLevel: nullableFormValue(formData, 'publicExperienceLevel'),
      publicSkills: nullableFormValue(formData, 'publicSkills'),
      publicationStartsAt: optionalDateTimeFormValue(formData, 'publicationStartsAt') ?? null,
      applicationDeadline: optionalDateTimeFormValue(formData, 'applicationDeadline') ?? null,
      showClientName: formData.get('showClientName') === 'on',
      showSalary: formData.get('showSalary') === 'on',
      cvRequired: formData.get('cvRequired') === 'on',
      certificationsEnabled: formData.get('certificationsEnabled') === 'on',
      certificationsRequired: formData.get('certificationsRequired') === 'on',
      diplomasEnabled: formData.get('diplomasEnabled') === 'on',
      diplomasRequired: formData.get('diplomasRequired') === 'on',
      additionalAttachmentsEnabled: formData.get('additionalAttachmentsEnabled') === 'on',
    });
    setPublicOpportunity(updated.publicOpportunity);
    setMessage('Public opportunity configuration saved.');
  }

  async function updatePublicOpportunityPublication(
    input: Parameters<typeof updateInternalPublicOpportunity>[2],
    successMessage: string,
  ): Promise<void> {
    if (!selectedMission || !publicOpportunity || !canPublishPublicOpportunity) {
      return;
    }
    const updated = await updateInternalPublicOpportunity(accessToken, selectedMission.id, input);
    setPublicOpportunity(updated.publicOpportunity);
    setMessage(successMessage);
  }

  async function copyPublicOpportunityLink(): Promise<void> {
    if (!publicOpportunity) {
      return;
    }
    const publicUrl = `${window.location.origin}/opportunities/${publicOpportunity.publicSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Public link copied.');
    } catch {
      setMessage('Public link could not be copied.');
    }
  }

  return (
    <section className="admin-panel" aria-label="Missions">
      <div className="admin-grid">
        <section aria-label="Recruitment mission list">
          <h2>Missions</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              State
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.currentTarget.value)}
                name="state"
              >
                <option value="">Any</option>
                {missionStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Search missions</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Client</th>
                <th>State</th>
                <th>Positions</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.id}>
                  <td>
                    <button type="button" onClick={() => void selectMission(mission.id)}>
                      {mission.title}
                    </button>
                  </td>
                  <td>{mission.clientName}</td>
                  <td>{mission.state}</td>
                  <td>
                    {mission.filledPlacementCount}/{mission.numberOfPositions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {canCreate ? (
            <form
              className="stacked-form"
              aria-label="Create recruitment mission"
              onSubmit={(event) => void handleCreate(event)}
            >
              <h3>Create mission</h3>
              <input name="clientId" placeholder="Client id" required />
              <input name="title" placeholder="Title" required />
              <textarea name="description" placeholder="Description" />
              <textarea name="requirements" placeholder="Requirements" />
              <select name="priority" defaultValue="NORMAL">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <input name="numberOfPositions" type="number" min="1" defaultValue="1" />
              <input name="location" placeholder="Location" />
              <input name="workArrangement" placeholder="Work arrangement" />
              <input name="engagementType" placeholder="Engagement type" />
              <button type="submit">Create mission</button>
            </form>
          ) : null}
        </section>

        <section aria-label="Selected mission detail">
          {selectedMission ? (
            <>
              <h2>{selectedMission.title}</h2>
              <p>{selectedMission.clientName}</p>
              <p>
                {selectedMission.state} - {selectedMission.priority} -{' '}
                {selectedMission.filledPlacementCount}/{selectedMission.numberOfPositions}
              </p>
              {selectedMission.commercial ? <p>Commercial fields visible.</p> : null}
              {canUpdate ? (
                <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                  <input name="title" defaultValue={selectedMission.title} />
                  <select name="priority" defaultValue={selectedMission.priority}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <input
                    name="numberOfPositions"
                    type="number"
                    min="1"
                    defaultValue={selectedMission.numberOfPositions}
                  />
                  <input name="location" defaultValue={selectedMission.location ?? ''} />
                  <input
                    name="workArrangement"
                    defaultValue={selectedMission.workArrangement ?? ''}
                  />
                  <input
                    name="engagementType"
                    defaultValue={selectedMission.engagementType ?? ''}
                  />
                  <button type="submit">Update mission</button>
                </form>
              ) : null}

              {canManageStatus ? (
                <div className="action-row" aria-label="Mission lifecycle actions">
                  {nextMissionStates(selectedMission.state).map((state) => (
                    <button key={state} type="button" onClick={() => void changeState(state)}>
                      {state}
                    </button>
                  ))}
                </div>
              ) : null}

              {canClose ? (
                <form
                  className="stacked-form"
                  onSubmit={(event) => void closeSelectedMission(event)}
                >
                  <h3>Close mission</h3>
                  <select name="state" defaultValue="CLOSED_WITHOUT_RECRUITMENT">
                    <option value="CLOSED_WITH_RECRUITMENT">Closed with recruitment</option>
                    <option value="CLOSED_WITHOUT_RECRUITMENT">Closed without recruitment</option>
                    <option value="CANCELED">Canceled</option>
                    <option value="DEADLINE_EXPIRED_WITHOUT_RENEWAL">Deadline expired</option>
                  </select>
                  <select name="closureReason" defaultValue="CLOSED_WITHOUT_RECRUITMENT">
                    <option value="POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED">
                      Positions filled
                    </option>
                    <option value="CLOSED_WITHOUT_RECRUITMENT">No recruitment</option>
                    <option value="CLIENT_CLOSED_OR_CANCELED">Client canceled</option>
                    <option value="DEADLINE_EXPIRED_WITHOUT_RENEWAL">Deadline expired</option>
                  </select>
                  <input
                    name="filledPlacementCount"
                    type="number"
                    min="0"
                    defaultValue={selectedMission.filledPlacementCount}
                  />
                  <button type="submit">Close mission</button>
                </form>
              ) : null}

              {canArchive ? (
                <button type="button" onClick={() => void archiveSelectedMission()}>
                  Archive mission
                </button>
              ) : null}

              {canViewPublicOpportunity && publicOpportunity ? (
                <section aria-label="Public opportunity controls">
                  <h3>Public opportunity</h3>
                  <p>
                    {publicOpportunity.status} -{' '}
                    {publicOpportunity.applicationLinkEnabled
                      ? 'application link enabled'
                      : 'application link disabled'}{' '}
                    - {publicOpportunity.listedOnWebsite ? 'listed' : 'unlisted'}
                  </p>
                  <p>
                    Public link:{' '}
                    <a href={`/opportunities/${publicOpportunity.publicSlug}`}>
                      {`${window.location.origin}/opportunities/${publicOpportunity.publicSlug}`}
                    </a>
                  </p>
                  <div className="action-row">
                    <a
                      className="button-link"
                      href={`/opportunities/${publicOpportunity.publicSlug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open public preview
                    </a>
                    <button type="button" onClick={() => void copyPublicOpportunityLink()}>
                      Copy public link
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          {
                            status: 'OPEN',
                            applicationLinkEnabled: true,
                          },
                          'Application link enabled.',
                        )
                      }
                    >
                      Enable applications
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { applicationLinkEnabled: false },
                          'Application link disabled.',
                        )
                      }
                    >
                      Disable applications
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { listedOnWebsite: true },
                          'Opportunity listed on website.',
                        )
                      }
                    >
                      List on website
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { listedOnWebsite: false },
                          'Opportunity unlisted from website.',
                        )
                      }
                    >
                      Unlist from website
                    </button>
                  </div>
                  <form
                    className="stacked-form"
                    aria-label="Edit public opportunity"
                    onSubmit={(event) => void handlePublicOpportunityUpdate(event)}
                  >
                    <input
                      name="publicTitle"
                      defaultValue={publicOpportunity.publicTitle}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicSummary"
                      placeholder="Public summary"
                      defaultValue={publicOpportunity.publicSummary ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicDescription"
                      placeholder="Public description"
                      defaultValue={publicOpportunity.publicDescription ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicLocation"
                      placeholder="Public location"
                      defaultValue={publicOpportunity.publicLocation ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicWorkArrangement"
                      placeholder="Work arrangement"
                      defaultValue={publicOpportunity.publicWorkArrangement ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicEngagementType"
                      placeholder="Contract type"
                      defaultValue={publicOpportunity.publicEngagementType ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicExperienceLevel"
                      placeholder="Experience level"
                      defaultValue={publicOpportunity.publicExperienceLevel ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicSkills"
                      placeholder="Public skills"
                      defaultValue={publicOpportunity.publicSkills ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <label>
                      Publication start
                      <input
                        name="publicationStartsAt"
                        type="datetime-local"
                        defaultValue={dateTimeInputValue(publicOpportunity.publicationStartsAt)}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Application deadline
                      <input
                        name="applicationDeadline"
                        type="datetime-local"
                        defaultValue={dateTimeInputValue(publicOpportunity.applicationDeadline)}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Show client name
                      <input
                        name="showClientName"
                        type="checkbox"
                        defaultChecked={publicOpportunity.showClientName}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Show salary
                      <input
                        name="showSalary"
                        type="checkbox"
                        defaultChecked={publicOpportunity.showSalary}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      CV required
                      <input
                        name="cvRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.cvRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Certifications enabled
                      <input
                        name="certificationsEnabled"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.certificationsEnabled}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Certifications required
                      <input
                        name="certificationsRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.certificationsRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Diplomas enabled
                      <input
                        name="diplomasEnabled"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.diplomasEnabled}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Diplomas required
                      <input
                        name="diplomasRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.diplomasRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Additional files enabled
                      <input
                        name="additionalAttachmentsEnabled"
                        type="checkbox"
                        defaultChecked={
                          publicOpportunity.uploadRequirements.additionalAttachmentsEnabled
                        }
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <button type="submit" disabled={!canManagePublicOpportunity}>
                      Save public opportunity
                    </button>
                  </form>
                </section>
              ) : null}

              {canViewPublicApplications ? (
                <section aria-label="Public applications">
                  <h3>Public applications</h3>
                  {publicApplications.length > 0 ? (
                    <ul>
                      {publicApplications.map((application) => (
                        <li key={application.id}>
                          {application.submittedFullName} - {application.submittedEmail} -{' '}
                          {application.fileCount} files -{' '}
                          {new Date(application.submittedAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No public applications submitted for this mission.</p>
                  )}
                </section>
              ) : null}

              {canViewAssignments ? (
                <>
                  <h3>Assignments</h3>
                  <ul>
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        {assignment.userDisplayName} - {assignment.role} - {assignment.status}
                        {assignment.isLead ? ' - lead' : ''}
                        {canManageAssignments ? (
                          <>
                            <button type="button" onClick={() => void makeLead(assignment.id)}>
                              Make lead
                            </button>
                            <button
                              type="button"
                              onClick={() => void deactivateAssignment(assignment.id)}
                            >
                              Deactivate
                            </button>
                            <button
                              type="button"
                              onClick={() => void archiveSelectedAssignment(assignment.id)}
                            >
                              Archive
                            </button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {canManageAssignments ? (
                <form
                  className="stacked-form"
                  aria-label="Create mission assignment"
                  onSubmit={(event) => void handleCreateAssignment(event)}
                >
                  <input name="userId" placeholder="Internal user id" required />
                  <select name="role" defaultValue="RECRUITER">
                    <option value="RECRUITER">Recruiter</option>
                    <option value="SOURCER">Sourcer</option>
                    <option value="CONTRIBUTOR">Contributor</option>
                  </select>
                  <label>
                    Lead recruiter
                    <input name="isLead" type="checkbox" />
                  </label>
                  <button type="submit">Assign user</button>
                </form>
              ) : null}

              {canViewProcesses ? (
                <>
                  <h3>Candidate processes</h3>
                  <ul>
                    {candidateProcesses.map((process) => (
                      <li key={process.id}>
                        {process.candidate.displayName} - {process.state} - responsible:{' '}
                        {process.responsibleRecruiterDisplayName}
                        {process.clientVisible ? ' - client visible' : ' - internal only'}
                        {process.placementConfirmedAt ? ' - placement confirmed' : ''}
                        {canTransitionProcesses ? (
                          <div className="action-row">
                            {nextProcessStates(process.state).map((state) => (
                              <button
                                key={state}
                                type="button"
                                onClick={() => void moveProcess(process.id, process.state, state)}
                              >
                                {state}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {canPresentProcesses ? (
                          <button type="button" onClick={() => void presentProcess(process.id)}>
                            Present to client
                          </button>
                        ) : null}
                        {canViewOffers || canViewPlacements ? (
                          <section aria-label="Offer and placement controls">
                            <h4>Offer and placement</h4>
                            <button
                              type="button"
                              onClick={() => void loadOfferPlacement(process.id)}
                            >
                              Load offer and placement
                            </button>
                            {canViewOffers ? (
                              <>
                                {offersByProcessId[process.id] ? (
                                  <div>
                                    <p>
                                      Current offer:{' '}
                                      {offersByProcessId[process.id]?.versions.find(
                                        (version) =>
                                          version.id ===
                                          offersByProcessId[process.id]?.currentVersionId,
                                      )?.status ?? 'none'}{' '}
                                      - versions {offersByProcessId[process.id]?.versions.length}
                                    </p>
                                    <div className="action-row">
                                      <button
                                        type="button"
                                        disabled={!canUpdateOffers}
                                        onClick={() =>
                                          void reviseOffer(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Revise offer
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canSendOffers}
                                        onClick={() =>
                                          void markOfferSent(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Mark sent
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'NEGOTIATING',
                                          )
                                        }
                                      >
                                        Negotiating
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'ACCEPTED',
                                          )
                                        }
                                      >
                                        Accepted
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'REJECTED',
                                          )
                                        }
                                      >
                                        Rejected
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'EXPIRED',
                                          )
                                        }
                                      >
                                        Expired
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canWithdrawOffers}
                                        onClick={() =>
                                          void withdrawOffer(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Withdraw
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canConfirmPlacements}
                                        onClick={() =>
                                          void confirmPlacement(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Confirm placement
                                      </button>
                                    </div>
                                  </div>
                                ) : canCreateOffers ? (
                                  <form
                                    className="inline-form"
                                    aria-label="Create offer draft"
                                    onSubmit={(event) => void handleCreateOffer(event, process.id)}
                                  >
                                    <input
                                      name="offeredSalaryAmountCents"
                                      type="number"
                                      min="0"
                                      placeholder="Salary cents"
                                    />
                                    <input
                                      name="offeredSalaryCurrency"
                                      placeholder="Currency"
                                      defaultValue="MAD"
                                    />
                                    <input name="contractType" placeholder="Contract type" />
                                    <input
                                      name="proposedStartDate"
                                      type="datetime-local"
                                      aria-label="Proposed start date"
                                    />
                                    <input name="probationPeriod" placeholder="Probation" />
                                    <input
                                      name="clientFacingRemarks"
                                      placeholder="Client-facing remarks"
                                    />
                                    <input
                                      name="internalRecruiterRemarks"
                                      placeholder="Internal remarks"
                                    />
                                    <button type="submit">Create offer draft</button>
                                  </form>
                                ) : (
                                  <p>No offer loaded for this process.</p>
                                )}
                              </>
                            ) : null}
                            {canViewPlacements ? (
                              <div>
                                <p>
                                  Placement:{' '}
                                  {placementsByProcessId[process.id]?.status ?? 'not confirmed'}
                                  {placementsByProcessId[process.id]?.closureEligible
                                    ? ' - closure eligible'
                                    : ''}
                                  {canViewPlacementCommercialEligibility &&
                                  placementsByProcessId[process.id]?.eligibleForInvoicing
                                    ? ' - invoicing eligible'
                                    : ''}
                                </p>
                                <button
                                  type="button"
                                  disabled={
                                    !canCorrectPlacements ||
                                    placementsByProcessId[process.id]?.status !== 'CONFIRMED'
                                  }
                                  onClick={() => void correctPlacement(process.id)}
                                >
                                  Correct placement
                                </button>
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                        {canTransferProcesses ? (
                          <form
                            className="inline-form"
                            onSubmit={(event) => void transferProcess(event, process.id)}
                          >
                            <input
                              name="responsibleRecruiterUserId"
                              placeholder="New recruiter user id"
                              required
                            />
                            <input name="reason" placeholder="Transfer reason" required />
                            <button type="submit">Transfer</button>
                          </form>
                        ) : null}
                        {canViewInterviews ? (
                          <button
                            type="button"
                            onClick={() => void loadProcessInterviews(process.id)}
                          >
                            Interviews
                          </button>
                        ) : null}
                        {canScheduleInterviews ? (
                          <form
                            className="stacked-form"
                            aria-label="Schedule interview"
                            onSubmit={(event) => void handleScheduleInterview(event, process.id)}
                          >
                            <select name="type" defaultValue="HR">
                              <option value="HR">HR</option>
                              <option value="TECHNICAL">Technical</option>
                              <option value="INTERNAL_VALIDATION">Internal validation</option>
                              <option value="CLIENT_INTERVIEW_1">Client interview 1</option>
                              <option value="CLIENT_INTERVIEW_2">Client interview 2</option>
                            </select>
                            <input name="scheduledStartAt" type="datetime-local" required />
                            <input name="scheduledEndAt" type="datetime-local" />
                            <input name="timezone" placeholder="Timezone" defaultValue="UTC" />
                            <select name="format" defaultValue="VIDEO">
                              <option value="VIDEO">Video</option>
                              <option value="PHONE">Phone</option>
                              <option value="ONSITE">Onsite</option>
                              <option value="OTHER">Other</option>
                            </select>
                            <input
                              name="organizerUserId"
                              placeholder="Organizer user id"
                              required
                            />
                            <input name="location" placeholder="Location" />
                            <input name="meetingUrl" placeholder="Meeting URL" />
                            <input
                              name="internalUserParticipantIds"
                              placeholder="Internal participant ids, comma separated"
                            />
                            <input
                              name="clientContactParticipantIds"
                              placeholder="Client contact ids, comma separated"
                            />
                            <button type="submit">Schedule interview</button>
                          </form>
                        ) : null}
                        {activeProcessId === process.id && interviews.length > 0 ? (
                          <ul>
                            {interviews.map((interview) => (
                              <li key={interview.id}>
                                {interview.type} - {interview.status} -{' '}
                                {new Date(interview.scheduledStartAt).toLocaleString()}
                                <div className="action-row">
                                  {canCompleteInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'complete',
                                        )
                                      }
                                    >
                                      Complete
                                    </button>
                                  ) : null}
                                  {canRescheduleInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'postpone',
                                        )
                                      }
                                    >
                                      Postpone
                                    </button>
                                  ) : null}
                                  {canCancelInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'cancel',
                                        )
                                      }
                                    >
                                      Cancel
                                    </button>
                                  ) : null}
                                  {canArchiveInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'archive',
                                        )
                                      }
                                    >
                                      Archive
                                    </button>
                                  ) : null}
                                  {canViewEvaluations ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void loadInterviewEvaluations(process.id, interview.id)
                                      }
                                    >
                                      Evaluations
                                    </button>
                                  ) : null}
                                </div>
                                {canRescheduleInterviews ? (
                                  <form
                                    className="inline-form"
                                    onSubmit={(event) =>
                                      void handleRescheduleInterview(
                                        event,
                                        process.id,
                                        interview.id,
                                      )
                                    }
                                  >
                                    <input name="scheduledStartAt" type="datetime-local" required />
                                    <input name="scheduledEndAt" type="datetime-local" />
                                    <input name="timezone" defaultValue="UTC" />
                                    <input name="reason" placeholder="Reason" required />
                                    <button type="submit">Reschedule</button>
                                  </form>
                                ) : null}
                                {activeInterviewId === interview.id ? (
                                  <>
                                    <ul>
                                      {evaluations.map((evaluation) => (
                                        <li key={evaluation.id}>
                                          {evaluation.evaluationType} - {evaluation.status}
                                          {evaluation.redacted ? ' - redacted' : ''}
                                          {evaluation.comment ? ` - ${evaluation.comment}` : ''}
                                          {canFinalizeEvaluations &&
                                          evaluation.status === 'DRAFT' ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void finalizeSelectedEvaluation(
                                                  process.id,
                                                  interview.id,
                                                  evaluation.id,
                                                )
                                              }
                                            >
                                              Finalize
                                            </button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                    {canCreateEvaluations ? (
                                      <form
                                        className="stacked-form"
                                        aria-label="Create evaluation"
                                        onSubmit={(event) =>
                                          void handleCreateEvaluation(
                                            event,
                                            process.id,
                                            interview.id,
                                          )
                                        }
                                      >
                                        <select name="evaluationType" defaultValue="INTERNAL_HR">
                                          <option value="INTERNAL_HR">Internal HR</option>
                                          <option value="INTERNAL_TECHNICAL">
                                            Internal technical
                                          </option>
                                          <option value="CLIENT">Client</option>
                                        </select>
                                        <select name="recommendation" defaultValue="NEUTRAL">
                                          <option value="STRONG_YES">Strong yes</option>
                                          <option value="YES">Yes</option>
                                          <option value="NEUTRAL">Neutral</option>
                                          <option value="NO">No</option>
                                          <option value="STRONG_NO">Strong no</option>
                                        </select>
                                        <input name="overallScore" type="number" min="1" max="5" />
                                        <input
                                          name="communicationScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Communication"
                                        />
                                        <input
                                          name="technicalScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Technical"
                                        />
                                        <input
                                          name="roleFitScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Role fit"
                                        />
                                        <input
                                          name="cultureFitScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Culture fit"
                                        />
                                        <input
                                          name="motivationScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Motivation"
                                        />
                                        <input
                                          name="salaryAlignmentScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Salary alignment"
                                        />
                                        <textarea name="strengths" placeholder="Strengths" />
                                        <textarea name="weaknesses" placeholder="Weaknesses" />
                                        <textarea name="risks" placeholder="Risks" />
                                        <textarea name="comment" placeholder="Comment" />
                                        <label>
                                          Final opinion
                                          <input name="finalOpinion" type="checkbox" />
                                        </label>
                                        <button type="submit">Save evaluation</button>
                                      </form>
                                    ) : null}
                                  </>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {canCreateProcesses ? (
                <form
                  className="stacked-form"
                  aria-label="Link candidate to mission"
                  onSubmit={(event) => void handleCreateProcess(event)}
                >
                  <h3>Link candidate</h3>
                  <input name="candidateId" placeholder="Candidate id" required />
                  <input
                    name="responsibleRecruiterUserId"
                    placeholder="Responsible recruiter user id"
                    required
                  />
                  <select name="priority" defaultValue="NORMAL">
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <input name="source" placeholder="Source" />
                  <textarea name="sourceContext" placeholder="Source context" />
                  <textarea name="internalNotes" placeholder="Internal notes" />
                  <button type="submit">Link candidate</button>
                </form>
              ) : null}
              {message ? <p role="status">{message}</p> : null}
            </>
          ) : (
            <p>Select a mission.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function nextProcessStates(state: MissionCandidateState): MissionCandidateState[] {
  const transitions: Partial<Record<MissionCandidateState, MissionCandidateState[]>> = {
    NEW: ['CV_TO_REVIEW', 'WITHDRAWN'],
    CV_TO_REVIEW: ['HR_PRESELECTION', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_PRESELECTION: ['HR_INTERVIEW_SCHEDULED', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_INTERVIEW_SCHEDULED: ['HR_INTERVIEW_COMPLETED', 'POSTPONED'],
    HR_INTERVIEW_COMPLETED: ['TECHNICAL_TEST', 'INTERNAL_VALIDATION'],
    TECHNICAL_TEST: ['INTERNAL_VALIDATION'],
    INTERNAL_VALIDATION: ['PRESENTED_TO_CLIENT', 'WAITING', 'CANDIDATE_REJECTED'],
    PRESENTED_TO_CLIENT: ['CLIENT_INTERVIEW_1', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_1: ['CLIENT_INTERVIEW_2', 'CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_2: ['CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_OFFER: ['ACCEPTED', 'CANDIDATE_REJECTED', 'WITHDRAWN'],
    ACCEPTED: [],
    INTEGRATED: ['PROBATION_COMPLETED'],
    PROBATION_COMPLETED: ['PROCESS_COMPLETED'],
    WAITING: ['CV_TO_REVIEW', 'HR_PRESELECTION', 'PRESENTED_TO_CLIENT', 'WITHDRAWN'],
    POSTPONED: ['HR_INTERVIEW_SCHEDULED', 'CLIENT_INTERVIEW_1', 'CLIENT_INTERVIEW_2'],
  };
  return transitions[state] ?? [];
}

function isOptionalProcessSkip(
  currentState: MissionCandidateState,
  nextState: MissionCandidateState,
): boolean {
  return (
    (currentState === 'HR_INTERVIEW_COMPLETED' && nextState === 'INTERNAL_VALIDATION') ||
    (currentState === 'CLIENT_INTERVIEW_1' && nextState === 'CLIENT_OFFER')
  );
}

const missionStates: MissionLifecycleState[] = [
  'DRAFT',
  'INTERNAL_VALIDATION',
  'ACTIVE',
  'JOB_DESCRIPTION_APPROVED',
  'CANDIDATE_SOURCING',
  'HR_PRESELECTION',
  'HR_INTERVIEWS',
  'TECHNICAL_TESTS',
  'CANDIDATE_PRESENTATION',
  'CLIENT_INTERVIEWS',
  'FINAL_SELECTION',
  'OFFER_SENT',
  'CANDIDATE_INTEGRATED',
  'PROBATION_MONITORING',
  'WAITING_FOR_CLIENT_INFORMATION',
  'PAUSED',
];

function nextMissionStates(state: MissionLifecycleState): MissionLifecycleState[] {
  const transitions: Partial<Record<MissionLifecycleState, MissionLifecycleState[]>> = {
    DRAFT: ['INTERNAL_VALIDATION', 'PAUSED'],
    INTERNAL_VALIDATION: ['ACTIVE', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    ACTIVE: ['JOB_DESCRIPTION_APPROVED', 'PAUSED'],
    JOB_DESCRIPTION_APPROVED: ['CANDIDATE_SOURCING', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CANDIDATE_SOURCING: ['HR_PRESELECTION', 'PAUSED'],
    HR_PRESELECTION: ['HR_INTERVIEWS', 'PAUSED'],
    HR_INTERVIEWS: ['TECHNICAL_TESTS', 'PAUSED'],
    TECHNICAL_TESTS: ['CANDIDATE_PRESENTATION', 'PAUSED'],
    CANDIDATE_PRESENTATION: ['CLIENT_INTERVIEWS', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CLIENT_INTERVIEWS: ['FINAL_SELECTION', 'PAUSED'],
    FINAL_SELECTION: ['OFFER_SENT', 'PAUSED'],
    OFFER_SENT: ['CANDIDATE_INTEGRATED', 'PAUSED'],
    CANDIDATE_INTEGRATED: ['PROBATION_MONITORING'],
    WAITING_FOR_CLIENT_INFORMATION: [
      'INTERNAL_VALIDATION',
      'JOB_DESCRIPTION_APPROVED',
      'CANDIDATE_PRESENTATION',
    ],
    PAUSED: ['INTERNAL_VALIDATION', 'ACTIVE', 'CANDIDATE_SOURCING', 'HR_PRESELECTION'],
  };
  return transitions[state] ?? [];
}

function PublicOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<PublicOpportunity[]>([]);
  const [status, setStatus] = useState('Loading opportunities...');

  useEffect(() => {
    let isMounted = true;
    listPublicOpportunities()
      .then((response) => {
        if (isMounted) {
          setOpportunities(response.opportunities);
          setStatus(response.opportunities.length === 0 ? 'No public opportunities are open.' : '');
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatus('Public opportunities are unavailable.');
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Hire Me Opportunities</p>
        <h1>Open roles</h1>
      </section>
      {status ? <p>{status}</p> : null}
      <section className="data-grid" aria-label="Public opportunities">
        {opportunities.map((opportunity) => (
          <article className="record-card" key={opportunity.publicSlug}>
            <h2>{opportunity.publicTitle}</h2>
            <p>
              {opportunity.publicSummary ?? opportunity.publicLocation ?? 'Recruitment opportunity'}
            </p>
            <a className="button-link" href={`/opportunities/${opportunity.publicSlug}`}>
              View opportunity
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}

function PublicOpportunityDetailPage({ publicSlug }: { publicSlug: string }) {
  const [opportunity, setOpportunity] = useState<PublicOpportunity | null>(null);
  const [status, setStatus] = useState('Loading opportunity...');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getPublicOpportunity(publicSlug)
      .then((response) => {
        if (isMounted) {
          setOpportunity(response.opportunity);
          setStatus('');
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatus('This opportunity is not available.');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [publicSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!opportunity) {
      return;
    }
    setSubmitting(true);
    setStatus('');
    const formData = new FormData(event.currentTarget);
    const cvFile = firstFile(formData, 'cv');
    const certificationFile = firstFile(formData, 'certification');
    const diplomaFile = firstFile(formData, 'diploma');
    const additionalFile = firstFile(formData, 'additional');
    const files = await Promise.all(
      [
        cvFile ? fileInput('CV', cvFile) : null,
        certificationFile ? fileInput('CERTIFICATION', certificationFile) : null,
        diplomaFile ? fileInput('DIPLOMA', diplomaFile) : null,
        additionalFile ? fileInput('ADDITIONAL', additionalFile) : null,
      ].filter((file): file is Promise<Awaited<ReturnType<typeof fileInput>>> => Boolean(file)),
    );

    try {
      const response = await submitPublicApplication(publicSlug, {
        fullName: formValue(formData, 'fullName'),
        email: formValue(formData, 'email'),
        phone: optionalFormValue(formData, 'phone'),
        city: optionalFormValue(formData, 'city'),
        country: optionalFormValue(formData, 'country'),
        currentPosition: optionalFormValue(formData, 'currentPosition'),
        experienceYears: optionalNumber(formData, 'experienceYears'),
        skills: optionalFormValue(formData, 'skills'),
        languages: optionalFormValue(formData, 'languages'),
        availability: optionalFormValue(formData, 'availability'),
        salaryExpectationCents: optionalNumber(formData, 'salaryExpectationCents'),
        salaryExpectationCurrency: optionalFormValue(formData, 'salaryExpectationCurrency'),
        professionalLinks: optionalFormValue(formData, 'professionalLinks'),
        motivation: optionalFormValue(formData, 'motivation'),
        consentGranted: formData.get('consentGranted') === 'on',
        captchaToken: undefined,
        website: optionalFormValue(formData, 'website'),
        files,
      });
      event.currentTarget.reset();
      setStatus(response.message);
    } catch {
      setStatus('Application could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Hire Me Opportunity</p>
        <h1>{opportunity?.publicTitle ?? 'Opportunity'}</h1>
        {opportunity?.publicSummary ? <p>{opportunity.publicSummary}</p> : null}
      </section>
      {status ? <p aria-live="polite">{status}</p> : null}
      {opportunity ? (
        <section className="workspace-grid">
          <article className="record-card">
            <h2>Details</h2>
            <p>{opportunity.publicDescription ?? opportunity.publicSummary}</p>
            <dl>
              <dt>Location</dt>
              <dd>{opportunity.publicLocation ?? 'Not specified'}</dd>
              <dt>Work arrangement</dt>
              <dd>{opportunity.publicWorkArrangement ?? 'Not specified'}</dd>
              <dt>Client</dt>
              <dd>{opportunity.clientName ?? 'Confidential'}</dd>
            </dl>
          </article>
          <form
            className="record-card form-grid"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <label>
              Full name
              <input name="fullName" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <label>
              City
              <input name="city" />
            </label>
            <label>
              Country
              <input name="country" />
            </label>
            <label>
              Current position
              <input name="currentPosition" />
            </label>
            <label>
              Experience years
              <input name="experienceYears" min="0" type="number" />
            </label>
            <label>
              Skills
              <textarea name="skills" rows={3} />
            </label>
            <label>
              Languages
              <textarea name="languages" rows={2} />
            </label>
            <label>
              Availability
              <input name="availability" />
            </label>
            <label>
              Salary expectation
              <input name="salaryExpectationCents" min="0" type="number" />
            </label>
            <label>
              Salary currency
              <input name="salaryExpectationCurrency" maxLength={3} />
            </label>
            <label>
              Professional links
              <textarea name="professionalLinks" rows={2} />
            </label>
            <label>
              Motivation
              <textarea name="motivation" rows={4} />
            </label>
            <label>
              CV
              <input
                name="cv"
                type="file"
                required={opportunity.uploadRequirements.cvRequired}
                accept={opportunity.uploadRequirements.allowedMimeTypes.join(',')}
              />
            </label>
            {opportunity.uploadRequirements.certificationsEnabled ? (
              <label>
                Certification
                <input name="certification" type="file" />
              </label>
            ) : null}
            {opportunity.uploadRequirements.diplomasEnabled ? (
              <label>
                Diploma
                <input name="diploma" type="file" />
              </label>
            ) : null}
            {opportunity.uploadRequirements.additionalAttachmentsEnabled ? (
              <label>
                Additional attachment
                <input name="additional" type="file" />
              </label>
            ) : null}
            <label className="checkbox-row">
              <input name="consentGranted" type="checkbox" required />I consent to Hire Me
              processing this application.
            </label>
            <input aria-hidden="true" className="hidden-field" name="website" tabIndex={-1} />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit application'}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}

function localDateTimeToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function optionalFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

function csvValues(formData: FormData, name: string): string[] {
  return formValue(formData, name)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? Number(value) : undefined;
}

function dateTimeFormValue(formData: FormData, name: string): string {
  return new Date(formValue(formData, name)).toISOString();
}

function optionalDateTimeFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? new Date(value).toISOString() : undefined;
}

function dateTimeInputValue(value: string | null): string {
  return value ? value.slice(0, 16) : '';
}

function nullableFormValue(formData: FormData, name: string): string | null {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : null;
}

function firstFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

async function fileInput(category: 'CV' | 'CERTIFICATION' | 'DIPLOMA' | 'ADDITIONAL', file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    category,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    base64Content: btoa(binary),
  };
}
