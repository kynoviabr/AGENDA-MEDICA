# Aura — Staging Validation Report

Data: 2026-08-15. Ambiente: Supabase `nklccxaeasoxjanxgqcl`. Resultado: **STAGING_NOT_READY**.

## Ambiente

- remoto oficialmente classificado como STAGING: PASS;
- `APP_ENV=staging`: PASS;
- liveness HTTP 200 e `environment=staging`: PASS;
- production: NOT PROVISIONED / NOT APPLICABLE;
- migration parity: 71 migrations, latest local/remote `20260816033000`: PASS;
- global kill switch configurado `true`: PASS de configuração;
- OpenAI/Meta/webhook/encryption custom secrets: não configurados ou não verificados.

## Smoke runner

`npm run smoke:staging` foi atualizado para aceitar production ausente durante desenvolvimento. Resultado:

| Check | Resultado |
|---|---|
| project staging presente / production ausente | PASS |
| staging liveness/environment | PASS |
| readiness anônima | PASS, HTTP 401 |
| invalid webhook signature | PASS, rejeitada HTTP 401 |
| readiness autenticada tenant-scoped | BLOCKED — token efêmero e clínica sintética não disponíveis |
| valid signed webhook | MANUAL — Meta secret/test config ausente |

## Fluxos funcionais

| Fluxo | Evidência local | Evidência staging |
|---|---|---|
| deduplication | SQL/unit PASS | BLOCKED |
| conversation | unit/eval PASS | BLOCKED |
| knowledge known/unknown | unit/eval/SQL PASS | BLOCKED |
| scheduling read | unit/SQL PASS | BLOCKED |
| medical safety/injection | critical eval PASS | BLOCKED end-to-end |
| handoff/takeover/return/no-double-response | unit/SQL/eval PASS | NOT APPLICABLE até gate homologado |
| incident provider unavailable | fake/eval PASS | BLOCKED |
| observability/correlation | unit/SQL PASS | BLOCKED end-to-end |
| privacy/log review | static/unit PASS | BLOCKED no runtime staging |

## Synthetic data

Não foi criada clínica sintética automaticamente. A existência e a natureza exclusivamente sintética dos dados remotos não foram verificadas por consulta de conteúdo. Nenhum dado foi apagado, copiado ou alterado.

## Kill switch e rollback

O switch global permaneceu `true`. Não havia signed inbound seguro para comprovar `true → sem resposta`, portanto rollback drill end-to-end não foi executado. Nenhum gate de clínica foi modificado para forçar resultado verde.

## Quality gates

- Vitest: 42 arquivos / 271 testes — PASS;
- eval fast: 69/69 — PASS;
- eval full: 166/166 — PASS;
- critical failures: 0;
- 11 pacotes SQL tenant-safe — PASS;
- typecheck, lint direcionado, build e git diff check — PASS.

## Readiness

- `DEVELOPMENT_READY_FOR_STAGING=true`;
- `STAGING_READY=false` por ausência de fixture/staff sintéticos, readiness autenticada, secrets/provider config e smoke funcional;
- `REAL_PILOT_READY=false` porque production não existe e backup/restore/onboarding ainda não foram executados.
