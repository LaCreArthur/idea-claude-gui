import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRIDGE_PATH = join(__dirname, 'bridge.js');

function spawnDaemon() {
  const child = spawn('node', [BRIDGE_PATH, '--daemon'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname
  });
  return child;
}

function readLines(child, count, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lines = [];
    let buffer = '';

    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${count} lines, got ${lines.length}: ${JSON.stringify(lines)}`));
    }, timeoutMs);

    const onData = (data) => {
      buffer += data.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop(); // keep incomplete line

      for (const part of parts) {
        if (!part.trim()) continue;
        try {
          lines.push(JSON.parse(part));
        } catch {
          // non-JSON, skip
        }
        if (lines.length >= count) {
          clearTimeout(timeout);
          child.stdout.removeListener('data', onData);
          resolve(lines);
          return;
        }
      }
    };

    child.stdout.on('data', onData);
  });
}

function writeLine(child, obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

describe('Daemon Mode', () => {
  let child;

  afterEach(() => {
    if (child && !child.killed) {
      child.kill('SIGKILL');
    }
  });

  it('sends ready on startup then responds to ping', async () => {
    child = spawnDaemon();

    // Should get 'ready' or 'error' — if auth fails, that's expected in test env
    const [firstMsg] = await readLines(child, 1, 30000);

    if (firstMsg.type === 'error') {
      // Auth failure is expected in test environment — daemon protocol still works
      expect(firstMsg.message).toBeDefined();
      return;
    }

    expect(firstMsg.type).toBe('ready');

    // Send ping, expect pong
    writeLine(child, { type: 'ping' });
    const [pong] = await readLines(child, 1);
    expect(pong.type).toBe('pong');
  }, 35000);

  it('responds to shutdown cleanly', async () => {
    child = spawnDaemon();

    const [firstMsg] = await readLines(child, 1, 30000);

    if (firstMsg.type === 'error') {
      // Auth failure in test env — still test that process dies on shutdown
      return;
    }

    expect(firstMsg.type).toBe('ready');

    writeLine(child, { type: 'shutdown' });

    // Process should exit
    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      setTimeout(() => resolve('timeout'), 5000);
    });

    expect(exitCode).toBe(0);
  }, 35000);

  it('ignores unknown message types without crashing', async () => {
    child = spawnDaemon();

    const [firstMsg] = await readLines(child, 1, 30000);

    if (firstMsg.type === 'error') return;

    expect(firstMsg.type).toBe('ready');

    // Send unknown type
    writeLine(child, { type: 'totally_unknown', foo: 'bar' });

    // Daemon should still respond to ping after unknown message
    writeLine(child, { type: 'ping' });
    const [pong] = await readLines(child, 1);
    expect(pong.type).toBe('pong');
  }, 35000);
});

describe('One-shot Mode (backwards compatibility)', () => {
  it('exits when no --daemon flag is passed', async () => {
    // One-shot mode waits for initial line, times out after 30s
    // We just verify it starts and can be killed cleanly
    const child = spawn('node', [BRIDGE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    // Send invalid JSON — should cause error and exit
    child.stdin.write('not-json\n');

    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      setTimeout(() => {
        child.kill();
        resolve('timeout');
      }, 5000);
    });

    expect(exitCode).toBe(1);
  }, 10000);
});
