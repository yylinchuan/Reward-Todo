const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function createHttpServer(service, options = {}) {
  const webRoot = path.resolve(options.webRoot || path.join(__dirname, '..', 'web', 'dist'));
  const publicConfig = {
    userName: options.config?.userName || '你',
    assistantName: options.config?.assistantName || '搭档',
    appName: options.config?.appName || 'REWARD TODO',
    reminderDelivery: options.config?.reminderDelivery || 'not_checked',
  };
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, { ok: true, service: 'reward-todo', timeZone: service.timeZone });
      }
      if (request.method === 'GET' && url.pathname === '/api/config') {
        return json(response, 200, publicConfig);
      }
      if (request.method === 'GET' && url.pathname === '/api/items') {
        return json(response, 200, { items: service.list({ includeArchived: url.searchParams.get('archived') === '1' }) });
      }
      if (request.method === 'GET' && url.pathname === '/api/calendar') {
        return json(response, 200, service.calendarMonth(url.searchParams.get('month') || undefined));
      }
      if (request.method === 'GET' && url.pathname === '/api/day') {
        return json(response, 200, service.dayReceipt(url.searchParams.get('date') || undefined));
      }
      if (request.method === 'GET' && url.pathname === '/api/points') {
        return json(response, 200, service.pointsSummary({ limit: Number(url.searchParams.get('limit')) || undefined }));
      }
      if (request.method === 'GET' && url.pathname === '/api/rewards') {
        return json(response, 200, { items: service.listRewards({ includeArchived: url.searchParams.get('archived') === '1' }) });
      }
      if (request.method === 'POST' && url.pathname === '/api/rewards') {
        return json(response, 201, service.createReward(await readJson(request), userContext()));
      }
      if (request.method === 'POST' && url.pathname === '/api/items') {
        return json(response, 201, service.create(await readJson(request), userContext()));
      }
      if (request.method === 'POST' && url.pathname === '/api/tick') {
        return json(response, 200, service.tick());
      }
      if (request.method === 'POST' && url.pathname === '/api/assistant/action') {
        return json(response, 200, runAssistantAction(service, await readJson(request)));
      }
      if (request.method === 'GET' && url.pathname === '/api/outbox') {
        return json(response, 200, { items: service.listOutbox(url.searchParams.get('status') || 'pending') });
      }

      const monthMatch = /^\/api\/items\/([^/]+)\/month$/.exec(url.pathname);
      if (request.method === 'GET' && monthMatch) {
        return json(response, 200, service.monthlyStats(decodeURIComponent(monthMatch[1]), url.searchParams.get('month') || undefined));
      }
      const rewardRedeemMatch = /^\/api\/rewards\/([^/]+)\/redeem$/.exec(url.pathname);
      if (request.method === 'POST' && rewardRedeemMatch) {
        return json(response, 200, service.redeemReward(decodeURIComponent(rewardRedeemMatch[1]), userContext()));
      }
      const rewardArchiveMatch = /^\/api\/rewards\/([^/]+)\/archive$/.exec(url.pathname);
      if (request.method === 'POST' && rewardArchiveMatch) {
        return json(response, 200, service.archiveReward(decodeURIComponent(rewardArchiveMatch[1]), userContext()));
      }
      const rewardRestoreMatch = /^\/api\/rewards\/([^/]+)\/restore$/.exec(url.pathname);
      if (request.method === 'POST' && rewardRestoreMatch) {
        return json(response, 200, service.restoreReward(decodeURIComponent(rewardRestoreMatch[1]), userContext()));
      }
      const rewardMatch = /^\/api\/rewards\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'PATCH' && rewardMatch) {
        return json(response, 200, service.updateReward(decodeURIComponent(rewardMatch[1]), await readJson(request), userContext()));
      }
      const doneMatch = /^\/api\/items\/([^/]+)\/done$/.exec(url.pathname);
      if (request.method === 'POST' && doneMatch) {
        const body = await readJson(request);
        return json(response, 200, service.setDone(decodeURIComponent(doneMatch[1]), body.done, userContext()));
      }
      const archiveMatch = /^\/api\/items\/([^/]+)\/archive$/.exec(url.pathname);
      if (request.method === 'POST' && archiveMatch) {
        return json(response, 200, service.archive(decodeURIComponent(archiveMatch[1]), userContext()));
      }
      const itemMatch = /^\/api\/items\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'PATCH' && itemMatch) {
        return json(response, 200, service.update(decodeURIComponent(itemMatch[1]), await readJson(request), userContext()));
      }
      const outboxMatch = /^\/api\/outbox\/([^/]+)\/complete$/.exec(url.pathname);
      if (request.method === 'POST' && outboxMatch) {
        return json(response, 200, service.completeOutbox(decodeURIComponent(outboxMatch[1]), await readJson(request)));
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/todo')) {
        return staticFile(response, path.join(webRoot, 'index.html'), request.method === 'HEAD');
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/assets/')) {
        const relative = decodeURIComponent(url.pathname.slice(1)).replaceAll('/', path.sep);
        const candidate = path.resolve(webRoot, relative);
        if (!candidate.startsWith(`${webRoot}${path.sep}`)) return json(response, 404, { error: 'Not found' });
        return staticFile(response, candidate, request.method === 'HEAD');
      }
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      return json(response, error.statusCode || 500, { error: error.message, code: error.code || 'INTERNAL_ERROR' });
    }
  });
}

function staticFile(response, filePath, headOnly = false) {
  let stat;
  try { stat = fs.statSync(filePath); }
  catch { return json(response, 503, { error: 'Reward-Todo frontend is not built yet. Run npm run web:build.' }); }
  if (!stat.isFile()) return json(response, 404, { error: 'Not found' });
  const extension = path.extname(filePath).toLowerCase();
  const contentType = ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  })[extension] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  if (headOnly) return response.end();
  fs.createReadStream(filePath).pipe(response);
}

function userContext() { return { actor: 'user', via: 'dashboard' }; }
function assistantContext(extra = {}) { return { actor: 'assistant', via: 'cyberboss', ...extra }; }

function runAssistantAction(service, input) {
  const action = String(input.action || '').trim();
  if (action === 'status') return {
    ok: true,
    activeCount: service.list().length,
    pendingReminderCount: service.listOutbox().length,
    rewardCount: service.listRewards().length,
    pointsBalance: service.pointsSummary({ limit: 1 }).balance,
    closeoutTime: service.closeoutTime,
    timeZone: service.timeZone,
  };
  if (action === 'list') return { items: service.list({ includeArchived: input.includeArchived === true }) };
  if (action === 'create') return service.create(input, assistantContext());
  if (action === 'update') return service.update(input.id, input, assistantContext());
  if (action === 'set_done') return service.setDone(input.id, input.done, assistantContext());
  if (action === 'archive') return service.archive(input.id, assistantContext({ confirmed: input.confirmed === true }));
  if (action === 'month') return service.monthlyStats(input.id, input.month);
  if (action === 'calendar') return service.calendarMonth(input.month);
  if (action === 'day') return service.dayReceipt(input.date);
  if (action === 'points') return service.pointsSummary({ limit: input.limit });
  if (action === 'reward_list') return { items: service.listRewards({ includeArchived: input.includeArchived === true }) };
  if (action === 'reward_create') return service.createReward(input, assistantContext());
  if (action === 'reward_update') return service.updateReward(input.id, input, assistantContext());
  if (action === 'reward_redeem') return service.redeemReward(input.id, assistantContext({ confirmed: input.confirmed === true }));
  if (action === 'reward_archive') return service.archiveReward(input.id, assistantContext({ confirmed: input.confirmed === true }));
  if (action === 'reward_restore') return service.restoreReward(input.id, assistantContext());
  const error = new Error('Unknown assistant todo action'); error.statusCode = 400; throw error;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        const error = new Error('JSON body is too large'); error.statusCode = 413; reject(error); request.destroy(); return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { const error = new Error('Invalid JSON body'); error.statusCode = 400; reject(error); }
    });
    request.on('error', reject);
  });
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

module.exports = { createHttpServer, runAssistantAction };
