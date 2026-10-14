// Synthetic dataset seeder for the Console Workspace (#198) performance preflight.
// Talks only to the local API; every value is generated. Usage:
//   API=http://localhost:3610 ADMIN_EMAIL=... ADMIN_PASSWORD=... node seed.mjs [scale]
import { randomUUID } from 'node:crypto';

const API = process.env.API ?? 'http://localhost:3610';
const SCALE = Number(process.argv[2] ?? 1);
const N = {
  users: 6,
  clients: 300 * SCALE,
  contactsClients: 60 * SCALE,
  candidates: 2000 * SCALE,
  missions: 150 * SCALE,
  pipelineMissions: 30 * SCALE,
  pipelinePerMission: 12,
  tasks: 400 * SCALE,
  conversations: 20,
  messagesPerConversation: 40,
};

let token;
async function call(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
const idOf = (j) => {
  for (const v of Object.values(j)) if (v && typeof v === 'object' && typeof v.id === 'string') return v.id;
  return j.id;
};
async function pool(n, limit, fn) {
  const out = new Array(n);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < n) {
        const i = next++;
        out[i] = await fn(i);
      }
    }),
  );
  return out;
}
const RESUME = process.env.RESUME === '1';
async function listIds(path, key) {
  const ids = [];
  for (let page = 1; ; page++) {
    const j = await call('GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`);
    const rows = j[key] ?? [];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < 100) return ids;
  }
}
const pick = (a, i) => a[i % a.length];
const cities = ['Casablanca', 'Rabat', 'Paris', 'Lyon', 'Tanger', 'Marseille', 'Agadir', 'Lille'];
const industries = ['Banking', 'Retail', 'Energy', 'Telecom', 'Healthcare', 'Logistics', 'Software'];
const titles = ['Data Engineer', 'HR Business Partner', 'Accountant', 'Project Manager', 'Sales Lead', 'DevOps Engineer', 'Payroll Specialist'];

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const j = await res.json();
  token = j.accessToken;
  return j.user;
}

const t0 = Date.now();
const admin = await login();
console.log('admin', admin.id, 'permissions', admin.permissions.length);
// Access tokens are short-lived; re-login every 2 minutes during the long seed.
const relogin = setInterval(() => void login().catch(console.error), 120_000);

const users = RESUME ? (await call('GET','/v1/admin/users?page=1&pageSize=50')).users.filter((u)=>u.displayName.startsWith('Synthetic')).map((u)=>u.id) : await pool(N.users, 2, async (i) => {
  const u = await call('POST', '/v1/admin/users', {
    displayName: `Synthetic Recruiter ${i + 1}`,
    email: `synthetic.recruiter.${i + 1}.${Date.now()}@example.test`,
    initialPassword: `Synthetic-${randomUUID()}-Aa1!`,
    locale: i % 2 ? 'fr' : 'en',
  });
  const id = idOf(u);
  await call('POST', `/v1/admin/users/${id}/roles`, { roleName: i % 3 === 0 ? 'MANAGER' : 'EMPLOYEE' });
  return id;
});
console.log('users', users.length);

const clients = RESUME ? (await listIds('/v1/clients','clients')).reverse() : await pool(N.clients, 8, async (i) =>
  idOf(
    await call('POST', '/v1/clients', {
      name: `Synthetic Client ${String(i + 1).padStart(4, '0')} ${pick(industries, i)}`,
      industry: pick(industries, i),
      city: pick(cities, i),
      country: i % 3 ? 'Morocco' : 'France',
      commercialSummary: 'Synthetic account used for performance measurement only.',
    }),
  ),
);
console.log('clients', clients.length);

if (!RESUME) await pool(N.contactsClients * 3, 8, async (i) =>
  call('POST', `/v1/clients/${clients[Math.floor(i / 3)]}/contacts`, {
    displayName: `Contact ${i + 1}`,
    email: `contact.${i + 1}@client.example.test`,
    roleTitle: pick(titles, i),
  }),
);
console.log('contacts', N.contactsClients * 3);

const candidates = RESUME ? await listIds('/v1/candidates','candidates') : await pool(N.candidates, 8, async (i) =>
  idOf(
    await call('POST', '/v1/candidates', {
      displayName: `Candidate ${String(i + 1).padStart(5, '0')}`,
      email: `candidate.${i + 1}@example.test`,
      city: pick(cities, i),
      country: i % 4 ? 'Morocco' : 'France',
      currentJobTitle: pick(titles, i),
      professionalSummary: 'Synthetic professional summary. '.repeat(6).trim(),
      source: 'Synthetic',
    }),
  ),
);
console.log('candidates', candidates.length);

const missions = await pool(N.missions, 6, async (i) => {
  const id = idOf(
    await call('POST', '/v1/missions', {
      clientId: pick(clients, i),
      title: `${pick(titles, i)} — synthetic mission ${i + 1}`,
      description: 'Synthetic mission description for performance measurement.',
      numberOfPositions: 1 + (i % 4),
      location: pick(cities, i),
    }),
  );
  await call('POST', `/v1/missions/${id}/assignments`, { userId: admin.id, role: 'LEAD_RECRUITER', isLead: true });
  return id;
});
console.log('missions', missions.length);

await pool(N.pipelineMissions * N.pipelinePerMission, 6, async (i) => {
  const m = missions[Math.floor(i / N.pipelinePerMission)];
  await call('POST', `/v1/missions/${m}/candidates`, {
    candidateId: candidates[(i * 7) % candidates.length],
    responsibleRecruiterUserId: admin.id,
    source: 'Synthetic',
  });
});
console.log('mission candidates', N.pipelineMissions * N.pipelinePerMission);

const now = Date.now();
await pool(N.tasks, 8, async (i) =>
  call('POST', '/v1/tasks', {
    title: `Synthetic follow-up ${i + 1}`,
    description: 'Synthetic task.',
    priority: pick(['LOW', 'NORMAL', 'HIGH'], i),
    dueAt: new Date(now + (i - N.tasks / 4) * 3_600_000).toISOString(),
    ownerUserId: admin.id,
    assigneeUserIds: [admin.id],
    context: i % 2 ? { missionId: pick(missions, i) } : { clientId: pick(clients, i) },
  }).catch(() =>
    call('POST', '/v1/tasks', {
      title: `Synthetic follow-up ${i + 1}`,
      ownerUserId: admin.id,
      assigneeUserIds: [admin.id],
      dueAt: new Date(now + (i - N.tasks / 4) * 3_600_000).toISOString(),
    }),
  ),
);
console.log('tasks', N.tasks);

const conversations = await pool(N.conversations, 4, async (i) =>
  i < users.length
    ? idOf(await call('POST', '/v1/messages/conversations/direct', { userId: users[i] }))
    : idOf(
        await call('POST', '/v1/messages/conversations/groups', {
          title: `Synthetic group ${i + 1}`,
          memberUserIds: users.slice(0, 2 + (i % 4)),
        }),
      ),
);
await pool(N.conversations * N.messagesPerConversation, 6, async (i) =>
  call('POST', `/v1/messages/conversations/${conversations[i % N.conversations]}/messages`, {
    body: `Synthetic message ${i + 1}. `.repeat(1 + (i % 5)).trim(),
    clientMessageId: randomUUID(),
  }),
);
console.log('conversations', conversations.length, 'messages', N.conversations * N.messagesPerConversation);
await call('POST', '/v1/tasks/reminders/process-due').catch((e) => console.log('reminders skipped', e.message));
clearInterval(relogin);
console.log(JSON.stringify({ scale: SCALE, counts: N, seconds: Math.round((Date.now() - t0) / 1000) }));
