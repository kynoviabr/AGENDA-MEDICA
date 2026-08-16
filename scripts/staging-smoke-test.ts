type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED';
type Check = { name: string; status: CheckStatus; code: string };

const checks: Check[] = [];
const add = (name: string, status: CheckStatus, code: string) => checks.push({ name, status, code });
const configured = (name: string) => Boolean(process.env[name]?.trim());

async function request(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    return { status: response.status, json: await response.json().catch(() => null) as Record<string, unknown> | null };
  } catch {
    return { status: 0, json: null };
  }
}

async function checkEnvironment(label: 'staging' | 'production') {
  const upper = label.toUpperCase();
  const base = process.env[`AURA_${upper}_EDGE_BASE_URL`]?.replace(/\/$/, '');
  if (!base) {
    add(`${label}_liveness`, 'BLOCKED', `${upper}_EDGE_BASE_URL_MISSING`);
    add(`${label}_readiness_anonymous`, 'BLOCKED', `${upper}_EDGE_BASE_URL_MISSING`);
    return;
  }

  const healthUrl = `${base}/aura-operational-health`;
  const liveness = await request(`${healthUrl}?mode=liveness`);
  add(
    `${label}_liveness`,
    liveness.status === 200 && liveness.json?.environment === label ? 'PASS' : 'FAIL',
    liveness.status === 200 && liveness.json?.environment === label ? 'HEALTH_ENVIRONMENT_VALID' : 'HEALTH_ENVIRONMENT_INVALID',
  );

  const anonymous = await request(healthUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clinicId: '00000000-0000-0000-0000-000000000000' }),
  });
  add(
    `${label}_readiness_anonymous`,
    anonymous.status === 401 ? 'PASS' : 'FAIL',
    anonymous.status === 401 ? 'ANONYMOUS_REJECTED' : 'ANONYMOUS_NOT_REJECTED',
  );
}

async function main() {
  const stagingRef = process.env.AURA_STAGING_SUPABASE_REF?.trim();
  const productionRef = process.env.AURA_PRODUCTION_SUPABASE_REF?.trim();
  if (!stagingRef || !productionRef) add('database_separation', 'BLOCKED', 'SUPABASE_REFS_MISSING');
  else add('database_separation', stagingRef !== productionRef ? 'PASS' : 'FAIL', stagingRef !== productionRef ? 'SUPABASE_REFS_SEPARATE' : 'SUPABASE_REFS_EQUAL');

  await checkEnvironment('staging');
  await checkEnvironment('production');

  const webhookUrl = process.env.AURA_STAGING_WEBHOOK_URL?.trim();
  if (!webhookUrl) add('webhook_invalid_signature', 'BLOCKED', 'STAGING_WEBHOOK_URL_MISSING');
  else {
    const invalid = await request(webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' }, body: '{}',
    });
    add('webhook_invalid_signature', invalid.status === 403 ? 'PASS' : 'FAIL', invalid.status === 403 ? 'INVALID_SIGNATURE_REJECTED' : 'INVALID_SIGNATURE_NOT_REJECTED');
  }

  const canCheckAuthorized = configured('AURA_STAGING_STAFF_TOKEN') && configured('AURA_STAGING_CLINIC_ID') && configured('AURA_STAGING_EDGE_BASE_URL');
  if (!canCheckAuthorized) add('staging_authorized_readiness', 'BLOCKED', 'AUTHORIZED_READINESS_INPUT_MISSING');
  else {
    const base = process.env.AURA_STAGING_EDGE_BASE_URL!.replace(/\/$/, '');
    const result = await request(`${base}/aura-operational-health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.AURA_STAGING_STAFF_TOKEN}` },
      body: JSON.stringify({ clinicId: process.env.AURA_STAGING_CLINIC_ID, range: 'today' }),
    });
    add('staging_authorized_readiness', result.status === 200 && result.json?.environment === 'staging' ? 'PASS' : 'FAIL', result.status === 200 ? 'AUTHORIZED_READINESS_RETURNED' : 'AUTHORIZED_READINESS_FAILED');
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), containsSecrets: false, checks }, null, 2));
  if (checks.some((check) => check.status !== 'PASS')) process.exitCode = 1;
}

void main();
