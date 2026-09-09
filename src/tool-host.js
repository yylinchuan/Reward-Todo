function createTodoToolHost(service) {
  const tools = [
    tool('todo_status', '查看待办服务状态和数量。只读。', {}, () => ({
      ok: true,
      activeCount: service.list().length,
      pendingReminderCount: service.listOutbox().length,
      rewardCount: service.listRewards().length,
      pointsBalance: service.pointsSummary({ limit: 1 }).balance,
      closeoutTime: service.closeoutTime,
      timeZone: service.timeZone,
    })),
    tool('todo_list', '列出当前待办、固定日常和提醒。只读。', {
      type: 'object', properties: { includeArchived: { type: 'boolean', description: '是否包含已归档项目，默认 false。' } }, additionalProperties: false,
    }, (args) => service.list({ includeArchived: args.includeArchived === true })),
    tool('todo_create', '新建待办。用户明确提出长期每天做时设 isFixed=true；有 at/inMinutes 的项目自动成为一次性提醒。可设置完成后获得的 points。', {
      type: 'object', required: ['body'], additionalProperties: false,
      properties: {
        body: { type: 'string', maxLength: 500, description: '简洁明确的待办正文。' },
        isFixed: { type: 'boolean', description: '是否为每天重置但保留打卡历史的固定日常。' },
        at: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$', description: 'Asia/Shanghai 本地时间 HH:MM；已过则顺延明天。' },
        inMinutes: { type: 'number', exclusiveMinimum: 0, description: '多少分钟后提醒。' },
        triggerAt: { type: ['number', 'null'], description: '绝对毫秒时间戳或 null。' },
        points: { type: 'integer', minimum: 0, maximum: 999, description: '明确完成后获得的积分；默认 1。' },
      },
    }, (args) => service.create(args, assistantContext())),
    tool('todo_update', '修改待办正文、固定日常属性或提醒时间。不要用来代替完成打卡。', {
      type: 'object', required: ['id'], additionalProperties: false,
      properties: {
        id: { type: 'string' }, body: { type: 'string', maxLength: 500 }, isFixed: { type: 'boolean' },
        at: { type: 'string' }, inMinutes: { type: 'number', exclusiveMinimum: 0 }, triggerAt: { type: ['number', 'null'] },
        points: { type: 'integer', minimum: 0, maximum: 999 },
      },
    }, (args) => {
      const { id, ...patch } = args;
      return service.update(id, patch, assistantContext());
    }),
    tool('todo_set_done', '设置待办完成状态。只有用户明确说已经完成时才能传 done=true，不得根据推测代打卡。', {
      type: 'object', required: ['id', 'done'], additionalProperties: false,
      properties: { id: { type: 'string' }, done: { type: 'boolean' } },
    }, (args) => service.setDone(args.id, args.done, assistantContext())),
    tool('todo_archive', '归档待办并保留历史。助手归档必须得到用户本轮明确确认，并传 confirmed=true。', {
      type: 'object', required: ['id', 'confirmed'], additionalProperties: false,
      properties: { id: { type: 'string' }, confirmed: { type: 'boolean', description: '用户是否在本轮明确确认归档。' } },
    }, (args) => service.archive(args.id, { ...assistantContext(), confirmed: args.confirmed === true })),
    tool('todo_month', '查看一个固定日常在指定月份完成了几天、完成率和连续天数。只读。', {
      type: 'object', required: ['id'], additionalProperties: false,
      properties: { id: { type: 'string' }, month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM，默认当前月。' } },
    }, (args) => service.monthlyStats(args.id, args.month)),
    tool('todo_calendar', '查看一个月内实际完成的任务。一次性任务只落在实际完成日；只读。', {
      type: 'object', properties: {
        month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM，默认当前月。' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '传入日期时返回当天小票详情。' },
      }, additionalProperties: false,
    }, (args) => args.date ? service.dayReceipt(args.date) : service.calendarMonth(args.month)),
    tool('todo_points', '查看当前积分余额和最近积分流水。只读。', {
      type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } }, additionalProperties: false,
    }, (args) => service.pointsSummary({ limit: args.limit })),
    tool('todo_rewards', '管理奖励柜。list 只读；create/update/restore 写入；redeem/archive 必须在用户本轮明确确认后传 confirmed=true。', {
      type: 'object', required: ['action'], additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'redeem', 'archive', 'restore'] },
        id: { type: 'string' },
        name: { type: 'string', maxLength: 120 },
        description: { type: 'string', maxLength: 500 },
        cost: { type: 'integer', minimum: 0, maximum: 999 },
        includeArchived: { type: 'boolean' },
        confirmed: { type: 'boolean' },
      },
    }, (args) => {
      if (args.action === 'list') return service.listRewards({ includeArchived: args.includeArchived === true });
      if (args.action === 'create') return service.createReward(args, assistantContext());
      if (args.action === 'update') return service.updateReward(args.id, args, assistantContext());
      if (args.action === 'redeem') return service.redeemReward(args.id, { ...assistantContext(), confirmed: args.confirmed === true });
      if (args.action === 'archive') return service.archiveReward(args.id, { ...assistantContext(), confirmed: args.confirmed === true });
      if (args.action === 'restore') return service.restoreReward(args.id, assistantContext());
      throw new Error('Unknown reward action');
    }),
  ];
  const byName = new Map(tools.map((entry) => [entry.name, entry]));
  return {
    listTools: () => tools.map(({ invoke, ...definition }) => definition),
    invokeTool(name, args = {}) {
      const entry = byName.get(name);
      if (!entry) throw new Error(`Unknown todo tool: ${name}`);
      return entry.invoke(args);
    },
  };
}

function tool(name, description, inputSchema, invoke) {
  return { name, description, inputSchema: inputSchema.type ? inputSchema : { type: 'object', properties: inputSchema, additionalProperties: false }, invoke };
}
function assistantContext() { return { actor: 'assistant', via: 'mcp' }; }

module.exports = { createTodoToolHost };
