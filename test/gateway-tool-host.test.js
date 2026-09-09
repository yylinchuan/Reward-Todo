const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/database');
const { ChecklistService } = require('../src/checklist-service');
const { createGatewayToolHost } = require('../src/gateway-tool-host');

function service() {
  return new ChecklistService(openDatabase(':memory:'), {
    timeZone: 'Asia/Shanghai', now: () => Date.parse('2026-09-09T02:00:00.000Z'),
  });
}

test('gateway exposes one bounded tool and creates assistant-owned tasks', () => {
  const host = createGatewayToolHost(service());
  assert.deepEqual(host.listTools().map((tool) => tool.name), ['reward_todo_manage']);
  const created = host.invokeTool('reward_todo_manage', { action: 'create', body: '整理桌面', points: 3 });
  assert.equal(created.createdBy, 'assistant');
  assert.equal(created.points, 3);
});

test('gateway requires current-turn confirmation for destructive reward actions', () => {
  const host = createGatewayToolHost(service());
  const reward = host.invokeTool('reward_todo_manage', { action: 'reward_create', name: '一杯奶茶', cost: 10 });
  assert.throws(
    () => host.invokeTool('reward_todo_manage', { action: 'reward_archive', id: reward.id }),
    /confirmed=true/,
  );
});

test('gateway validates ids and explicit completion state', () => {
  const host = createGatewayToolHost(service());
  assert.throws(() => host.invokeTool('reward_todo_manage', { action: 'set_done', id: 'x' }), /布尔值 done/);
  assert.throws(() => host.invokeTool('reward_todo_manage', { action: 'update' }), /需要 id/);
});
