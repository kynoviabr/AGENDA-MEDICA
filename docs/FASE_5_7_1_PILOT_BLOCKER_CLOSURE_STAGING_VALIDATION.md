# Fase 5.7.1-R — Reclassificação do Remoto Atual para Staging

## Objetivo

Registrar a decisão de infraestrutura, corrigir `APP_ENV`, reexecutar evidências aplicáveis e separar prontidão de staging da prontidão para piloto real, sem criar production ou ativar clínica.

## Infrastructure Decision — Current Remote Reclassified as Staging

O Supabase `nklccxaeasoxjanxgqcl` é oficialmente **AURA STAGING**. A classificação anterior como production foi substituída. Production está `NOT PROVISIONED` e somente será criada antes da primeira clínica real.

## Environment inventory

```text
LOCAL      → Supabase local / Docker
STAGING    → nklccxaeasoxjanxgqcl
PRODUCTION → NOT PROVISIONED
```

## APP_ENV e health

`APP_ENV` remoto foi alterado de `production` para `staging` via Edge secret. O kill switch global permaneceu `true`. Liveness retornou HTTP 200, status healthy e `environment=staging`; `production`, `unknown` e `local` não foram aceitos.

## Secrets

Todos os secrets presentes no remoto são classificados como STAGING. A lista segura comprova defaults do Supabase, APP_ENV e kill switch. OpenAI, Meta app secret, webhook verification e encryption key customizados não estão configurados; token/número por clínica não foram verificados. Nenhum valor foi exposto.

## Migration parity

Local e staging possuem 71 migrations e latest `20260816033000`. Nenhuma migration foi aplicada nesta correção.

## Staging data

O ambiente está autorizado apenas para dados sintéticos. Não foi criada fixture remota porque não havia staff/test identity e provider configuration comprovados. Conteúdo existente não foi lido, apagado ou reclassificado automaticamente.

## Smoke results

PASS: staging ref, production absent válido, liveness/environment, readiness anônima 401 e assinatura inválida rejeitada 401.

BLOCKED/MANUAL: readiness autenticada, signed webhook válido, inbound, dedup remoto, conversation, knowledge, scheduling read, handoff, takeover, return-to-AI, rollback, incident e runtime log review.

O comportamento desses fluxos permanece verde nas suites sintéticas locais, mas não foi apresentado como smoke remoto.

## Readiness model

`AuraEnvironmentReadinessService` formaliza três níveis:

1. DEVELOPMENT: local e controles fundamentais verdes;
2. STAGING READY: staging + synthetic data + auth readiness + smoke + kill switch;
3. REAL PILOT READY: production + secrets + backup/restore + onboarding + aprovação.

Resultado calculado desta execução:

- `DEVELOPMENT_READY_FOR_STAGING=true`;
- `STAGING_READY=false`;
- `REAL_PILOT_READY=false`.

Production ausente não bloqueia desenvolvimento, mas impede qualquer piloto real.

## Backup/PITR/restore

Fatos preservados: WAL-G habilitado, zero backups restauráveis, PITR disabled e restore não executado. Isso não bloqueia staging com dados sintéticos; bloqueia obrigatoriamente REAL PILOT READY.

## Validation

- unit/integration: 42 arquivos, 271 testes PASS;
- eval fast: 69/69 PASS;
- eval full: 166/166 PASS;
- critical gates: 100%, zero critical failures;
- SQL/tenant: 11 packs PASS;
- typecheck, lint direcionado, build e diff check: PASS.

## Blockers restantes — staging

1. configurar OpenAI/Meta/webhook/encryption para teste;
2. criar/verificar clínica e staff sintéticos;
3. executar readiness autenticada tenant-scoped;
4. executar signed inbound e smoke funcional completo;
5. executar kill-switch/rollback/incident drills;
6. revisar eventos, correlation e logs do staging.

## Blockers restantes — real pilot

1. criar production separado;
2. configurar APP_ENV e secrets production exclusivos;
3. aceitar backup/PITR e testar restore isolado;
4. concluir onboarding da clínica candidata;
5. obter aprovação explícita de rollout.

## Resultado final

`STAGING_STATUS=STAGING_NOT_READY`

`REAL_PILOT_STATUS=REAL_PILOT_NOT_READY`

## Confirmações

- nenhum ambiente production foi criado;
- nenhuma clínica real foi ativada;
- nenhum dado real de paciente foi usado;
- nenhuma mutation real foi executada;
- nenhum provider externo ou nova feature foi implementado;
- Google Calendar, Doctoralia, Feegow, RAG, embeddings e long-term memory não foram implementados;
- Shadow Pilot e qualquer fase posterior não foram iniciados.
