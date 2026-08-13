# E2E Testing

Este projeto usa Playwright para testes E2E com foco em:

- `smoke` de módulos principais
- fluxo comercial `CRM -> Proposta -> Contrato`
- fluxo `golden path` completo (`Dashboard -> CRM -> Ficha -> Proposta -> Contrato -> CRM`)
- ciclo de Kanban por etapas no CRM
- navegação das abas do Hub do Paciente
- ciclo de Agenda (`agendar -> confirmar -> remarcar -> cancelar`) com fallback para ambientes restritos

## 1) Variáveis de ambiente

Defina no terminal:

```bash
export E2E_USER_EMAIL="seu-email@teste.com"
export E2E_USER_PASSWORD="sua-senha"
```

Opcional:

```bash
export E2E_BASE_URL="http://127.0.0.1:8080"
export E2E_LEAD_NAME="Agenda teste"
export E2E_AGENDA_LEAD_NAME="E2E Agenda Seed"
```

## 1.1) Seed técnico da Agenda (recomendado)

Execute o SQL em [seed_e2e_agenda.sql](/Users/dempas/Documents/remix-of-clinic-journey/supabase/seed_e2e_agenda.sql) para garantir uma avaliação `scheduled` específica do E2E.

## 2) Rodar testes

```bash
npm run test:e2e:smoke
npm run test:e2e:flow
npm run test:e2e
npm run test:qa
```

Versão com navegador aberto:

```bash
npm run test:e2e:headed
```

## 3) Estratégia de evolução

1. Começar por `smoke` dos módulos.
2. Cobrir fluxos de negócio críticos.
3. Evoluir para testes fim a fim completos com massa robusta.
