#!/usr/bin/env node
/**
 * READ-ONLY health sweep of every endpoint the app calls.
 *
 * Unlike `check-api.mjs`, this writes nothing and never calls `/_reset`, so it
 * is safe to run against any host at any time — including during a demo. It
 * answers one question: "how many of the APIs are actually responding right
 * now?", and separately exercises Cortex with a set of predefined questions so
 * you can see at a glance whether Cortex is grounded, refusing, or broken.
 *
 * Usage:
 *   node scripts/check-endpoints.mjs                      # host from .env
 *   node scripts/check-endpoints.mjs https://host         # explicit host
 *   npm run check-endpoints
 *
 * Exit code 0 = every endpoint responded acceptably; 1 = one or more failed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function loadEnv(file) {
  const p = path.join(root, file);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = { ...loadEnv('.env.development'), ...loadEnv('.env'), ...process.env };
const argHost = process.argv[2];
const apiRoot = (argHost ?? env.VITE_API_ROOT ?? 'https://mock-api-nehishlens.aminobots.com').replace(/\/+$/, '');
const apiBase = argHost
  ? `${argHost.replace(/\/+$/, '')}/api/v1`
  : env.VITE_API_BASE_URL ?? `${apiRoot}/api/v1`;
const LENS = 'ops';

let pass = 0;
let softFail = 0;
let hardFail = 0;
const rows = [];

async function hit(label, url, { base = apiBase, method = 'GET', body, expect = [200], soft = [] } = {}) {
  const full = url.startsWith('http') ? url : `${base}${url}`;
  const started = Date.now();
  try {
    const res = await fetch(full, {
      method,
      headers: { 'X-Lens': LENS, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Date.now() - started;
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    if (expect.includes(res.status)) {
      pass++;
      rows.push({ mark: 'ok  ', label, status: res.status, ms });
    } else if (soft.includes(res.status)) {
      softFail++;
      rows.push({ mark: 'warn', label, status: res.status, ms, note: 'expected on this seed/lens' });
    } else {
      hardFail++;
      rows.push({ mark: 'FAIL', label, status: res.status, ms });
    }
    return { status: res.status, json };
  } catch (e) {
    hardFail++;
    rows.push({ mark: 'FAIL', label, status: '—', ms: Date.now() - started, note: e.message });
    return { status: 0, json: null };
  }
}

function firstId(list, ...keys) {
  const arr = Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : [];
  const row = arr[0];
  if (!row) return null;
  for (const k of keys) if (row[k] != null) return row[k];
  return null;
}

async function main() {
  console.log('NehishLens endpoint sweep (read-only)');
  console.log(`  base: ${apiBase}`);
  console.log(`  lens: ${LENS}\n`);

  // --- root / infra ---
  for (const r of ['/health', '/openapi.json', '/docs']) {
    await hit(`GET ${r}`, `${apiRoot}${r}`, { base: apiRoot });
  }

  // --- Today ---
  await hit('GET /metrics/summary', '/metrics/summary');
  await hit('GET /derivations/hours-saved', '/derivations/hours-saved');
  await hit('GET /priorities', '/priorities');
  await hit('GET /briefing', '/briefing');

  // --- Incidents (resolve an id from the list) ---
  const incRes = await hit('GET /incidents', '/incidents');
  const incId = firstId(incRes.json, 'id') ?? 'INC-2261';
  await hit(`GET /incidents/{id}  (${incId})`, `/incidents/${encodeURIComponent(incId)}`);
  await hit(`GET /incidents/{id}/recall`, `/incidents/${encodeURIComponent(incId)}/recall`);
  await hit('GET /policy/approvers', `/policy/approvers?lens=${LENS}&incidentId=${encodeURIComponent(incId)}`);

  // --- EOD ---
  await hit('GET /runs/{id}  (2026-07-28)', '/runs/2026-07-28', { soft: [404] });
  await hit('GET /feeds/health', '/feeds/health');

  // --- Audit ---
  const auditRes = await hit('GET /audit?limit=50', '/audit?limit=50');
  await hit('GET /audit/verify', '/audit/verify');
  const auditHash = firstId(auditRes.json, 'hash');
  if (auditHash) await hit('GET /audit/{hash}', `/audit/${encodeURIComponent(auditHash)}`);

  // --- Corpus ---
  await hit('GET /corpus/metrics', '/corpus/metrics');
  const resRes = await hit('GET /resolutions', '/resolutions');
  const resId = firstId(resRes.json, 'id', 'slug');
  if (resId) {
    const detail = await hit('GET /resolutions/{id}', `/resolutions/${encodeURIComponent(resId)}`);
    const sigId = detail.json?.signatureId;
    if (sigId) {
      await hit('GET /signatures/{id}', `/signatures/${encodeURIComponent(sigId)}`);
      await hit('GET /signatures/{id}/occurrences', `/signatures/${encodeURIComponent(sigId)}/occurrences`);
    }
  }

  // --- Sources ---
  const srcRes = await hit('GET /sources', '/sources');
  const srcId = firstId(srcRes.json, 'id');
  if (srcId) await hit('GET /sources/{id}', `/sources/${encodeURIComponent(srcId)}`, { soft: [403] });
  await hit('GET /citations', '/citations');

  // --- Settings ---
  await hit('GET /config/thresholds', '/config/thresholds');

  // --- Mock control (read-only part) ---
  await hit('GET /_states', '/_states');

  // --- Cortex: context + predefined questions ---------------------------------
  console.log('\n  endpoint results');
  for (const r of rows) {
    console.log(
      `    ${r.mark}  ${String(r.status).padStart(3)}  ${String(r.ms).padStart(4)}ms  ${r.label}` +
        (r.note ? `  — ${r.note}` : ''),
    );
  }

  console.log('\n  Cortex — predefined questions');
  const ctxRes = await hit(
    'GET /cortex/context (incident-detail)',
    `/cortex/context?screen=incident-detail&lens=${LENS}&objectId=${encodeURIComponent(incId)}`,
  );
  const suggested = Array.isArray(ctxRes.json?.suggestions) ? ctxRes.json.suggestions : [];

  // the app's own suggestion chips (grounded) + two deliberate misses (should refuse)
  const QUESTIONS = [
    ...suggested,
    'What is the capital of France?',
    'Will it rain tomorrow?',
  ];

  const tally = { grounded: 0, partial: 0, refused: 0, error: 0 };
  for (const q of QUESTIONS) {
    try {
      const res = await fetch(`${apiBase}/cortex/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lens': LENS },
        body: JSON.stringify({ question: q, context: { screen: 'incident-detail', lens: LENS, objectId: incId } }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        tally.error++;
        console.log(`    ERR   ${res.status}   ${q}`);
        continue;
      }
      const c = j?.confidence ?? 'unknown';
      if (c === 'grounded') tally.grounded++;
      else if (c === 'partial') tally.partial++;
      else if (c === 'refused') tally.refused++;
      else tally.error++;
      const pct = j?.confidencePct != null ? `${j.confidencePct}%` : '—';
      console.log(`    ${c.padEnd(8)} ${pct.padStart(4)}  ${q}`);
    } catch (e) {
      tally.error++;
      console.log(`    ERR         ${q}  — ${e.message}`);
    }
  }

  const cortexOk = tally.error === 0 && tally.grounded + tally.partial > 0;
  console.log(
    `\n  Cortex verdict: ${cortexOk ? 'WORKING' : 'CHECK'} — ` +
      `${tally.grounded} grounded, ${tally.partial} partial, ${tally.refused} refused, ${tally.error} error ` +
      `(of ${QUESTIONS.length})`,
  );
  if (!cortexOk && tally.error === 0) {
    console.log('    (all answers refused — that can be the seed, not a fault. A refusal IS a valid response.)');
  }

  const total = pass + softFail + hardFail;
  console.log(`\n${pass}/${total} endpoints OK` + (softFail ? `, ${softFail} expected-non-200` : '') + (hardFail ? `, ${hardFail} FAILED` : ''));
  process.exit(hardFail > 0 || tally.error > 0 ? 1 : 0);
}

main();
