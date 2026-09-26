# Aura Environment Strategy

## Current architecture

```text
LOCAL
└── Supabase local / Docker

STAGING
└── Supabase project nklccxaeasoxjanxgqcl

PRODUCTION
└── NOT PROVISIONED
```

## Why

O produto continua em desenvolvimento, sem clínica cliente em operação, pacientes reais ou piloto ativo. Por decisão de infraestrutura de 2026-08-15, o remoto atual é oficialmente **Aura Staging**. Production será criada somente antes da primeira clínica real.

## Rule

Nenhum dado real de clínica ou paciente pode entrar no staging. São permitidos apenas clínicas, profissionais, serviços, convênios, staff, pacientes/leads, knowledge e appointments claramente sintéticos.

## Readiness levels

1. **LEVEL 1 — DEVELOPMENT:** local operacional e quality gates verdes.
2. **LEVEL 2 — STAGING READY:** projeto staging identificado, `APP_ENV=staging`, dados sintéticos, health/readiness autenticada, smoke funcional, kill switches e evals comprovados.
3. **LEVEL 3 — REAL PILOT READY:** production separado, `APP_ENV=production`, secrets exclusivos, backup aceito, restore testado, clínica onboarded e aprovação explícita.

Staging pode ser READY sem production. Isso nunca autoriza Shadow Pilot real.

## Production trigger

Criar um novo ambiente production antes de cadastrar ou ativar a primeira clínica real.

## Production requirements

- Supabase separado do staging;
- deployment de aplicação separado;
- `APP_ENV=production`;
- secrets OpenAI/Meta/webhook/encryption exclusivos;
- política de backup e retenção aceita;
- restore real validado em destino isolado;
- readiness de plataforma e clínica;
- aprovação explícita de rollout.
