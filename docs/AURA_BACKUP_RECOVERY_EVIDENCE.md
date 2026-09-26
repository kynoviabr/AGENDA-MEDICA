# Aura — Backup and Recovery Evidence

Verificado em 2026-08-15. Provider: Supabase. Ambiente auditado: **STAGING**. Project ref: `nklccxaeasoxjanxgqcl`.

## Evidência real

| Item | Resultado | Fonte |
|---|---|---|
| mecanismo WAL-G | habilitado | CLI autenticada |
| backups restauráveis listados | zero | CLI autenticada |
| PITR | disabled | CLI autenticada |
| restore test | não executado | sem restore point/target isolado |

## Classificação por nível

- **STAGING READY:** backup/PITR/restore não são blockers obrigatórios para desenvolvimento com dados exclusivamente sintéticos. Permanecem risco operacional documentado.
- **REAL PILOT READY:** política de backup aceita e restore real testado são blockers obrigatórios.

A reclassificação não resolve nem mascara backup. Apenas posiciona a exigência no nível correto.

## Targets futuros para production

- target RPO proposto: até 24 horas;
- target RTO proposto: até 4 horas.

São targets internos, não SLA.

## Restore futuro

Antes do piloto real: configurar backup/PITR aceitos em production, obter restore point, restaurar em projeto isolado, validar schema, tenants, appointments, conversations, RLS, migrations e índices sem registrar PII. Nunca restaurar sobre production.
