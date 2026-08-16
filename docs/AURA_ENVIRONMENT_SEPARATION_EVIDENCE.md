# Aura — Environment and Secrets Separation Evidence

Verificado em 2026-08-15 (America/Sao_Paulo). Somente nomes, escopos e identificadores seguros são registrados.

## Infrastructure Decision — Current Remote Reclassified as Staging

O project ref `nklccxaeasoxjanxgqcl` é oficialmente **AURA STAGING**. Ele não é production. Production está `NOT PROVISIONED` por decisão explícita.

## Inventário final

| Ambiente | Aplicação | Supabase | `APP_ENV` | Secrets | Status |
|---|---|---|---|---|---|
| LOCAL | Vite local | Docker/local | `local` | locais/sintéticos | DEVELOPMENT_READY |
| STAGING | Edge Functions no remoto atual; frontend dedicado ainda não evidenciado | `nklccxaeasoxjanxgqcl`, `AGENDA-MEDICA`, sa-east-1 | `staging`, confirmado por health | defaults Supabase + APP_ENV + kill switch | PARTIAL |
| PRODUCTION | NOT PROVISIONED | NOT PROVISIONED | não aplicável | não existem | NOT PROVISIONED |

Production ausente é válido durante desenvolvimento. Antes de qualquer clínica real, staging e production deverão possuir refs, deployments e secrets diferentes.

## Secrets atuais — classificação staging

| Nome lógico | Escopo | Staging |
|---|---|---|
| Supabase URL/publishable | frontend-safe, environment-specific | configured |
| Supabase service role/DB | backend-only | configured pelo provider |
| `APP_ENV` | backend-only | configured=`staging` |
| `AURA_AI_GLOBAL_DISABLED` | backend-only | configured=true |
| OpenAI API key/project | backend-only | not configured |
| Meta app secret | backend-only | not configured |
| Meta app/config IDs | frontend-safe quando públicos | not verified |
| WhatsApp access token/conexão | backend-only, cifrado por clínica | not verified |
| webhook verification/signature secret | backend-only | not configured |
| WhatsApp encryption key | backend-only | not configured |

Nenhum desses secrets é production. Nenhum valor ou fingerprint foi registrado.

## Separação

- LOCAL versus STAGING: VERIFIED conceitualmente e por project/runtime distintos.
- STAGING versus PRODUCTION: NOT APPLICABLE enquanto production não existe.
- Regra futura: refs e secrets iguais serão blocker crítico.
- OpenAI e Meta staging permanecem `MANUAL_VERIFICATION_REQUIRED`/não configurados.
- Frontend staging dedicado permanece pendente, mas não altera a classificação do backend remoto.
