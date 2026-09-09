const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { openDatabase } = require('../src/database');
const { ChecklistService } = require('../src/checklist-service');
const { createHttpServer } = require('../src/http-server');
const { createTodoToolHost } = require('../src/tool-host');

function service() {
  return new ChecklistService(openDatabase(':memory:'), {
    timeZone: 'Asia/Shanghai', now: () => Date.parse('2026-08-11T02:00:00.000Z'),
  });
}

test('REST creates human task and returns monthly check-in stats', async (t) => {
  const app = service();
  const server = createHttpServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${base}/api/items`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '拉伸', isFixed: true }),
  }).then((response) => response.json());
  assert.equal(created.createdBy, 'user');
  await fetch(`${base}/api/items/${created.id}/done`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }),
  });
  const stats = await fetch(`${base}/api/items/${created.id}/month?month=2026-08`).then((response) => response.json());
  assert.equal(stats.completedDays, 1);
});

test('standalone server exposes display config and built frontend', async (t) => {
  const app = service();
  const server = createHttpServer(app, {
    config: { userName: '小雨', assistantName: '阿树', appName: 'REWARD TODO', reminderDelivery: 'ready' },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await fetch(`${base}/api/config`).then((response) => response.json());
  assert.deepEqual(config, { userName: '小雨', assistantName: '阿树', appName: 'REWARD TODO', reminderDelivery: 'ready' });
  const page = await fetch(`${base}/`).then(async (response) => ({ status: response.status, text: await response.text() }));
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>Reward Todo<\/title>/);
});

test('MCP host creates assistant task and exposes bounded tool catalog', () => {
  const host = createTodoToolHost(service());
  const names = host.listTools().map((tool) => tool.name);
  assert.deepEqual(names, ['todo_status', 'todo_list', 'todo_create', 'todo_update', 'todo_set_done', 'todo_archive', 'todo_month', 'todo_calendar', 'todo_points', 'todo_rewards']);
  const created = host.invokeTool('todo_create', { body: '整理照片' });
  assert.equal(created.createdBy, 'assistant');
});

test('REST exposes completion calendar, points, and reward redemption', async (t) => {
  const app = service();
  const server = createHttpServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${base}/api/items`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '写日记', points: 3 }),
  }).then((response) => response.json());
  await fetch(`${base}/api/items/${created.id}/done`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }),
  });
  const calendar = await fetch(`${base}/api/calendar?month=2026-08`).then((response) => response.json());
  assert.equal(calendar.days[0].items[0].body, '写日记');
  const reward = await fetch(`${base}/api/rewards`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '贴纸', cost: 3 }),
  }).then((response) => response.json());
  const redeemed = await fetch(`${base}/api/rewards/${reward.id}/redeem`, { method: 'POST' }).then((response) => response.json());
  assert.equal(redeemed.status, 'obtained');
  await fetch(`${base}/api/rewards/${reward.id}/archive`, { method: 'POST' });
  const archived = await fetch(`${base}/api/rewards?archived=1`).then((response) => response.json());
  assert.equal(archived.items[0].status, 'archived');
  const restored = await fetch(`${base}/api/rewards/${reward.id}/restore`, { method: 'POST' }).then((response) => response.json());
  assert.equal(restored.status, 'obtained');
  const points = await fetch(`${base}/api/points`).then((response) => response.json());
  assert.equal(points.balance, 0);
});

test('assistant HTTP boundary derives assistant actor and enforces archive confirmation', async (t) => {
  const app = service();
  const server = createHttpServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api/assistant/action`;
  const created = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', body: '收衣服' }),
  }).then((response) => response.json());
  assert.equal(created.createdBy, 'assistant');
  const rejected = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'archive', id: created.id, confirmed: false }),
  });
  assert.equal(rejected.status, 409);
});
