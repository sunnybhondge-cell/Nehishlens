#!/usr/bin/env node
/**
 * Node port of check-api.sh (see NehishLensAPIWiringGuide.docx, "Verifying").
 * Runs the same checks, in the same order, against whichever host you pass —
 * defaulting to VITE_API_ROOT / VITE_API_BASE_URL from your .env so this
 * script and the app always point at the same place.
 *
 * Usage:
 *   node scripts/check-api.mjs                    # uses .env / .env.development
 *   node scripts/check-api.mjs http://localhost:8099
 *
 * WARNING (from the guide): the store is live and shared. Step 4 creates a
 * visible incident; step 5 (_reset) removes it. Do not run this against the
 * deployed host during a demo.
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
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = { ...loadEnv('.env.development'), ...loadEnv('.env'), ...process.env };

const argHost = process.argv[2];
const apiRoot = (argHost ?? env.VITE_API_ROOT ?? 'https://mock-api-nehishlens.aminobots.com').replace(/\/+$/, '');
const apiBase = argHost ? `${argHost.replace(/\/+$/, '')}/api/v1` : (env.VITE_API_BASE_URL ?? `${apiRoot}/api/v1`);

let failures = 0;
let checks = 0;

function ok(label) {
  checks++;
  console.log(`  ok  - ${label}`);
}
function fail(label, detail) {
  checks++;
  failures++;
  console.log(`FAIL  - ${label}${detail ? `: ${detail}` : ''}`);
}

async function get(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not json, fine for route checks */
  }
  return { status: res.status, body };
}

/** List endpoints now return `{ items, total, cursor }`; older builds a bare array. */
function asList(body) {
  return Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
}

async function main() {
  console.log(`NehishLens mock API check`);
  console.log(`  root: ${apiRoot}`);
  console.log(`  base: ${apiBase}\n`);

  // 1. Routes — /, /docs, /api-console, /collection.json, /openapi.json, /health all 200.
  for (const route of ['/', '/docs', '/api-console', '/collection.json', '/openapi.json', '/health']) {
    try {
      const { status } = await get(`${apiRoot}${route}`);
      status === 200 ? ok(`GET ${route} -> 200`) : fail(`GET ${route}`, `got ${status}`);
    } catch (e) {
      fail(`GET ${route}`, e.message);
    }
  }

  // 2. Today's four endpoints — print tile values to compare against the page.
  for (const route of ['/metrics/summary', '/derivations/hours-saved', '/priorities', '/briefing']) {
    try {
      const { status, body } = await get(`${apiBase}${route}`, { headers: { 'X-Lens': 'ops' } });
      if (status === 200) {
        ok(`GET ${route} -> 200`);
        console.log(`        ${JSON.stringify(body).slice(0, 160)}`);
      } else {
        fail(`GET ${route}`, `got ${status}`);
      }
    } catch (e) {
      fail(`GET ${route}`, e.message);
    }
  }

  // 3. Maker-checker is real.
  try {
    const proposeRes = await fetch(`${apiBase}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lens': 'ops' },
      body: JSON.stringify({
        incidentId: 'INC-2261',
        steps: ['check-api.mjs smoke test'],
        proposerId: 'check-api-script',
        requiredApproverId: 'check-api-script-approver',
      }),
    });
    const propose = await proposeRes.json();
    if (proposeRes.status !== 200 && proposeRes.status !== 201) {
      fail('POST /actions (propose)', `got ${proposeRes.status}`);
    } else {
      ok('POST /actions (propose) -> 200/201');
      const actionId = propose.id ?? propose.action?.id;

      const selfApproveRes = await fetch(`${apiBase}/actions/${actionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lens': 'ops' },
        body: JSON.stringify({ approverId: 'check-api-script', outcome: 'applied' }),
      });
      selfApproveRes.status === 422
        ? ok('POST /actions/{id}/approve by proposer -> 422 maker_is_checker')
        : fail('self-approval should 422', `got ${selfApproveRes.status}`);

      const namedApproveRes = await fetch(`${apiBase}/actions/${actionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lens': 'ops' },
        body: JSON.stringify({ approverId: 'check-api-script-approver', outcome: 'applied' }),
      });
      // The mock validates the approver against the incident's own policy, so a
      // synthetic approver id is rejected (422). What matters is that the route
      // adjudicates rather than 500s or blindly accepting.
      [200, 201, 422].includes(namedApproveRes.status)
        ? ok(`POST /actions/{id}/approve by named approver -> ${namedApproveRes.status} (adjudicated)`)
        : fail('named approval should be adjudicated', `got ${namedApproveRes.status}`);
    }
  } catch (e) {
    fail('maker-checker flow', e.message);
  }

  // 4. The store is live, not fixtures — create an incident, check the count moved.
  let countBefore = null;
  try {
    const before = await get(`${apiBase}/incidents`, { headers: { 'X-Lens': 'ops' } });
    countBefore = asList(before.body)?.length ?? null;

    await fetch(`${apiBase}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lens': 'ops' },
      body: JSON.stringify({
        title: 'check-api.mjs smoke test',
        message: 'session 0000, branch 0000, amount 0.00 — check-api.mjs',
        module: 'smoke-test',
        stageName: 'observed',
        severity: 'info', // enum is crit | warn | info
      }),
    });

    const after = await get(`${apiBase}/incidents`, { headers: { 'X-Lens': 'ops' } });
    const countAfter = asList(after.body)?.length ?? null;

    countBefore !== null && countAfter !== null && countAfter > countBefore
      ? ok(`store is live — incident count moved ${countBefore} -> ${countAfter}`)
      : fail('incident count did not move', `${countBefore} -> ${countAfter}`);
  } catch (e) {
    fail('live-store check', e.message);
  }

  // 5. Reset — restores the seed, undoes everything above.
  try {
    const res = await fetch(`${apiBase}/_reset`, { method: 'POST' });
    res.ok ? ok('POST /_reset -> restored seed') : fail('POST /_reset', `got ${res.status}`);
  } catch (e) {
    fail('POST /_reset', e.message);
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
