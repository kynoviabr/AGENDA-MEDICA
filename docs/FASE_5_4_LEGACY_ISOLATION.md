# Fase 5.4 — Legacy Isolation & Product Cleanup

## Objetivo

Isolar o produto Aura ativo dos módulos clínicos, comerciais e financeiros legados sem apagar tabelas, dados, migrations, RLS ou código histórico. A estratégia adotada foi retirar telas antigas do grafo de rotas/imports ativos e disponibilizar superfícies administrativas focadas.

## Produto ativo após a limpeza

- Dashboard operacional da agenda.
- Agenda Dia, Semana, Mês e Equipe.
- Micro CRM administrativo.
- WhatsApp IA e inbox atual.
- Pacientes e detalhe administrativo.
- Serviços/tratamentos necessários à agenda.
- Profissionais, unidades, convênios e regras de atendimento.
- Configurações, Auth, roles, permissões e multi-tenancy.
- Portal mínimo com próximos agendamentos e histórico simples.

## Módulos legados isolados

- Propostas e itens de proposta.
- Contratos, planos, parcelas e meios de pagamento.
- Financeiro, custos, metas e renewal.
- Sessões, anamnese, evolução, métricas e fotos clínicas.
- Feedback/NPS/satisfação clínica.
- Combos, pacotes e composição de custo de tratamentos.
- Relatórios comerciais, financeiros e clínicos antigos.

As tabelas e páginas históricas permanecem no repositório. Elas não são importadas pelas rotas centrais após esta fase.

## Arquivos modificados

### Produto ativo

- `src/App.tsx`
- `src/pages/LoginPage.tsx`
- `src/components/layouts/ClinicSidebar.tsx`
- `src/components/layouts/PatientPortalLayout.tsx`
- `src/pages/portal/PortalHomePage.tsx`
- `src/pages/clinic/MicroCrmPage.tsx` — novo entry point ativo.
- `src/pages/clinic/AdministrativePatientDetailPage.tsx` — novo entry point ativo.
- `src/pages/clinic/ServicesPage.tsx` — novo entry point ativo.
- `src/pages/clinic/PatientsPage.tsx`
- `src/pages/clinic/AppointmentsPage.tsx`
- `src/pages/clinic/SettingsPage.tsx`
- `src/components/settings/KanbanStagesTab.tsx`
- `src/lib/accessPermissions.ts`

### Testes

- `e2e/smoke/modules.spec.ts`
- `e2e/smoke/dashboard-gestor-tabs.spec.ts`
- `e2e/flows/kanban-stage-lifecycle.spec.ts`
- `e2e/flows/patient-hub-tabs.spec.ts`
- specs de contrato/proposta/renewal foram marcadas explicitamente como `LEGADO ISOLADO` e `skip`.

### Documentação

- `docs/FASE_5_4_LEGACY_ISOLATION.md`

O arquivo `supabase/migrations/20260517093000_finance_contracts_forecast.sql` já estava modificado antes desta fase e não foi alterado por este trabalho.

## CRM antes/depois

### Antes

`CrmPage.tsx` consultava diretamente `proposals`, `proposal_items`, `contracts`, `renewal_tasks`, `renewal_interactions` e a view de renewal. A tela calculava valores comerciais, ticket, pipeline financeiro, criava propostas e contratos, configurava pagamentos e vinculava etapas à existência desses documentos.

### Depois

`MicroCrmPage.tsx` é o entry point da rota `/clinic/crm` e depende funcionalmente de:

- `leads`;
- `lead_interactions`;
- `lead_stage_history`;
- `patients`, somente na conversão;
- `appointments`, somente para vínculo administrativo e abertura da Agenda;
- staff/owners e `clinic_settings` para etapas configuráveis.

Permanecem criação de contato, movimentação de etapa, owner, origem, prioridade, próxima ação, follow-up, interações, histórico, conversão lead → patient e ligação com agendamento. Não existem queries de proposta, contrato, pagamento, renewal ou metas na nova tela.

Os códigos históricos de etapas foram preservados para não alterar registros existentes. A interface apresenta os conceitos do produto atual:

```text
Novo contato → Em atendimento → Interessado → Agendado → Follow-up → Perdido
```

`KanbanStagesTab` recebeu os mesmos labels para defaults futuros. Nenhum lead existente foi atualizado em massa.

## PatientDetail antes/depois

### Antes

`PatientDetailPage.tsx` carregava sessões, fotos, métricas, feedback, propostas, contratos, pagamentos e geração de contrato, além de várias abas clínicas/financeiras.

### Depois

`AdministrativePatientDetailPage.tsx` é o entry point de `/clinic/patients/:id`. A tela contém apenas:

- dados cadastrais e contato;
- endereço e observações administrativas;
- próximos agendamentos e histórico;
- profissional, unidade e particular/convênio do appointment;
- lead de origem e interações administrativas;
- atalho para novo agendamento.

Anamnese, evolução, métricas, fotos, sessões, proposta, contrato, parcelas, pagamentos, renewal e NPS não são consultados nem exibidos.

A listagem/cadastro de Pacientes também deixou de consultar contratos para filtros e deixou de criar pagadores automaticamente. Dados históricos de `payer_id` permanecem intactos no banco.

## Reports antes/depois

### Antes

`ReportsPage.tsx` apresentava receita, propostas, metas, margens/custos, contratos, parcelas e sessões.

### Depois

- “Relatórios” foi removido da sidebar e das permissões configuráveis ativas.
- `/clinic/reports/*` redireciona com segurança para `/clinic`.
- `ReportsPage.tsx` permanece como código histórico, sem import ativo.
- Nenhum novo Analytics foi implementado nesta fase.

## Portal antes/depois

### Antes

A Home consultava `session_records` e `patient_photos`, mostrava progresso de tratamento e links para sessões, evolução, fotos e contrato.

### Depois

A Home consulta somente identificação do paciente e `appointments`. Exibe próximos agendamentos e histórico administrativo simples com profissional e unidade. O layout usa “Minha Agenda”. Rotas antigas de contrato, pagamento, sessão, evolução, foto e feedback continuam redirecionando para `/portal`.

## Navegação antes/depois

### Antes

Sidebar: Dashboard, Agenda, CRM, WhatsApp IA, Pacientes, Tratamentos, Relatórios e Configurações.

### Depois

Sidebar: Dashboard, Agenda, CRM, WhatsApp IA, Pacientes, Tratamentos/Serviços e Configurações. Relatórios foi ocultado. Famílias legadas continuam sem item de menu e com redirects seguros.

A comunicação visual da tela de Login deixou de mencionar propostas, contratos, pagamentos, evolução e fotos; agora descreve WhatsApp IA, agenda, pacientes e Micro CRM.

## Dependências legadas ainda existentes

### A) Código ativo

- Redirects de compatibilidade em `src/App.tsx` para URLs antigas.
- Chaves históricas de permissão e seus labels em `accessPermissions.ts`/`AccessGroupsTab.tsx`; são preservadas para dados existentes, mas filtradas por `ACTIVE_MENU_PERMISSION_KEYS` e não aparecem na UI.
- Colunas históricas ainda podem vir em `select('*')` de entidades centrais, mas não são usadas pelos novos fluxos.

### B) Código legado isolado

- `CrmPage.tsx`, `PatientDetailPage.tsx`, `ReportsPage.tsx`, `TreatmentsPage.tsx`.
- Páginas de propostas, contratos, pagamentos, financeiro, sessões, evolução, fotos, feedback, NPS, metas e renewal.
- Componentes de anamnese, contratos, custos, metas e outros componentes filhos antigos.

### C) Migration/schema histórico

As 63 tabelas, FKs, RLS, triggers, RPCs e migrations permanecem. Referências globais a `proposals`, `contracts`, `payment_plans`, `renewal`, `sales_goals`, `session_records`, `patient_anamneses`, `patient_metrics`, `patient_photos` e `nps_responses` continuam principalmente neste grupo.

### D) Testes legados

Specs de deep link de contratos, CRM → proposta → contrato, golden path comercial e renewal foram preservadas e marcadas como `LEGADO ISOLADO`/`skip`. Testes unitários históricos ainda passam, mas não representam escopo ativo.

### E) Documentação

README, auditoria e documentos históricos continuam citando os módulos para registrar sua existência e isolamento.

## Dependências que permanecem apenas no banco

Nenhuma tabela ou coluna foi apagada. Propostas, contratos, pagamentos, custos, renewal, metas, sessões, anamnese, métricas, fotos e NPS permanecem disponíveis para preservação de dados e eventual plano posterior de arquivamento.

## Dependências que permanecem apenas em código histórico

Páginas e componentes antigos continuam compiláveis no repositório, mas não são alcançáveis pelo grafo de imports de `App.tsx`. Isso permite comparação, auditoria e recuperação de histórico sem apresentá-los como produto Aura.

## Itens deliberadamente NÃO removidos

- Schema, tabelas, colunas, FKs, triggers, functions, RPCs e RLS.
- Auth, roles, permissões e multi-tenancy.
- Agenda transacional, disponibilidade, bloqueios, waitlist e regras de duração.
- WhatsApp, conexão Meta, HMAC, criptografia, conversas e agente IA.
- `treatments`, `professional_treatments` e regras de preço/duração/IA necessárias ao produto.
- Arquivos históricos e tipos gerados do banco.
- Fluxo legado `process-appointment-whatsapp`.

Não foi criado `SchedulingService`, provider externo, mirror, mapping ou integração de agenda externa.

## Testes executados

| Verificação | Resultado |
|---|---|
| `npm run build` | **PASSOU**. 2.658 módulos transformados. Apenas warning de chunk > 500 kB/Browserslist antigo. |
| `npm test` | **PASSOU**. 10 arquivos, 32 testes. |
| `npm run lint` | **FALHOU por dívida legada preexistente**. 37 erros: 36 `no-explicit-any` em componentes de anamnese isolados e 1 `prefer-const` no `CrmPage.tsx` histórico. Nenhum erro foi reportado nas novas superfícies ativas. |
| ESLint direcionado aos arquivos ativos alterados | **PASSOU**, sem erros ou warnings. |
| `npm run test:e2e:smoke` | **BLOQUEADO PELO AMBIENTE**. O servidor iniciou, mas faltam `E2E_USER_EMAIL` e `E2E_USER_PASSWORD`; 2 testes não chegaram à aplicação autenticada. |
| Browser local — Login | **PASSOU**. Copy legado ausente, copy do produto ativo presente e nenhum erro de console observado. |

## Resultado

- CRM ativo não depende funcionalmente de propostas, contratos, renewal ou financeiro.
- PatientDetail ativo é estritamente administrativo.
- Reports legado não aparece no produto e sua rota redireciona.
- Portal não oferece jornada clínica/financeira.
- Sidebar representa o produto atual.
- Agenda, waitlist, WhatsApp/IA, Auth/RLS e multi-tenancy não tiveram arquitetura alterada.
- Nenhuma migration foi criada nesta fase.
- Nenhuma alteração de banco foi executada.

Alteração de banco recomendável no futuro, mas **NÃO executada**: planejar uma política de arquivamento/retention e, somente após estabilização e backup, avaliar retirada de FKs/colunas legadas das entidades centrais. Risco: perda de rastreabilidade e quebra de dados históricos; por isso não pertence à Fase 5.4.

## Próxima fase recomendada

`Fase 5.5A — Scheduling Domain Model + SchedulingService`
