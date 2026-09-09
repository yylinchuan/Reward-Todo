const fs = require('node:fs');

function runMcpServer(toolHost) {
  const reader = createReader(process.stdin);
  reader.onMessage(async (message) => {
    if (!message || typeof message !== 'object') return;
    const { id, method } = message;
    const params = message.params || {};
    try {
      if (method === 'initialize') {
        return writeResult(id, {
          protocolVersion: params.protocolVersion || '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'reward-todo', version: '0.1.0' },
        }, reader.mode());
      }
      if (method === 'notifications/initialized') return;
      if (method === 'ping') return writeResult(id, {}, reader.mode());
      if (method === 'tools/list') return writeResult(id, { tools: toolHost.listTools() }, reader.mode());
      if (method === 'tools/call') {
        const value = await toolHost.invokeTool(params.name, params.arguments || {});
        return writeResult(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }, reader.mode());
      }
      return writeError(id, -32601, `Method not found: ${method}`, reader.mode());
    } catch (error) {
      return writeResult(id, {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      }, reader.mode());
    }
  });
}

function createReader(stream) {
  let buffer = Buffer.alloc(0);
  let transport = 'content-length';
  const listeners = new Set();
  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (buffer.length) {
      const boundary = findBoundary(buffer);
      if (boundary >= 0) {
        transport = 'content-length';
        const separatorLength = buffer[boundary] === 13 ? 4 : 2;
        const match = buffer.slice(0, boundary).toString('utf8').match(/Content-Length:\s*(\d+)/i);
        if (!match) { buffer = Buffer.alloc(0); return; }
        const length = Number(match[1]);
        const start = boundary + separatorLength;
        if (buffer.length < start + length) return;
        emit(buffer.slice(start, start + length).toString('utf8'), listeners);
        buffer = buffer.slice(start + length);
        continue;
      }
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline).toString('utf8').trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      transport = 'jsonl';
      emit(line, listeners);
    }
  });
  return { onMessage: (listener) => listeners.add(listener), mode: () => transport };
}

function emit(value, listeners) {
  try {
    const message = JSON.parse(value);
    for (const listener of listeners) listener(message);
  } catch { /* Ignore malformed transport input. */ }
}
function findBoundary(buffer) {
  const crlf = buffer.indexOf('\r\n\r\n');
  return crlf >= 0 ? crlf : buffer.indexOf('\n\n');
}
function writeResult(id, result, mode) { write({ jsonrpc: '2.0', id, result }, mode); }
function writeError(id, code, message, mode) { write({ jsonrpc: '2.0', id, error: { code, message } }, mode); }
function write(payload, mode) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (mode === 'jsonl') return fs.writeSync(process.stdout.fd, Buffer.concat([body, Buffer.from('\n')]));
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  return fs.writeSync(process.stdout.fd, Buffer.concat([header, body]));
}

module.exports = { runMcpServer };
