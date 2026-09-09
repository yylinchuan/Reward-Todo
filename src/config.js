const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function loadConfig(env = process.env) {
  const portableStateDir = env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA, 'RewardTodo', 'data')
    : path.join(os.homedir(), '.reward-todo');
  const legacyStateDir = path.resolve(__dirname, '..', '..', '.todo-service');
  const defaultStateDir = fs.existsSync(legacyStateDir) ? legacyStateDir : portableStateDir;
  const stateDir = env.TODO_SERVICE_STATE_DIR || defaultStateDir;
  return {
    stateDir,
    databaseFile: env.TODO_SERVICE_DATABASE_FILE || path.join(stateDir, 'checklist.sqlite'),
    host: env.TODO_SERVICE_HOST || '127.0.0.1',
    port: parseInteger(env.TODO_SERVICE_PORT, 3210, 1, 65535),
    timeZone: env.TODO_SERVICE_TIME_ZONE || 'Asia/Shanghai',
    reminderRetryMinutes: parseInteger(env.TODO_SERVICE_REMINDER_RETRY_MINUTES, 15, 1, 1440),
    closeoutTime: normalizeClock(env.TODO_SERVICE_CLOSEOUT_TIME || '21:30'),
    userName: normalizeName(env.TODO_SERVICE_USER_NAME, '你'),
    assistantName: normalizeName(env.TODO_SERVICE_ASSISTANT_NAME, '搭档'),
    appName: normalizeName(env.TODO_SERVICE_APP_NAME, 'REWARD TODO'),
    reminderDelivery: ['ready', 'present_not_enabled', 'not_installed', 'not_checked'].includes(env.TODO_SERVICE_REMINDER_DELIVERY_MODE)
      ? env.TODO_SERVICE_REMINDER_DELIVERY_MODE
      : 'not_checked',
  };
}

function normalizeName(value, fallback) {
  const normalized = String(value || '').trim().replace(/[\r\n\t]/g, ' ').slice(0, 40);
  return normalized || fallback;
}

function normalizeClock(value) {
  const normalized = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : '21:30';
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

module.exports = { loadConfig };
