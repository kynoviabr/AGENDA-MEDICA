# Release Notes — Renovação Automática de Pacientes

Data: 2026-05-16  
Versão: Renovação Automática (Clinova)

## Entregas principais

- Módulo de renovação automática implementado no banco:
  - campos em `treatments`: `renewal_enabled`, `renewal_trigger_days`;
  - tabelas: `renewal_tasks`, `renewal_interactions`;
  - índices + RLS;
  - view operacional: `v_renewal_tasks_active`;
  - trigger de detecção ao concluir sessão (`session_records`);
  - função de manutenção diária para SLA/snooze.

- Regras de detecção MVP:
  - tratamentos com múltiplas sessões: gatilho em `N-2` (caso especial `N=2 -> 1ª sessão`);
  - sessão única: tarefa criada com agendamento em `D+renewal_trigger_days`;
  - prevenção de duplicidade por tarefa ativa no ciclo.

- Sugestão de tratamento MVP (hierarquia):
  - interesse declarado -> extensão -> coocorrência -> categoria -> fallback.

- CRM:
  - bloco “Renovações pendentes” com expand/collapse;
  - cards com contexto (sessões, LTV, sugestão, SLA);
  - ações: WhatsApp, Ligar, Agendar reavaliação, Snooze, Converter, Descartar;
  - histórico/timeline de interações por tarefa.

- Agenda:
  - prefill por query string para abrir novo agendamento de reavaliação com `patientId` e `treatmentId`.

- Dashboard:
  - KPIs de renovação (geradas, convertidas, taxa, LTV de renovação, SLA > 7 dias).

## Testes automáticos

- Unit: `npm run test` ✅
- E2E flows: `npm run test:e2e:flow` ✅ (incluindo novo cenário de renovação)
- Lint nos arquivos alterados ✅

## Arquivos de suporte

- Checklist da release: `CHECKLIST_PRD_RENOVACAO_AUTOMATICA.md`
- Seed de validação: `SQL_SEED_RENOVACAO_AUTOMATICA.txt`
- Migration: `supabase/migrations/20260516120000_renewal_automation_module.sql`
