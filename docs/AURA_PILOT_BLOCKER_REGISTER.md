# Aura — Pilot Blocker Register

Atualizado em: 2026-08-15.

| Blocker | Status | Evidence | Owner/next action | Pilot impact |
|---|---|---|---|---|
| staging Supabase separado | OPEN | `AURA_ENVIRONMENT_SEPARATION_EVIDENCE.md` | operador: criar projeto staging dedicado | impede smoke e Shadow Pilot |
| deployment staging separado | OPEN | CLI Vercel: repo não ligado | operador: criar/linkar deployment staging | impede smoke end-to-end |
| `APP_ENV=staging` | OPEN | staging ausente | operador: configurar secret no staging | readiness fail-closed |
| `APP_ENV=production` | CLOSED | health remoto HTTP 200 com `production` | manter por ambiente | resolvido |
| separação backend secrets/OpenAI/Meta | MANUAL_VERIFICATION_REQUIRED | inventário mostra staging/custom secrets ausentes | criar keys/apps/número staging separados e registrar presença | impede tráfego real |
| webhook staging/production | MANUAL_VERIFICATION_REQUIRED | endpoint staging ausente; Meta console não auditado | conferir callback e número em cada Meta app | risco de roteamento cruzado |
| migration parity production | CLOSED | CLI local vs remote até `20260816033000` | repetir após migrations futuras | resolvido para production |
| migration parity staging | OPEN | staging ausente | aplicar somente migrations conhecidas após provisionamento | impede smoke |
| backup restaurável | OPEN | provider retornou zero backups | configurar plano/retenção e obter restore point | risco de perda de dados |
| PITR | OPEN | provider retornou disabled | habilitar/aceitar requisito explicitamente | NO_GO obrigatório |
| restore isolado | OPEN | não executado | restaurar em projeto isolado e validar estrutura | NO_GO obrigatório |
| clínica/dados/staff sintéticos staging | OPEN | staging ausente | executar seed exclusivamente sintético | impede smoke funcional |
| staging smoke completo | OPEN | runner criado, ambiente ausente | executar `npm run smoke:staging` + runbook | impede platform readiness |
| rollback/kill-switch drill staging | OPEN | não executado | testar global/clinic gates e restauração | impede platform readiness |
| staging logs/privacy/correlation | OPEN | staging ausente | revisar eventos e logs após smoke | impede platform readiness |
| quality gates locais | CLOSED | 269 tests; eval 69/69 e 166/166; 11 SQL packs | manter em CI/release | resolvido no código |

## Resultado

`PILOT BLOCKERS REMAIN` — `NO_GO`.
