# Checklist PRD — Renovação Automática Clinova

Última atualização: 2026-05-16

## Verificação de Duplicidade (pré-código)

- [x] `renewal_tasks` inexistente no schema atual.
- [x] `renewal_interactions` inexistente no schema atual.
- [x] `treatments.renewal_enabled` inexistente.
- [x] `treatments.renewal_trigger_days` inexistente.
- [x] Reaproveitado o módulo existente de CRM, sem duplicar Kanban.
- [x] Reaproveitado o modal existente de Agenda (`/clinic/appointments`) para reavaliação.

## Entregas implementadas nesta etapa

- [x] Migração SQL de renovação automática (tabelas, índices, RLS, view ativa).
- [x] Trigger de detecção de renovação na conclusão de sessão (`session_records` insert).
- [x] Regra de múltiplas sessões (gatilho em `N-2`, com exceção para `N=2`).
- [x] Regra de sessão única (agendamento por `D+renewal_trigger_days` via `scheduled_for`).
- [x] Prevenção de duplicatas de tarefa ativa por paciente+tratamento+contrato.
- [x] Sugestão de tratamento por regras MVP (interest → extension → cooccurrence → category → fallback).
- [x] Bloco de “Renovações pendentes” no CRM (expand/collapse).
- [x] Cards de renovação com contexto mínimo (paciente, tratamento, sessão, LTV, sugestão, SLA em dias).
- [x] Ações no card: WhatsApp, Ligar, Agendar reavaliação, Snooze 7d, Converter, Descartar.
- [x] Item “Renovações sem ação” no Radar Comercial.
- [x] Suporte de deep-link na Agenda para abrir modal com `patientId` e `treatmentId`.

## Testes automáticos executados

- [x] `npm run test` (22/22 testes unitários).
- [x] `npm run test:e2e:smoke` (1/1).
- [x] `npm run test:e2e:flow` (9/9).
- [x] `eslint` nos arquivos alterados sem erros.

## Observações de arquitetura

- O PRD cita `contract_items`, mas o projeto atual opera por `contracts + proposal_items`.
- Para evitar duplicidade estrutural, a implementação usa esse modelo vigente e mantém `contract_item_id` apenas como campo opcional na `renewal_tasks`.
