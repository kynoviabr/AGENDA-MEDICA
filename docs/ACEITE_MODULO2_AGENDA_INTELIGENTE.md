# Matriz de Aceite — Módulo 2 Agenda Inteligente

Última atualização: 2026-05-16

## Requisitos Funcionais (RF-AGD)

- [ ] `RF-AGD-01` Visão diária, semanal e mensal completas (consolidado + por profissional) — parcial
- [ ] `RF-AGD-02` Visão diária com colunas por profissional e slots configuráveis — parcial
- [x] `RF-AGD-03` Criar agendamento via fluxo direto na agenda
- [x] `RF-AGD-04` Validação de conflito de horário em criação/remarcação
- [x] `RF-AGD-05` Alerta de anamnese inválida ao selecionar paciente
- [ ] `RF-AGD-06` Disparo pleno de consulta de crédito ao criar avaliação — parcial
- [ ] `RF-AGD-07` Planejamento em lote com frequência configurável — parcial
- [ ] `RF-AGD-08` Prévia completa do lote antes de salvar — parcial
- [ ] `RF-AGD-09` Detecção de conflitos no lote antes de salvar — parcial
- [x] `RF-AGD-10` Status principais (confirmado, concluído, no-show, cancelado)
- [x] `RF-AGD-11` No-show com fluxo de remarcação
- [ ] `RF-AGD-12` Drag-and-drop para remarcação — pendente
- [ ] `RF-AGD-13` Indicadores de ocupação semanal por profissional — parcial
- [x] `RF-AGD-14` Gestão de disponibilidade semanal
- [x] `RF-AGD-15` Bloqueios pontuais de agenda
- [ ] `RF-AGD-16` Botão “Incluir Agenda” no paciente pré-preenchido — parcial
- [ ] `RF-AGD-17` Vínculo forte com item de contrato para saldo — parcial
- [ ] `RF-AGD-18` Badge de crédito no card de agendamento — pendente
- [ ] `RF-AGD-19` Destaque não confirmado >24h — pendente
- [x] `RF-AGD-20` Filtros por profissional e status/tipo

## User Stories (US-AGD)

- [ ] `US-AGD-01` Recepção vê agenda operacional do dia (lado a lado) — parcial
- [x] `US-AGD-02` Criação rápida de agendamento
- [ ] `US-AGD-03` Planejar sessões pós-venda em lote — parcial
- [ ] `US-AGD-04` Profissional vê apenas própria agenda por padrão — parcial
- [x] `US-AGD-05` Alerta de anamnese ao agendar
- [ ] `US-AGD-06` Taxa de ocupação semanal para gestão — parcial
- [x] `US-AGD-07` No-show + remarcação no fluxo
- [x] `US-AGD-08` Bloqueio de agenda por período

## Agenda Avançada (nova release)

- [x] Lista de espera (cadastro + listagem + matching + agendar vaga encontrada)
- [x] Fila de lembretes WhatsApp (foundation)
- [x] Processamento de comandos WhatsApp confirmar/cancelar (foundation + webhook autenticado)
- [x] Geração de resumo diário operacional (foundation)
- [~] Integração real com provedor WhatsApp (envio outbound) — despachante pronto; faltando plug de provedor final
- [x] Webhook inbound produtivo com autenticação por token de ambiente
- [ ] Cron 09:00 automático configurado em produção
