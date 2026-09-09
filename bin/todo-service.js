#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime } = require('../src/runtime');
const { createHttpServer } = require('../src/http-server');
const { createTodoToolHost } = require('../src/tool-host');
const { createGatewayToolHost } = require('../src/gateway-tool-host');
const { runMcpServer } = require('../src/mcp-server');

async function main() {
  const command = process.argv[2] || 'status';
  const runtime = createRuntime();
  if (command === 'serve') {
    const server = createHttpServer(runtime.service, { config: runtime.config });
    server.listen(runtime.config.port, runtime.config.host, () => {
      process.stderr.write(`[reward-todo] http://${runtime.config.host}:${runtime.config.port} database=${runtime.config.databaseFile}\n`);
    });
    return;
  }
  if (command === 'mcp') return runMcpServer(createTodoToolHost(runtime.service));
  if (command === 'mcp-gateway') return runMcpServer(createGatewayToolHost(runtime.service));
  if (command === 'tick') return print(runtime.service.tick());
  if (command === 'backup') {
    const backupDir = path.join(runtime.config.stateDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `checklist-${stamp}.sqlite`);
    runtime.database.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
    return print({ ok: true, backupFile, sourceDatabaseFile: runtime.config.databaseFile });
  }
  if (command === 'status') {
    return print({
      ok: true,
      databaseFile: runtime.config.databaseFile,
      timeZone: runtime.config.timeZone,
      activeCount: runtime.service.list().length,
      pendingReminderCount: runtime.service.listOutbox().length,
      rewardCount: runtime.service.listRewards().length,
      pointsBalance: runtime.service.pointsSummary({ limit: 1 }).balance,
      closeoutTime: runtime.service.closeoutTime,
      quickCheck: runtime.database.prepare('PRAGMA quick_check').all().map((row) => row.quick_check),
    });
  }
  throw new Error(`Unknown command: ${command}`);
}

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
