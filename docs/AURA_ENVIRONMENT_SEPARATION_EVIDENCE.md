# Aura — Environment and Secrets Separation Evidence

Verificado em: 2026-08-15 (America/Sao_Paulo). Este documento registra apenas identificadores seguros e presença de configuração; nenhum valor de secret é reproduzido.

## Inventário

| Ambiente | Frontend/hosting | Supabase | `APP_ENV` | OpenAI | Meta/WhatsApp | Secrets | Fonte/deploy | Status |
|---|---|---|---|---|---|---|---|---|
| LOCAL | Vite local | stack local Supabase | `local`, em arquivo local ignorado | não configurado | não configurado | somente chaves locais/sintéticas | branch `codex/disable-mvp-modules` | VERIFIED para desenvolvimento |
| STAGING | não provisionado | não provisionado | ausente | ausente | ausente | ausentes | ausente | BLOCKED |
| PRODUCTION | nenhum projeto Vercel ligado a este repositório | `nklccxaeasoxjanxgqcl` (`AGENDA-MEDICA`, sa-east-1) | `production` | ausente na lista de secrets Edge | configuração app/token/número não comprovada | defaults Supabase + `APP_ENV` + kill switch | Edge Functions via branch atual; frontend não evidenciado | PARTIAL |

## Separação de banco e aplicação

- Production Supabase: VERIFIED pelo projeto ligado e health remoto.
- Supabase staging diferente de production: BLOCKED; não existe project ref de staging identificado.
- Deployment staging separado: BLOCKED.
- Deployment production deste repositório: BLOCKED; a CLI Vercel autenticada não encontrou link local e os projetos listados não identificam Agenda Med.
- Projetos Supabase de outros produtos não foram reutilizados como staging.

## Inventário de secrets por ambiente

| Nome lógico | Escopo | LOCAL | STAGING | PRODUCTION |
|---|---|---|---|---|
| Supabase URL/publishable | frontend-safe, environment-specific | configured | no | configured |
| Supabase service role | backend-only, environment-specific | synthetic local | no | configured pelo provider |
| `APP_ENV` | backend-only, environment-specific | configured=`local` | no | configured=`production` |
| `AURA_AI_GLOBAL_DISABLED` | backend-only, environment-specific | configured=true | no | configured=true |
| OpenAI API key/project | backend-only, environment-specific | no | no | no |
| Meta app secret | backend-only, environment-specific | no | no | no |
| Meta app/config IDs | frontend-safe quando públicos | no | no | não comprovado |
| WhatsApp access token | backend-only, por conexão e cifrado | no | no | não comprovado por clínica |
| Webhook verification/signature secret | backend-only, environment-specific | no | no | no |
| WhatsApp token encryption key | backend-only, environment-specific | no | no | no |

## Teste de separação

O runner `scripts/staging-smoke-test.ts` compara project refs sem armazenar secrets e falha quando os refs são ausentes ou iguais. O teste real permanece BLOCKED porque staging não existe.

OpenAI, Meta, número WhatsApp, webhook e backend secrets separados permanecem `MANUAL_VERIFICATION_REQUIRED` após provisionar staging. Ausência de configuração não é tratada como separação válida.
