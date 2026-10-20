// Synthetic data for the Issue #228 B0′ unsaved-input evidence. Local API only.
//   API=http://localhost:3720 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node seed.mjs
const API = process.env.API ?? 'http://localhost:3720';
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
}).then((r) => r.json());
const token = login.accessToken;
const admin = login.user;
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
const existingTasks = await call('GET', '/v1/tasks?page=1&pageSize=25');
const task =
  existingTasks.tasks?.find((entry) => entry.title === 'Synthetic follow-up for evidence') ??
  (await call('POST', '/v1/tasks', {
    title: 'Synthetic follow-up for evidence',
    ownerUserId: admin.id,
    assigneeUserIds: [admin.id],
    priority: 'NORMAL',
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  })).task;
const users = await call('GET', '/v1/admin/users?search=peer228&pageSize=20');
const peer =
  users.users[0] ??
  (await call('POST', '/v1/admin/users', {
    displayName: 'Synthetic Peer',
    email: 'peer228@example.test',
    initialPassword: 'Peer228-Synthetic-Pass!',
    locale: 'en',
  })).user;
// Messaging requires a role that may take part in conversations.
if (!peer.roles?.includes('EMPLOYEE')) {
  await call('POST', `/v1/admin/users/${peer.id}/roles`, { roleName: 'EMPLOYEE' });
}
const conversation = await call('POST', '/v1/messages/conversations/direct', { userId: peer.id });
console.log(JSON.stringify({ task: task.id, peer: peer.id, conversation: conversation.conversation?.id }));
