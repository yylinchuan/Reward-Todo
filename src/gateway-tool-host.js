const { runAssistantAction } = require('./http-server');

const ACTIONS = [
  'status', 'list', 'create', 'update', 'set_done', 'archive',
  'month', 'calendar', 'day', 'points',
  'reward_list', 'reward_create', 'reward_update', 'reward_redeem',
  'reward_archive', 'reward_restore',
];

const TOOL = {
  name: 'reward_todo_manage',
  description: [
    '管理本地小票待办、每日打卡、完成日历、积分和奖励柜。',
    '查询用 status/list/month/calendar/day/points/reward_list；',
    '写入用 create/update/set_done/reward_create/reward_update/reward_restore；',
    '只有用户在本轮明确确认后，archive/reward_redeem/reward_archive 才能传 confirmed=true。',
    '不得根据推测替用户完成任务或兑换奖励。',
  ].join(''),
  inputSchema: {
    type: 'object',
    required: ['action'],
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ACTIONS },
      id: { type: 'string', description: '修改、完成、归档、月统计或奖励操作的对象 ID。' },
      body: { type: 'string', maxLength: 500, description: '待办正文。' },
      isFixed: { type: 'boolean', description: '是否为每天重置、保留历史的固定打卡。' },
      done: { type: 'boolean', description: '只有用户明确说已完成时才能设为 true。' },
      at: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$', description: '本地提醒时间 HH:MM。' },
      inMinutes: { type: 'number', exclusiveMinimum: 0, description: '多少分钟后提醒。' },
      triggerAt: { type: ['number', 'null'], description: '绝对毫秒时间戳；null 表示取消提醒。' },
      points: { type: 'integer', minimum: 0, maximum: 999, description: '完成任务获得的积分。' },
      month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: '月份 YYYY-MM。' },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '日期 YYYY-MM-DD。' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      name: { type: 'string', maxLength: 120, description: '奖励名称。' },
      description: { type: 'string', maxLength: 500, description: '奖励备注。' },
      cost: { type: 'integer', minimum: 0, maximum: 999, description: '兑换奖励需要的积分。' },
      includeArchived: { type: 'boolean' },
      confirmed: { type: 'boolean', description: '仅在用户本轮明确确认危险操作时传 true。' },
    },
  },
};

function createGatewayToolHost(service) {
  return {
    listTools: () => [TOOL],
    invokeTool(name, args = {}) {
      if (name !== TOOL.name) throw new Error(`Unknown todo tool: ${name}`);
      validate(args);
      return runAssistantAction(service, args);
    },
  };
}

function validate(args) {
  const action = String(args.action || '').trim();
  if (!ACTIONS.includes(action)) throw badRequest('请选择有效的 action。');
  if (['update', 'set_done', 'archive', 'month', 'reward_update', 'reward_redeem', 'reward_archive', 'reward_restore'].includes(action) && !String(args.id || '').trim()) {
    throw badRequest(`${action} 需要 id。`);
  }
  if (action === 'create' && !String(args.body || '').trim()) throw badRequest('create 需要 body。');
  if (action === 'reward_create' && !String(args.name || '').trim()) throw badRequest('reward_create 需要 name。');
  if (['archive', 'reward_redeem', 'reward_archive'].includes(action) && args.confirmed !== true) {
    throw badRequest('该操作需要用户在本轮明确确认，并传 confirmed=true。');
  }
  if (action === 'set_done' && typeof args.done !== 'boolean') throw badRequest('set_done 需要布尔值 done。');
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

module.exports = { ACTIONS, createGatewayToolHost };
