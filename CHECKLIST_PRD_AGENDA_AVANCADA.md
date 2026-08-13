# Checklist PRD - Agenda Avançado (Clinova)

Última atualização: 2026-05-15

## Escopo da Release

- [x] Feature 1: Lista de Espera com Agente de Monitoramento (MVP funcional).
- [~] Feature 2: Lembrete e Confirmação via WhatsApp (infra + fila de envio) — fundação entregue.
- [~] Feature 3: Agenda Diária por WhatsApp 09:00 (resumo operacional) — base de fila/log pronta.
- [~] Feature 4: Cancelamento e Confirmação via WhatsApp (inbound/outbound) — parser + endpoint MVP.

## Regras de Implementação

- [x] Antes de criar campo/tabela, verificar se já existe no schema/código.
- [x] Todas as mudanças com testes automáticos (unit/integration/e2e conforme impacto).
- [x] Sem regressão nos fluxos atuais de CRM/Agenda/Propostas/Contratos.

## Sprint 1 (Fundação Técnica)

- [x] Criar schema da lista de espera:
  - `appointment_waitlist`
  - `waitlist_notifications`
  - `waitlist_agent_logs`
- [x] Criar índices e constraints para matching eficiente.
- [x] Implementar Edge Function `check-waitlist` (primeira versão foundation).
- [x] Criar testes unitários da lógica de janela/período e matching.
- [x] Implementar UI inicial da Lista de Espera na Agenda (modal + cadastro + listagem ativa).
- [x] Adicionar teste E2E do fluxo de cadastro na Lista de Espera.
- [x] Executar `npm run test:e2e:flow` com 9/9 cenários passando.
- [x] Implementar fundação de WhatsApp (schema + edge functions de reminder/inbound + parser testado).
- [x] Implementar webhook inbound autenticado (token/challenge) para comandos de confirmação/cancelamento.
- [x] Implementar despachante outbound de lembretes com atualização de status `pending/sent/failed`.
- [x] Executar smoke + flow E2E após integração WhatsApp foundation (sem regressões).
- [x] Implementar orquestrador de jobs com idempotência (`run-agenda-jobs`) para cron diário/horário.
- [x] Preparar integração real com provedor WhatsApp (Meta Cloud API) + fallback webhook.
- [x] Implementar deduplicação de lembretes e enriquecimento de payload (telefone/mensagem/token).

## Critério de Aceite Técnico da Release

- [ ] `npm run lint` sem erros
- [x] `npm run test` passando
- [x] `npm run test:e2e:smoke` passando
- [x] `npm run test:e2e:flow` passando
- [ ] UAT de Agenda Avançada aprovado
- [x] Matriz de aceite formal criada (`ACEITE_MODULO2_AGENDA_INTELIGENTE.md`)
