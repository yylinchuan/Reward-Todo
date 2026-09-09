const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/database');
const { ChecklistService } = require('../src/checklist-service');

function harness(initial = '2026-08-10T01:00:00.000Z') {
  let now = Date.parse(initial);
  const db = openDatabase(':memory:');
  const service = new ChecklistService(db, { now: () => now, timeZone: 'Asia/Shanghai' });
  return { db, service, setNow: (value) => { now = Date.parse(value); } };
}

test('fixed daily task resets but keeps its completed day', () => {
  const h = harness();
  const task = h.service.create({ body: '散步', isFixed: true }, { actor: 'user', via: 'dashboard' });
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.monthlyStats(task.id, '2026-08').completedDays, 1);
  h.setNow('2026-08-11T01:00:00.000Z');
  assert.equal(h.service.runDailyReset().fixedReset, 1);
  assert.equal(h.service.get(task.id).done, false);
  assert.equal(h.service.monthlyStats(task.id, '2026-08').completedDays, 1);
});

test('opening the list after midnight performs the reset without a separate scheduler', () => {
  const h = harness();
  const task = h.service.create({ body: '早睡', isFixed: true }, { actor: 'user', via: 'dashboard' });
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  h.setNow('2026-08-11T01:00:00.000Z');
  assert.equal(h.service.list()[0].done, false);
  assert.equal(h.service.monthlyStats(task.id, '2026-08').completedDays, 1);
});

test('undo keeps audit row but removes day from completion count', () => {
  const h = harness();
  const task = h.service.create({ body: '喝水', isFixed: true }, { actor: 'assistant', via: 'mcp' });
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  h.service.setDone(task.id, false, { actor: 'user', via: 'dashboard' });
  const stats = h.service.monthlyStats(task.id, '2026-08');
  assert.equal(stats.completedDays, 0);
  assert.equal(stats.days.length, 1);
  assert.equal(stats.days[0].completed, false);
});

test('unfinished one-offs roll over and completed old one-offs are archived', () => {
  const h = harness();
  const open = h.service.create({ body: '买牛奶' }, { actor: 'user', via: 'dashboard' });
  const done = h.service.create({ body: '寄快递' }, { actor: 'user', via: 'dashboard' });
  h.service.setDone(done.id, true, { actor: 'user', via: 'dashboard' });
  h.setNow('2026-08-11T01:00:00.000Z');
  h.service.runDailyReset();
  assert.equal(h.service.get(open.id).archivedAt, null);
  assert.notEqual(h.service.get(done.id).archivedAt, null);
});

test('one-off completion is recorded only on the actual completion date', () => {
  const h = harness();
  const task = h.service.create({ body: '整理衣柜', points: 3 }, { actor: 'user', via: 'dashboard' });
  h.setNow('2026-08-12T12:00:00.000Z');
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.dayReceipt('2026-08-10').completedCount, 0);
  const receipt = h.service.dayReceipt('2026-08-12');
  assert.equal(receipt.completedCount, 1);
  assert.equal(receipt.items[0].body, '整理衣柜');
  assert.equal(receipt.pointsEarned, 3);
});

test('daily receipt is paid only when every task due that day is completed', () => {
  const h = harness();
  const fixed = h.service.create({ body: '散步', isFixed: true }, { actor: 'user', via: 'dashboard' });
  const once = h.service.create({ body: '买牛奶' }, { actor: 'user', via: 'dashboard' });
  h.service.setDone(fixed.id, true, { actor: 'user', via: 'dashboard' });
  const openReceipt = h.service.dayReceipt('2026-08-10');
  assert.equal(openReceipt.completedCount, 1);
  assert.equal(openReceipt.totalCount, 2);
  assert.equal(openReceipt.isPaid, false);
  h.service.setDone(once.id, true, { actor: 'user', via: 'dashboard' });
  const receipt = h.service.dayReceipt('2026-08-10');
  assert.equal(receipt.totalCount, 2);
  assert.equal(receipt.completedCount, 2);
  assert.equal(receipt.isPaid, true);
  assert.equal(h.service.calendarMonth('2026-08').days[0].isPaid, true);
});

test('archived rewards can be listed and restored without changing points', () => {
  const h = harness();
  const reward = h.service.createReward({ name: '一杯奶茶', cost: 5 }, { actor: 'user', via: 'dashboard' });
  h.service.archiveReward(reward.id, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.listRewards().length, 0);
  assert.equal(h.service.listRewards({ includeArchived: true })[0].status, 'archived');
  assert.equal(h.service.restoreReward(reward.id, { actor: 'user', via: 'dashboard' }).status, 'wanted');
  assert.equal(h.service.listRewards().length, 1);
  assert.equal(h.service.pointsSummary().balance, 0);
});

test('task points use an immutable ledger and rewards require explicit assistant confirmation', () => {
  const h = harness();
  const task = h.service.create({ body: '拉伸', points: 5 }, { actor: 'user', via: 'dashboard' });
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.pointsSummary().balance, 5);
  h.service.setDone(task.id, false, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.pointsSummary().balance, 0);
  h.service.setDone(task.id, true, { actor: 'user', via: 'dashboard' });
  const reward = h.service.createReward({ name: '一杯奶茶', cost: 5 }, { actor: 'assistant', via: 'mcp' });
  assert.throws(() => h.service.redeemReward(reward.id, { actor: 'assistant', via: 'mcp' }), /confirmed=true/);
  const obtained = h.service.redeemReward(reward.id, { actor: 'assistant', via: 'mcp', confirmed: true });
  assert.equal(obtained.status, 'obtained');
  assert.equal(h.service.pointsSummary().balance, 0);
  assert.equal(h.service.pointsSummary().ledger.length, 4);
});

test('nightly closeout is claimed once after 21:30 and can retry later', () => {
  const h = harness('2026-08-10T13:29:00.000Z');
  h.service.create({ body: '收衣服' }, { actor: 'user', via: 'dashboard' });
  assert.equal(h.service.tick().closeout.reason, 'before_closeout');
  h.setNow('2026-08-10T13:45:00.000Z');
  const claimed = h.service.tick().closeout;
  assert.equal(claimed.claimed, true);
  const pending = h.service.listOutbox().filter((item) => item.kind === 'daily_closeout');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].items[0].body, '收衣服');
  h.service.completeOutbox(pending[0].id, { delivered: false, error: 'offline' });
  assert.equal(h.service.tick().closeout.reason, 'failed');
  h.setNow('2026-08-10T14:01:00.000Z');
  assert.equal(h.service.tick().closeout.retry, true);
});

test('server derives creator and assistant archive requires confirmation', () => {
  const h = harness();
  const task = h.service.create({ body: '复诊', createdBy: 'user' }, { actor: 'assistant', via: 'mcp' });
  assert.equal(task.createdBy, 'assistant');
  assert.throws(() => h.service.archive(task.id, { actor: 'assistant', via: 'mcp' }), /confirmed=true/);
  assert.notEqual(h.service.archive(task.id, { actor: 'assistant', via: 'mcp', confirmed: true }).archivedAt, null);
});

test('due reminder is claimed once and failed delivery can retry', () => {
  const h = harness();
  const task = h.service.create({ body: '吃药', inMinutes: 1 }, { actor: 'user', via: 'dashboard' });
  h.setNow('2026-08-10T01:02:00.000Z');
  assert.equal(h.service.tick().dueCount, 1);
  assert.equal(h.service.tick().dueCount, 0);
  const pending = h.service.listOutbox();
  assert.equal(pending.length, 1);
  assert.equal(h.service.completeOutbox(pending[0].id, { delivered: false, error: 'bridge unavailable' }).status, 'failed');
  assert.equal(h.service.get(task.id).notified, false);
  assert.equal(h.service.tick().dueCount, 1);
});
