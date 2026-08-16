# Aura — Pilot Blocker Register

Atualizado em 2026-08-15 após reclassificação do remoto atual para staging.

## Staging blockers

| Blocker | Status | Evidência / ação |
|---|---|---|
| classificação do remote como staging | CLOSED | decisão + health `environment=staging` |
| APP_ENV staging | CLOSED | health remoto HTTP 200 |
| migrations staging | CLOSED | 71 migrations; latest `20260816033000` |
| OpenAI staging | OPEN | criar/configurar key de desenvolvimento |
| Meta/webhook/encryption staging | MANUAL_VERIFICATION_REQUIRED | configurar app/número/test secrets próprios |
| clínica, staff e dados exclusivamente sintéticos | OPEN | criar/verificar fixture sintética |
| readiness autenticada tenant-scoped | OPEN | executar com staff/clinic sintéticos |
| inbound/dedup/conversation/knowledge/read smoke | OPEN | executar após provider/test config |
| kill switch + rollback drill | OPEN | signed inbound sintético e restauração do estado |
| observability/correlation/privacy log review | OPEN | verificar após smoke end-to-end |
| quality gates locais | CLOSED | tests/eval/SQL/typecheck/lint/build verdes |

## Real-pilot blockers

| Blocker | Status | Ação |
|---|---|---|
| production | OPEN | provisionar Supabase e application deployment separados |
| APP_ENV/secrets production | OPEN | configurar exclusivamente no novo ambiente |
| backup/PITR policy | OPEN | aceitar/configurar requisitos reais |
| restore test | OPEN | restaurar production backup em target isolado |
| clínica piloto onboarding | OPEN | completar checklist sem ativação automática |
| rollout approval | OPEN | decisão humana explícita após readiness |

## Resultado

- `STAGING_STATUS=STAGING_NOT_READY`
- `REAL_PILOT_STATUS=REAL_PILOT_NOT_READY`

Backup/PITR não bloqueiam o desenvolvimento no staging sintético, mas continuam blockers obrigatórios do piloto real.
