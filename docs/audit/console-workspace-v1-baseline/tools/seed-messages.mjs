// Paced messaging seeder: the API allows 10 conversation creations/hour and
// 30 message writes/minute per actor, so this stays under both limits.
import { randomUUID } from 'node:crypto';

const API = process.env.API ?? 'http://localhost:3610';
const PER_CONVERSATION = Number(process.argv[2] ?? 12);
let token;
async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  token = (await res.json()).accessToken;
}
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await login();
const relogin = setInterval(() => void login(), 120_000);
const users = (await call('GET', '/v1/admin/users?page=1&pageSize=50')).users
  .filter((u) => u.displayName.startsWith('Synthetic'))
  .map((u) => u.id);
let conversations = (await call('GET', '/v1/messages/conversations')).conversations.map((c) => c.id);
for (let i = conversations.length; i < 10; i++) {
  try {
    const j =
      i < users.length
        ? await call('POST', '/v1/messages/conversations/direct', { userId: users[i] })
        : await call('POST', '/v1/messages/conversations/groups', {
            title: `Synthetic group ${i + 1}`,
            memberUserIds: users.slice(0, 2 + (i % 4)),
          });
    conversations.push((j.conversation ?? j).id);
  } catch (e) {
    console.log('stop creating conversations:', e.message);
    break;
  }
}
conversations = [...new Set(conversations)];
console.log('conversations', conversations.length);
let sent = 0;
for (let n = 0; n < PER_CONVERSATION; n++) {
  for (const c of conversations) {
    await call('POST', `/v1/messages/conversations/${c}/messages`, {
      body: `Synthetic message ${n + 1}. `.repeat(1 + (n % 5)).trim(),
      clientMessageId: randomUUID(),
    });
    sent++;
    await sleep(2_100);
  }
}
clearInterval(relogin);
console.log('messages', sent);
