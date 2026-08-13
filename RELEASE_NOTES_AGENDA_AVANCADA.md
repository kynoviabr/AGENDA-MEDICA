# Release Notes — Agenda Avançada Clinova

Data: 2026-05-16  
Release: Agenda Avançada (Módulo 2 — Agenda Inteligente)

## Entregas Principais

- Lista de espera operacional com:
  - cadastro de interesse por lead/paciente;
  - matching automático de vagas;
  - logs e notificações de tentativa.
- Base de WhatsApp para agenda:
  - fila de lembretes;
  - despachante outbound com status (`pending/sent/failed`);
  - webhook inbound com autenticação por token/challenge;
  - parser de comandos de confirmação/cancelamento.
- Orquestração de jobs de agenda:
  - função `run-agenda-jobs` com idempotência por chave de execução;
  - execução segura para ciclos diário/horário/manual.
- Melhorias de operação e observabilidade na Agenda:
  - ações rápidas para fila/disparo de lembretes e resumo diário;
  - indicadores de execução e saúde operacional.
- Estabilização de testes E2E:
  - suporte a `.env.e2e.local` no Playwright;
  - mensagens de erro mais claras para autenticação E2E;
  - suíte de fluxo validada com 9/9 passando no ciclo final.

## Banco e Infra

- Novas estruturas/migrações de suporte operacional da Agenda (sem duplicar entidades existentes).
- Script de referência da release:
  - `SQL_RELEASE_AGENDA_AVANCADA_FASE1.txt`

## Qualidade e Testes

Execução final desta release:

- `npm run test` ✅
- `npm run test:e2e:smoke` ✅
- `npm run test:e2e:flow` ✅

Comando único recomendado para regressão da release:

```bash
npm run test:release:agenda
```

## Observações

- `npm run lint` continua com débito técnico legado (alto volume de `any` pré-existente no projeto base), fora do escopo de fechamento desta release.
- UAT funcional com operação real deve ser executado após deploy para conclusão formal de aceite de negócio.
