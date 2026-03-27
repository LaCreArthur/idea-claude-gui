#!/usr/bin/env node
/**
 * verify-auth.mjs — Cheap OAuth credential + API connectivity check.
 *
 * Verifies the full auth chain without launching Rider or taking screenshots.
 * Reads credentials, refreshes if expired, makes a tiny API call.
 *
 * Usage:
 *   node tests/verify-auth.mjs
 *
 * Exit codes:
 *   0 = auth works, API responded successfully
 *   1 = auth failed or API error
 *   2 = no credentials found (run `claude login`)
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

const home = homedir();
const CRED_FILE = `${home}/.claude/.credentials.json`;
const OAUTH_BETA = 'oauth-2025-04-20';
const API_URL = 'https://api.anthropic.com/v1/messages';
const REFRESH_URLS = [
  'https://api.anthropic.com/v1/oauth/token',
  'https://console.anthropic.com/api/oauth/token',
];
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
// Use Haiku — cheapest model, minimal tokens
const TEST_MODEL = 'claude-haiku-4-5-20251001';

function log(msg) { console.log(`[verify-auth] ${msg}`); }
function fail(msg, code = 1) { console.error(`[verify-auth] FAIL: ${msg}`); process.exit(code); }

// ── Credential loading ────────────────────────────────────────────────────────

function readKeychainCredentials() {
  if (process.platform !== 'darwin') return null;
  for (const service of ['Claude Code-credentials', 'Claude Code']) {
    try {
      const out = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString().trim();
      if (out) return JSON.parse(out);
    } catch { /* try next */ }
  }
  return null;
}

function readFileCredentials() {
  if (!existsSync(CRED_FILE)) return null;
  try { return JSON.parse(readFileSync(CRED_FILE, 'utf8')); } catch { return null; }
}

// ── Token refresh ─────────────────────────────────────────────────────────────

function curlPost(url, body) {
  const raw = execFileSync('/usr/bin/curl', [
    '-s', '-w', '\n%{http_code}',
    '-X', 'POST', url,
    '-H', 'Content-Type: application/json',
    '-d', body,
  ], { timeout: 15000 }).toString().trim();
  const lines = raw.split('\n');
  const status = parseInt(lines.at(-1), 10);
  const responseBody = lines.slice(0, -1).join('\n');
  return { status, body: responseBody };
}

function tryRefresh(refreshToken, url) {
  const body = JSON.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OAUTH_CLIENT_ID,
  });
  const { status, body: respBody } = curlPost(url, body);
  log(`  ${url} → HTTP ${status}`);
  if (status !== 200) {
    log(`  Response: ${respBody.slice(0, 200)}`);
    return null;
  }
  try {
    const json = JSON.parse(respBody);
    return json.access_token ? json : null;
  } catch {
    log(`  Could not parse JSON: ${respBody.slice(0, 200)}`);
    return null;
  }
}

function refreshToken(refreshTok) {
  for (const url of REFRESH_URLS) {
    const result = tryRefresh(refreshTok, url);
    if (result) return result;
  }
  return null;
}

// ── API call ──────────────────────────────────────────────────────────────────

function callApi(token) {
  const body = JSON.stringify({
    model: TEST_MODEL,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'reply with only the word "ok"' }],
  });
  const raw = execFileSync('/usr/bin/curl', [
    '-s', '-w', '\n%{http_code}',
    '-X', 'POST', API_URL,
    '-H', `anthropic-beta: ${OAUTH_BETA}`,
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/json',
    '-H', 'anthropic-version: 2023-06-01',
    '-d', body,
  ], { timeout: 30000 }).toString().trim();
  const lines = raw.split('\n');
  const status = parseInt(lines.at(-1), 10);
  const respBody = lines.slice(0, -1).join('\n');
  return { status, body: respBody };
}

// ── Main ──────────────────────────────────────────────────────────────────────

let creds = readKeychainCredentials();
let source = 'Keychain';
if (!creds) { creds = readFileCredentials(); source = '.credentials.json'; }

if (!creds?.claudeAiOauth?.accessToken) {
  fail('No credentials found. Run `claude login` first.', 2);
}

log(`Credentials: ${source}`);
const oauth = creds.claudeAiOauth;
let token = oauth.accessToken;
const expiresAt = oauth.expiresAt ?? 0;
const now = Date.now();

log(`Token expires: ${new Date(expiresAt).toISOString()} (${expiresAt > now ? 'VALID' : 'EXPIRED'})`);

if (expiresAt > 0 && expiresAt < now) {
  log('Token expired — attempting refresh...');
  if (!oauth.refreshToken) fail('No refresh token. Run `claude login`.', 1);
  const refreshed = refreshToken(oauth.refreshToken);
  if (!refreshed) fail('Refresh failed on all endpoints. Run `claude login`.', 1);
  token = refreshed.access_token;
  log(`Token refreshed. New expiry: ${new Date(now + (refreshed.expires_in ?? 28800) * 1000).toISOString()}`);
}

log(`Calling API (${TEST_MODEL}, max_tokens=8)...`);
const { status, body: respBody } = callApi(token);
log(`HTTP ${status}: ${respBody.slice(0, 300)}`);

if (status === 200) {
  log('✓ Auth verified — API call succeeded');
  process.exit(0);
} else if (status === 401) {
  fail(`401 Unauthorized — ${respBody.slice(0, 200)}`, 1);
} else if (status === 429) {
  log('⚠ Rate limited (429) — auth is valid, quota exceeded');
  process.exit(0);  // auth works, just quota
} else {
  fail(`Unexpected HTTP ${status} — ${respBody.slice(0, 200)}`, 1);
}
