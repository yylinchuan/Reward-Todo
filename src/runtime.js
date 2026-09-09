const { loadConfig } = require('./config');
const { openDatabase } = require('./database');
const { ChecklistService } = require('./checklist-service');

function createRuntime(env = process.env) {
  const config = loadConfig(env);
  const database = openDatabase(config.databaseFile);
  const service = new ChecklistService(database, {
    timeZone: config.timeZone,
    reminderRetryMinutes: config.reminderRetryMinutes,
    closeoutTime: config.closeoutTime,
  });
  return { config, database, service };
}

module.exports = { createRuntime };
