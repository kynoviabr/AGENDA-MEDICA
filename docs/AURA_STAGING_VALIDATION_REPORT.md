# Aura — Staging Validation Report

Data: 2026-08-15. Resultado: **BLOCKED — staging não provisionado**.

## Ambiente e migrations

- staging application: BLOCKED;
- staging Supabase: BLOCKED;
- `APP_ENV=staging`: BLOCKED;
- migration parity staging: BLOCKED;
- production migration parity: VERIFIED até `20260816033000`;
- local migration/test database: disponível.

## Smoke runner

Foi criado `scripts/staging-smoke-test.ts` e o comando `npm run smoke:staging`. O runner:

- não contém credentials;
- compara project refs;
- valida liveness e ambiente explícito;
- exige readiness anônima `401`;
- rejeita assinatura sintética inválida no webhook;
- pode validar readiness autenticada com token efêmero fornecido pelo operador;
- emite somente códigos/status e nunca response body, telefone, prompt ou token;
- retorna exit code diferente de zero se qualquer verificação estiver FAIL/BLOCKED.

## Resultados

| Teste | Resultado |
|---|---|
| health/liveness staging | BLOCKED |
| readiness staging autorizada | BLOCKED |
| assinatura inválida/assinada | BLOCKED no staging |
| inbound e deduplicação | BLOCKED no staging |
| conversation/knowledge/unknown knowledge/read scheduling | BLOCKED no staging; comportamento determinístico verde localmente |
| medical safety/prompt injection | BLOCKED no staging; gates críticos 100% localmente |
| handoff/takeover/human outbound/return/no-double-response | BLOCKED no staging; suites unitárias/SQL/eval verdes |
| global/clinic kill switch | BLOCKED no staging |
| rollback drill | BLOCKED |
| OpenAI incident drill | BLOCKED no staging; fake determinístico verde |
| WhatsApp failure drill | BLOCKED no staging; fake determinístico verde |
| database fail-closed | BLOCKED no staging; fake determinístico verde |
| observability/correlation | BLOCKED no staging; unit/SQL verdes |
| staging privacy log review | BLOCKED |

## Evidência local/production não destrutiva

- production liveness: HTTP 200, `environment=production`;
- production readiness anônima: HTTP 401;
- production kill switch global: configurado `true`;
- 41 arquivos / 269 testes Vitest: PASS;
- eval fast: 69/69, PASS;
- eval full: 166/166, PASS;
- critical failures: 0;
- tenant, medical safety, mutation confirmation e grounding críticos: 100%; false success: 0;
- 11 pacotes SQL locais transacionais: PASS;
- typecheck: PASS;
- lint direcionado: PASS;
- build: PASS, apenas warnings conhecidos de Browserslist/chunk;

Nenhum smoke com dado real, outbound production ou mutation production foi executado.
