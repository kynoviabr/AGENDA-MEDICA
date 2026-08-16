# Aura — Backup and Recovery Evidence

Verificado em: 2026-08-15. Provider: Supabase. Projeto: `nklccxaeasoxjanxgqcl` (`AGENDA-MEDICA`, sa-east-1).

## Evidência do provider

Consulta autenticada pela CLI oficial `supabase backups list`:

| Item | Resultado | Status |
|---|---|---|
| mecanismo físico/WAL-G | habilitado | VERIFIED |
| backups restauráveis listados | nenhum | BLOCKED |
| PITR | desabilitado | BLOCKED |
| janela de retenção PITR | não aplicável/não disponível | BLOCKED |
| restore disponível | não comprovado | BLOCKED |

Não foi inferida proteção a partir de documentação genérica ou do código.

## Targets operacionais

- Target RPO proposto: até 24 horas, condicionado à contratação/configuração de backup verificável.
- Target RTO proposto: até 4 horas, condicionado a restore testado e runbook aprovado.

São targets internos, não SLA nem compromisso contratual.

## Restore test

- Data: não executado.
- Target: nenhum projeto isolado de restore foi provisionado.
- Resultado: `MANUAL_VERIFICATION_REQUIRED` / blocker aberto.
- Production não foi restaurada nem alterada.

## Ação exata

1. No Supabase do projeto production, abrir **Database → Backups** e escolher plano/retenção aceitos.
2. Ativar PITR quando o plano permitir e registrar a janela real.
3. Criar projeto isolado e temporário de restore, nunca production.
4. Restaurar um ponto disponível nesse projeto.
5. Validar apenas estrutura, RLS, migrations, índices e contagens agregadas de tenants, appointments e conversations.
6. Não copiar conteúdo ou PII para logs/relatórios.
7. Registrar data, target project ref seguro, resultado estrutural e destruir/arquivar o ambiente conforme política aprovada.

Até esses passos terminarem, o restore blocker não pode ser convertido em warning.
