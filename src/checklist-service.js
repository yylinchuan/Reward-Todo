const { randomUUID } = require('node:crypto');
const { addLocalDays, dateToDayNumber, localDate, resolveTriggerAt } = require('./time');

class ChecklistService {
  constructor(db, options = {}) {
    this.db = db;
    this.timeZone = options.timeZone || 'Asia/Shanghai';
    this.now = options.now || Date.now;
    this.retryWindowMs = (options.reminderRetryMinutes || 15) * 60_000;
    this.closeoutTime = normalizeClock(options.closeoutTime || '21:30');
    this.initializeResetMarker();
  }

  initializeResetMarker() {
    const today = localDate(this.now(), this.timeZone);
    this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('last_daily_reset', ?)").run(today);
  }

  create(input, context = {}) {
    const now = this.now();
    const actor = normalizeActor(context.actor);
    const via = normalizeVia(context.via);
    const body = normalizeBody(input.body);
    const points = normalizePoints(input.points, 1);
    const resolvedTrigger = resolveTriggerAt(input, now, this.timeZone);
    const triggerAt = resolvedTrigger === undefined ? null : resolvedTrigger;
    const isFixed = triggerAt !== null ? 0 : toBooleanInt(input.isFixed ?? input.is_fixed ?? false);
    const id = randomUUID();
    const position = this.nextPosition(isFixed);
    const createdLocalDate = localDate(now, this.timeZone);

    this.db.prepare(`
      INSERT INTO checklist_items
        (id, body, is_fixed, done, done_at, position, points, created_by, created_via,
         trigger_at, notified, created_local_date, created_at, updated_at, archived_at)
      VALUES (?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)
    `).run(id, body, isFixed, position, points, actor, via, triggerAt, createdLocalDate, now, now);
    return this.get(id);
  }

  list(options = {}) {
    this.runDailyReset();
    const includeArchived = options.includeArchived === true;
    const rows = this.db.prepare(`
      SELECT * FROM checklist_items
      ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY archived_at IS NOT NULL, is_fixed DESC, position ASC, created_at ASC
    `).all();
    return rows.map((row) => this.toItem(row));
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id);
    if (!row) throw notFound('Todo item not found');
    return this.toItem(row);
  }

  update(id, patch, context = {}) {
    normalizeActor(context.actor);
    const current = this.getActiveRow(id);
    const now = this.now();
    const body = Object.hasOwn(patch, 'body') ? normalizeBody(patch.body) : current.body;
    const points = Object.hasOwn(patch, 'points') ? normalizePoints(patch.points) : current.points;
    const hasTriggerInput = ['triggerAt', 'trigger_at', 'inMinutes', 'in', 'at'].some((key) => Object.hasOwn(patch, key));
    const triggerAt = hasTriggerInput ? resolveTriggerAt(patch, now, this.timeZone) : current.trigger_at;
    let isFixed = Object.hasOwn(patch, 'isFixed') || Object.hasOwn(patch, 'is_fixed')
      ? toBooleanInt(patch.isFixed ?? patch.is_fixed)
      : current.is_fixed;
    if (triggerAt !== null) isFixed = 0;
    const notified = hasTriggerInput ? 0 : current.notified;
    this.db.prepare(`
      UPDATE checklist_items SET body = ?, is_fixed = ?, points = ?, trigger_at = ?, notified = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).run(body, isFixed, points, triggerAt, notified, now, id);
    return this.get(id);
  }

  setDone(id, done, context = {}) {
    const actor = normalizeActor(context.actor);
    const row = this.getActiveRow(id);
    const now = this.now();
    const value = toBooleanInt(done);
    if (row.done === value) return this.get(id);
    const doneAt = value ? now : null;
    const today = localDate(now, this.timeZone);
    this.transaction(() => {
      this.db.prepare('UPDATE checklist_items SET done = ?, done_at = ?, updated_at = ? WHERE id = ?')
        .run(value, doneAt, now, id);
      if (row.is_fixed) {
        this.db.prepare(`
          INSERT INTO checklist_checkins
            (item_id, local_date, is_completed, completed_at, completed_by, recorded_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(item_id, local_date) DO UPDATE SET
            is_completed = excluded.is_completed,
            completed_at = excluded.completed_at,
            completed_by = excluded.completed_by,
            recorded_by = excluded.recorded_by,
            updated_at = excluded.updated_at
        `).run(id, today, value, doneAt, value ? actor : null, actor, now);
      }
      if (value) {
        this.db.prepare(`
          INSERT INTO todo_completion_history
            (item_id, local_date, body_snapshot, is_fixed, points_snapshot, completed_at, completed_by, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(item_id, local_date) DO UPDATE SET
            body_snapshot = excluded.body_snapshot,
            is_fixed = excluded.is_fixed,
            points_snapshot = excluded.points_snapshot,
            completed_at = excluded.completed_at,
            completed_by = excluded.completed_by,
            revoked_at = NULL
        `).run(id, today, row.body, row.is_fixed, row.points, now, actor);
      } else {
        this.db.prepare(`
          UPDATE todo_completion_history SET revoked_at = ?
          WHERE item_id = ? AND local_date = ? AND revoked_at IS NULL
        `).run(now, id, today);
      }
      if (row.points > 0) {
        this.db.prepare(`
          INSERT INTO todo_point_ledger
            (id, local_date, item_id, reward_id, kind, amount, note, actor, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), today, id, value ? 'task_award' : 'task_reversal',
          value ? row.points : -row.points,
          `${value ? '完成' : '撤销完成'}：${row.body}`,
          actor,
          now,
        );
      }
    });
    return this.get(id);
  }

  archive(id, context = {}) {
    const actor = normalizeActor(context.actor);
    if (actor === 'assistant' && context.confirmed !== true) {
      const error = new Error('Assistant archive requires confirmed=true');
      error.code = 'CONFIRMATION_REQUIRED';
      error.statusCode = 409;
      throw error;
    }
    this.getActiveRow(id);
    const now = this.now();
    this.db.prepare('UPDATE checklist_items SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    return this.get(id);
  }

  runDailyReset() {
    const now = this.now();
    const today = localDate(now, this.timeZone);
    const marker = this.db.prepare("SELECT value FROM settings WHERE key = 'last_daily_reset'").get()?.value;
    if (marker === today) return { reset: false, localDate: today, fixedReset: 0, oneOffArchived: 0 };
    let fixedReset = 0;
    let oneOffArchived = 0;
    this.transaction(() => {
      fixedReset = Number(this.db.prepare(`
        UPDATE checklist_items SET done = 0, done_at = NULL, updated_at = ?
        WHERE archived_at IS NULL AND is_fixed = 1 AND done = 1
      `).run(now).changes);
      oneOffArchived = Number(this.db.prepare(`
        UPDATE checklist_items SET archived_at = ?, updated_at = ?
        WHERE archived_at IS NULL AND is_fixed = 0 AND done = 1 AND created_local_date < ?
      `).run(now, now, today).changes);
      this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_daily_reset', ?)").run(today);
    });
    return { reset: true, localDate: today, fixedReset, oneOffArchived };
  }

  claimDueReminders() {
    const now = this.now();
    let rows = [];
    this.transaction(() => {
      rows = this.db.prepare(`
        UPDATE checklist_items SET notified = 1, updated_at = ?
        WHERE archived_at IS NULL AND trigger_at IS NOT NULL AND trigger_at <= ?
          AND notified = 0 AND done = 0
        RETURNING id, body, trigger_at
      `).all(now, now);
      for (const row of rows) {
        this.db.prepare(`
          INSERT INTO reminder_outbox
            (id, item_id, body, trigger_at, status, attempt_count, claimed_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
        `).run(randomUUID(), row.id, row.body, row.trigger_at, now, now);
      }
    });
    return rows.map((row) => ({ id: row.id, body: row.body, triggerAt: row.trigger_at }));
  }

  tick() {
    const reset = this.runDailyReset();
    const due = this.claimDueReminders();
    const closeout = this.claimDailyCloseout();
    return { reset, dueCount: due.length, due, closeout };
  }

  listOutbox(status = 'pending') {
    const reminderRows = this.db.prepare('SELECT * FROM reminder_outbox WHERE status = ?').all(status).map(toOutbox);
    const closeoutRows = this.db.prepare('SELECT * FROM daily_closeout_outbox WHERE status = ?').all(status).map(toCloseoutOutbox);
    return [...reminderRows, ...closeoutRows].sort((a, b) => a.claimedAt - b.claimedAt);
  }

  completeOutbox(id, result = {}) {
    const now = this.now();
    const row = this.db.prepare('SELECT * FROM reminder_outbox WHERE id = ?').get(id);
    if (!row) return this.completeCloseoutOutbox(id, result);
    const status = result.delivered ? 'delivered' : (now - row.trigger_at <= this.retryWindowMs ? 'failed' : 'expired');
    this.transaction(() => {
      this.db.prepare(`
        UPDATE reminder_outbox SET status = ?, attempt_count = attempt_count + 1,
          updated_at = ?, delivered_at = ?, last_error = ? WHERE id = ?
      `).run(status, now, result.delivered ? now : null, result.error ? String(result.error).slice(0, 500) : null, id);
      if (status === 'failed') {
        this.db.prepare('UPDATE checklist_items SET notified = 0, updated_at = ? WHERE id = ? AND done = 0')
          .run(now, row.item_id);
      }
    });
    return toOutbox(this.db.prepare('SELECT * FROM reminder_outbox WHERE id = ?').get(id));
  }

  claimDailyCloseout() {
    const now = this.now();
    const today = localDate(now, this.timeZone);
    if (localMinuteOfDay(now, this.timeZone) < clockToMinutes(this.closeoutTime)) {
      return { claimed: false, localDate: today, reason: 'before_closeout' };
    }
    const existing = this.db.prepare('SELECT * FROM daily_closeout_outbox WHERE local_date = ?').get(today);
    if (existing) {
      if (existing.status === 'failed' && now - existing.updated_at >= this.retryWindowMs) {
        this.db.prepare(`
          UPDATE daily_closeout_outbox SET status = 'pending', updated_at = ? WHERE id = ?
        `).run(now, existing.id);
        return { claimed: true, localDate: today, id: existing.id, retry: true };
      }
      return { claimed: false, localDate: today, reason: existing.status };
    }
    const items = this.list().filter((item) => !item.done).map((item) => ({
      id: item.id,
      body: item.body,
      isFixed: item.isFixed,
      points: item.points,
    }));
    if (!items.length) return { claimed: false, localDate: today, reason: 'all_done' };
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO daily_closeout_outbox
        (id, local_date, scheduled_at, snapshot_json, status, attempt_count, claimed_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(id, today, now, JSON.stringify(items), now, now);
    return { claimed: true, localDate: today, id, itemCount: items.length };
  }

  completeCloseoutOutbox(id, result = {}) {
    const now = this.now();
    const row = this.db.prepare('SELECT * FROM daily_closeout_outbox WHERE id = ?').get(id);
    if (!row) throw notFound('Todo outbox item not found');
    const status = result.delivered ? 'delivered' : 'failed';
    this.db.prepare(`
      UPDATE daily_closeout_outbox SET status = ?, attempt_count = attempt_count + 1,
        updated_at = ?, delivered_at = ?, last_error = ? WHERE id = ?
    `).run(status, now, result.delivered ? now : null, result.error ? String(result.error).slice(0, 500) : null, id);
    return toCloseoutOutbox(this.db.prepare('SELECT * FROM daily_closeout_outbox WHERE id = ?').get(id));
  }

  pointsSummary(options = {}) {
    const limit = clampInteger(options.limit, 30, 1, 200);
    const balance = Number(this.db.prepare('SELECT COALESCE(SUM(amount), 0) AS balance FROM todo_point_ledger').get().balance);
    const ledger = this.db.prepare(`
      SELECT * FROM todo_point_ledger ORDER BY created_at DESC LIMIT ?
    `).all(limit).map(toLedgerEntry);
    return { balance, ledger };
  }

  listRewards(options = {}) {
    const includeArchived = options.includeArchived === true;
    const balance = this.pointsSummary({ limit: 1 }).balance;
    return this.db.prepare(`
      SELECT * FROM todo_rewards ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY archived_at IS NOT NULL, obtained_at IS NOT NULL, created_at ASC
    `).all().map((row) => toReward(row, balance));
  }

  createReward(input, context = {}) {
    const actor = normalizeActor(context.actor);
    const now = this.now();
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO todo_rewards
        (id, name, description, cost, created_by, created_at, updated_at, obtained_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(id, normalizeRewardName(input.name), normalizeDescription(input.description), normalizePoints(input.cost, 0), actor, now, now);
    return this.getReward(id);
  }

  updateReward(id, patch, context = {}) {
    normalizeActor(context.actor);
    const current = this.getActiveRewardRow(id);
    if (current.obtained_at !== null) throw badRequest('Obtained rewards cannot be edited');
    const now = this.now();
    const name = Object.hasOwn(patch, 'name') ? normalizeRewardName(patch.name) : current.name;
    const description = Object.hasOwn(patch, 'description') ? normalizeDescription(patch.description) : current.description;
    const cost = Object.hasOwn(patch, 'cost') ? normalizePoints(patch.cost, 0) : current.cost;
    this.db.prepare('UPDATE todo_rewards SET name = ?, description = ?, cost = ?, updated_at = ? WHERE id = ?')
      .run(name, description, cost, now, id);
    return this.getReward(id);
  }

  redeemReward(id, context = {}) {
    const actor = normalizeActor(context.actor);
    if (actor === 'assistant' && context.confirmed !== true) {
      const error = new Error('Assistant reward redemption requires confirmed=true');
      error.code = 'CONFIRMATION_REQUIRED';
      error.statusCode = 409;
      throw error;
    }
    const row = this.getActiveRewardRow(id);
    if (row.obtained_at !== null) throw badRequest('Reward has already been obtained');
    const now = this.now();
    const today = localDate(now, this.timeZone);
    const balance = this.pointsSummary({ limit: 1 }).balance;
    if (balance < row.cost) {
      const error = new Error('Not enough points for this reward');
      error.code = 'INSUFFICIENT_POINTS';
      error.statusCode = 409;
      throw error;
    }
    this.transaction(() => {
      this.db.prepare('UPDATE todo_rewards SET obtained_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      if (row.cost > 0) {
        this.db.prepare(`
          INSERT INTO todo_point_ledger
            (id, local_date, item_id, reward_id, kind, amount, note, actor, created_at)
          VALUES (?, ?, NULL, ?, 'reward_redeem', ?, ?, ?, ?)
        `).run(randomUUID(), today, id, -row.cost, `兑换：${row.name}`, actor, now);
      }
    });
    return this.getReward(id);
  }

  archiveReward(id, context = {}) {
    const actor = normalizeActor(context.actor);
    if (actor === 'assistant' && context.confirmed !== true) {
      const error = new Error('Assistant reward archive requires confirmed=true');
      error.code = 'CONFIRMATION_REQUIRED';
      error.statusCode = 409;
      throw error;
    }
    this.getActiveRewardRow(id);
    const now = this.now();
    this.db.prepare('UPDATE todo_rewards SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    return this.getReward(id);
  }

  restoreReward(id, context = {}) {
    normalizeActor(context.actor);
    const row = this.db.prepare('SELECT * FROM todo_rewards WHERE id = ?').get(id);
    if (!row) throw notFound('Reward not found');
    if (row.archived_at === null) return this.getReward(id);
    const now = this.now();
    this.db.prepare('UPDATE todo_rewards SET archived_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    return this.getReward(id);
  }

  getReward(id) {
    const row = this.db.prepare('SELECT * FROM todo_rewards WHERE id = ?').get(id);
    if (!row) throw notFound('Reward not found');
    return toReward(row, this.pointsSummary({ limit: 1 }).balance);
  }

  getActiveRewardRow(id) {
    const row = this.db.prepare('SELECT * FROM todo_rewards WHERE id = ? AND archived_at IS NULL').get(id);
    if (!row) throw notFound('Active reward not found');
    return row;
  }

  calendarMonth(month) {
    const normalizedMonth = normalizeMonth(month || localDate(this.now(), this.timeZone).slice(0, 7));
    const first = `${normalizedMonth}-01`;
    const lastExclusive = `${monthAfter(normalizedMonth)}-01`;
    const rows = this.completionRows(first, lastExclusive);
    const totals = this.receiptTotals(first, lastExclusive);
    const byDate = new Map();
    for (const row of rows) {
      const day = byDate.get(row.localDate) || { localDate: row.localDate, completedCount: 0, fixedCount: 0, pointsEarned: 0, items: [] };
      day.completedCount += 1;
      if (row.isFixed) day.fixedCount += 1;
      day.pointsEarned += row.points;
      day.items.push(row);
      byDate.set(row.localDate, day);
    }
    for (const day of byDate.values()) {
      day.totalCount = totals.get(day.localDate) || 0;
      day.isPaid = day.totalCount > 0 && day.completedCount >= day.totalCount;
    }
    return { month: normalizedMonth, days: [...byDate.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)) };
  }

  dayReceipt(date) {
    const normalizedDate = normalizeDate(date || localDate(this.now(), this.timeZone));
    const rows = this.completionRows(normalizedDate, addLocalDays(normalizedDate, 1));
    const earned = rows.reduce((sum, row) => sum + row.points, 0);
    const totalCount = this.receiptTotals(normalizedDate, addLocalDays(normalizedDate, 1)).get(normalizedDate) || 0;
    return {
      localDate: normalizedDate,
      completedCount: rows.length,
      totalCount,
      isPaid: totalCount > 0 && rows.length >= totalCount,
      pointsEarned: earned,
      items: rows,
    };
  }

  receiptTotals(first, lastExclusive) {
    const items = this.db.prepare(`
      SELECT id, is_fixed, created_local_date, archived_at FROM checklist_items
      ORDER BY created_at ASC
    `).all();
    const completions = this.db.prepare(`
      SELECT item_id, local_date FROM todo_completion_history
      WHERE revoked_at IS NULL ORDER BY local_date ASC
    `).all();
    const completionKeys = new Set(completions.map((row) => `${row.item_id}:${row.local_date}`));
    const firstCompletion = new Map();
    for (const row of completions) {
      if (!firstCompletion.has(row.item_id)) firstCompletion.set(row.item_id, row.local_date);
    }
    const totals = new Map();
    for (let date = first; date < lastExclusive; date = addLocalDays(date, 1)) {
      let count = 0;
      for (const item of items) {
        if (item.created_local_date > date) continue;
        const archivedDate = item.archived_at === null ? null : localDate(item.archived_at, this.timeZone);
        const completedOnDate = completionKeys.has(`${item.id}:${date}`);
        if (item.is_fixed === 1) {
          if (!archivedDate || date < archivedDate || completedOnDate) count += 1;
          continue;
        }
        const completedDate = firstCompletion.get(item.id);
        if (completedDate) {
          if (date <= completedDate) count += 1;
        } else if (!archivedDate || date < archivedDate) {
          count += 1;
        }
      }
      totals.set(date, count);
    }
    return totals;
  }

  completionRows(first, lastExclusive) {
    const primary = this.db.prepare(`
      SELECT item_id, local_date, body_snapshot, is_fixed, points_snapshot, completed_at, completed_by
      FROM todo_completion_history
      WHERE local_date >= ? AND local_date < ? AND revoked_at IS NULL
      ORDER BY local_date ASC, completed_at ASC
    `).all(first, lastExclusive).map(toCompletion);
    const keys = new Set(primary.map((row) => `${row.itemId}:${row.localDate}`));
    const legacy = this.db.prepare(`
      SELECT c.item_id, c.local_date, i.body AS body_snapshot, 1 AS is_fixed,
             0 AS points_snapshot, c.completed_at, COALESCE(c.completed_by, c.recorded_by, 'user') AS completed_by
      FROM checklist_checkins c JOIN checklist_items i ON i.id = c.item_id
      WHERE c.local_date >= ? AND c.local_date < ? AND c.is_completed = 1
      ORDER BY c.local_date ASC, c.completed_at ASC
    `).all(first, lastExclusive).map(toCompletion).filter((row) => !keys.has(`${row.itemId}:${row.localDate}`));
    return [...primary, ...legacy].sort((a, b) => a.completedAt - b.completedAt);
  }

  monthlyStats(id, month) {
    const item = this.get(id);
    if (!item.isFixed) throw badRequest('Monthly check-ins are only available for fixed daily items');
    const normalizedMonth = normalizeMonth(month || localDate(this.now(), this.timeZone).slice(0, 7));
    const first = `${normalizedMonth}-01`;
    const lastExclusive = `${monthAfter(normalizedMonth)}-01`;
    const rows = this.db.prepare(`
      SELECT local_date, is_completed, completed_at, completed_by, recorded_by
      FROM checklist_checkins WHERE item_id = ? AND local_date >= ? AND local_date < ?
      ORDER BY local_date ASC
    `).all(id, first, lastExclusive);
    const completedDates = rows.filter((row) => row.is_completed === 1).map((row) => row.local_date);
    const today = localDate(this.now(), this.timeZone);
    const monthEnd = addLocalDays(lastExclusive, -1);
    const eligibleStart = item.createdLocalDate > first ? item.createdLocalDate : first;
    const eligibleEnd = today < monthEnd ? today : monthEnd;
    const eligibleDays = eligibleEnd < eligibleStart ? 0 : dateToDayNumber(eligibleEnd) - dateToDayNumber(eligibleStart) + 1;
    return {
      item,
      month: normalizedMonth,
      completedDays: completedDates.length,
      eligibleDays,
      completionRate: eligibleDays ? completedDates.length / eligibleDays : 0,
      currentStreak: calculateCurrentStreak(completedDates, today),
      longestStreak: calculateLongestStreak(completedDates),
      days: rows.map((row) => ({
        localDate: row.local_date,
        completed: row.is_completed === 1,
        completedAt: row.completed_at,
        completedBy: row.completed_by,
        recordedBy: row.recorded_by,
      })),
    };
  }

  nextPosition(isFixed) {
    return Number(this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM checklist_items WHERE archived_at IS NULL AND is_fixed = ?').get(isFixed).position);
  }

  getActiveRow(id) {
    const row = this.db.prepare('SELECT * FROM checklist_items WHERE id = ? AND archived_at IS NULL').get(id);
    if (!row) throw notFound('Active todo item not found');
    return row;
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  toItem(row) {
    return {
      id: row.id,
      body: row.body,
      isFixed: row.is_fixed === 1,
      done: row.done === 1,
      doneAt: row.done_at,
      position: row.position,
      points: row.points,
      createdBy: row.created_by,
      createdVia: row.created_via,
      triggerAt: row.trigger_at,
      notified: row.notified === 1,
      overdue: row.trigger_at !== null && row.trigger_at <= this.now() && row.done === 0,
      createdLocalDate: row.created_local_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
    };
  }
}

function normalizeActor(actor) {
  if (actor !== 'user' && actor !== 'assistant') throw badRequest('actor must be supplied by a trusted adapter');
  return actor;
}
function normalizeVia(via) {
  const value = String(via || 'unknown').trim();
  return value ? value.slice(0, 80) : 'unknown';
}
function normalizeBody(body) {
  const value = String(body || '').trim();
  if (!value) throw badRequest('body is required');
  if (value.length > 500) throw badRequest('body must not exceed 500 characters');
  return value;
}
function normalizeRewardName(name) {
  const value = String(name || '').trim();
  if (!value) throw badRequest('reward name is required');
  if (value.length > 120) throw badRequest('reward name must not exceed 120 characters');
  return value;
}
function normalizeDescription(description) {
  const value = String(description || '').trim();
  if (value.length > 500) throw badRequest('description must not exceed 500 characters');
  return value;
}
function normalizePoints(value, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest('points must be supplied');
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 999) throw badRequest('points must be an integer from 0 to 999');
  return number;
}
function normalizeDate(date) {
  const value = String(date || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) throw badRequest('date must use YYYY-MM-DD');
  return value;
}
function normalizeClock(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) throw badRequest('closeoutTime must use HH:MM');
  return `${match[1]}:${match[2]}`;
}
function clockToMinutes(value) { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; }
function localMinuteOfDay(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return values.hour * 60 + values.minute;
}
function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
function toBooleanInt(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw badRequest('boolean value expected');
}
function normalizeMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw badRequest('month must use YYYY-MM');
  return String(month);
}
function monthAfter(month) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7);
}
function calculateCurrentStreak(completedDates, today) {
  const set = new Set(completedDates);
  let cursor = set.has(today) ? today : addLocalDays(today, -1);
  let count = 0;
  while (set.has(cursor)) { count += 1; cursor = addLocalDays(cursor, -1); }
  return count;
}
function calculateLongestStreak(completedDates) {
  const days = [...new Set(completedDates)].map(dateToDayNumber).sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const day of days) {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}
function toOutbox(row) {
  return {
    kind: 'reminder',
    id: row.id, itemId: row.item_id, body: row.body, triggerAt: row.trigger_at,
    status: row.status, attemptCount: row.attempt_count, claimedAt: row.claimed_at,
    updatedAt: row.updated_at, deliveredAt: row.delivered_at, lastError: row.last_error,
  };
}
function toCloseoutOutbox(row) {
  let items = [];
  try { items = JSON.parse(row.snapshot_json); } catch { items = []; }
  return {
    id: row.id, kind: 'daily_closeout', localDate: row.local_date, items,
    triggerAt: row.scheduled_at, status: row.status, attemptCount: row.attempt_count,
    claimedAt: row.claimed_at, updatedAt: row.updated_at, deliveredAt: row.delivered_at,
    lastError: row.last_error,
  };
}
function toCompletion(row) {
  return {
    itemId: row.item_id,
    localDate: row.local_date,
    body: row.body_snapshot,
    isFixed: row.is_fixed === 1,
    points: row.points_snapshot,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
  };
}
function toLedgerEntry(row) {
  return {
    id: row.id, localDate: row.local_date, itemId: row.item_id, rewardId: row.reward_id,
    kind: row.kind, amount: row.amount, note: row.note, actor: row.actor, createdAt: row.created_at,
  };
}
function toReward(row, balance) {
  const archived = row.archived_at !== null;
  const obtained = row.obtained_at !== null;
  return {
    id: row.id, name: row.name, description: row.description, cost: row.cost,
    status: archived ? 'archived' : obtained ? 'obtained' : balance >= row.cost ? 'available' : 'wanted',
    affordable: !archived && !obtained && balance >= row.cost,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    obtainedAt: row.obtained_at, archivedAt: row.archived_at,
  };
}
function badRequest(message) {
  const error = new Error(message); error.statusCode = 400; error.code = 'BAD_REQUEST'; return error;
}
function notFound(message) {
  const error = new Error(message); error.statusCode = 404; error.code = 'NOT_FOUND'; return error;
}

module.exports = { ChecklistService };
