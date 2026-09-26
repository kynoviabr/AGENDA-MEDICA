# Relatório de conclusão — Fase 5.5B.1-V

**Projeto:** Agenda Med (Projeto Aura)

**Fase:** 5.5B.1-V — Validation & Deployment

**Data:** 15 de agosto de 2026

**Status:** **CONCLUÍDA**

## 1. Resumo executivo

A implementação e o endurecimento do provedor interno de agendamento foram validados em Supabase local, testados na fronteira autenticada da API, publicados no Supabase remoto e enviados ao GitHub. A Fase 5.5C não foi iniciada.

O PostgreSQL permanece como autoridade para duração, disponibilidade, conflitos, isolamento por clínica e transições do ciclo de vida. O frontend não utiliza `service_role` e não mantém cálculo paralelo de duração.

## 2. Entregas da fase

- domínio e contratos de scheduling independentes da interface;
- `SchedulingService` e `InternalSchedulingProvider` com data source injetável;
- data source Supabase para as RPCs canônicas;
- disponibilidade por particular ou convênio;
- duração canônica por profissional, tratamento, modalidade e convênio;
- criação segura de appointment;
- reagendamento preservando paciente, tratamento, modalidade, convênio e histórico;
- reatribuição recalculando duração e horário final para o novo profissional;
- confirmação, cancelamento, no-show e transições operacionais controladas;
- proteção multi-tenant por `clinic_id`, RLS e `SECURITY INVOKER`;
- advisory locks e exclusion constraint contra sobreposição;
- compatibilidade temporária com a assinatura antiga da Waitlist e com o cancelamento legado do WhatsApp;
- documentação das fases 5.5A, 5.5B e 5.5B.1.

## 3. Validação do ambiente local

| Item | Resultado |
|---|---|
| Supabase CLI | 2.114.0 |
| Docker client/server | 29.7.2 / 29.7.2 |
| Projeto local | `nklccxaeasoxjanxgqcl` |
| Migrations | 62 aplicadas em ordem |
| Primeira migration | `20260405000550_dbb13d91-c58f-48b8-8e9e-29ee3f9b1f7a.sql` |
| Última migration | `20260815140000_phase5_5b1_internal_scheduling_hardening.sql` |
| Reset completo | Aprovado duas vezes |
| PostgreSQL/API/Studio | Ativos durante a validação |

O aviso de ausência de `seed.sql` foi não bloqueante. Imgproxy e pooler não eram necessários para este ciclo de testes.

## 4. Correções comprovadas pela execução SQL

A validação real revelou e corrigiu somente problemas comprovados:

1. os testes SQL executados como `service_role` precisavam de grants de fixture dentro da transação; os grants são revertidos pelo `ROLLBACK` final;
2. a fixture transacional não vinculava o profissional à unidade primária;
3. as RPCs `SECURITY INVOKER` não tinham todos os privilégios de tabela necessários para `authenticated` e `service_role`.

A migration passou a conceder privilégios mínimos de leitura às tabelas consultadas pelo motor e `SELECT/INSERT/UPDATE` em `appointments`. RLS, ownership e validações explícitas continuam sendo a autoridade de acesso.

## 5. Testes SQL

Executados no PostgreSQL local com parada imediata em erro:

- `supabase/tests/phase5_transactional_scheduling.sql`: **APROVADO**;
- `supabase/tests/phase5_5b1_internal_scheduling_hardening.sql`: **APROVADO**.

Casos validados:

- slots e criação particular com duração de 60 minutos;
- slots e criação por convênio com duração específica;
- convênio obrigatório para modalidade `insurance`;
- rejeição de convênio inativo;
- rejeição de vínculo profissional × convênio inativo;
- particular ignora e não persiste `health_insurance_id` indevido;
- rejeição de duração explícita divergente;
- wrapper legado de disponibilidade com sete argumentos;
- reagendamento preserva `treatment_id`, modalidade, convênio e histórico;
- reatribuição de 30 para 45 minutos recalcula `end_time`;
- conflito gera SQLSTATE `23P01` e rollback integral;
- confirmação e transições válidas e inválidas;
- cancelamento e no-show;
- isolamento cross-tenant;
- bloqueio de double booking.

Foram inspecionadas 11 funções/overloads de scheduling em `pg_proc`: todas as funções canônicas permanecem `SECURITY INVOKER`, com assinaturas e ACLs esperadas. A exclusion constraint `appointments_no_professional_overlap` e a validação de período estão ativas.

## 6. Tipos Supabase

`src/integrations/supabase/types.ts` foi regenerado oficialmente a partir do schema local depois do reset final e revisado.

O arquivo gerado passou a refletir overloads corretos das RPCs, retornos completos de appointments, `valid_from`, `valid_until`, relacionamentos e funções existentes no schema.

Depois do deploy, os tipos também foram gerados do remoto. A única diferença em relação ao local foi o metadado de versão do PostgREST (`14.15`); não houve diferença de tabela, função ou assinatura de scheduling.

## 7. Testes TypeScript, lint e build

| Verificação | Resultado |
|---|---|
| Testes direcionados de scheduling | 5 arquivos, 59/59 aprovados |
| Suíte completa | 15 arquivos, 91/91 aprovados |
| ESLint direcionado | Aprovado, sem erros |
| Build de produção | Aprovado, 2.658 módulos |
| `git diff --check` | Aprovado |

Avisos não bloqueantes do build:

- base `caniuse-lite` desatualizada;
- bundle principal acima de 500 kB após minificação.

## 8. Validação funcional local

Foi usada conta sintética exclusivamente local, sem dados reais. A autenticação, RLS, grants, PostgREST e RPCs foram exercitados pela mesma fronteira HTTP usada pela aplicação.

```text
auth: PASS
rlsAndGrants: PASS
legacySlots: PASS
privateDuration: 60
insuranceDuration: 30
reschedule: PASS
reassignDuration: 45
conflictCode: 23P01
conflictRollback: PASS
lifecycle: PASS
cancellation: PASS
noShow: PASS
```

A tela de login local também foi carregada e inspecionada: renderização normal, sem erros de console. Permaneceram apenas dois avisos de compatibilidade futura do React Router. Não foram usadas credenciais reais no navegador.

## 9. Deploy no Supabase remoto

Antes do deploy:

- o projeto vinculado foi confirmado como `nklccxaeasoxjanxgqcl`;
- a lista remota continha 61 migrations;
- o dry-run apontou somente `20260815140000_phase5_5b1_internal_scheduling_hardening.sql` como pendente;
- nenhuma seed ou alteração de roles seria enviada.

O `db push --linked` foi executado com sucesso. A lista remota passou a conter as 62 migrations, incluindo a Fase 5.5B.1.

A validação pós-deploy foi deliberadamente não destrutiva: conferência do histórico remoto e geração/comparação dos tipos. Não foram criados pacientes ou appointments sintéticos no ambiente remoto.

## 10. Git e rastreabilidade

- branch: `codex/disable-mvp-modules`;
- commit técnico isolado: `ef34cd0` — `feat(scheduling): harden internal scheduling lifecycle and insurance duration`;
- 28 arquivos da fase, sem arquivos alheios;
- varredura do conteúdo staged sem credenciais ou segredos conhecidos;
- commit técnico enviado para `origin/codex/disable-mvp-modules`.

As alterações locais de outras fases permaneceram fora do commit e não foram descartadas nem sobrescritas.

## 11. Compatibilidade preservada

- Agenda atual continua utilizando seus callers existentes;
- Waitlist continua atendida pelo wrapper legado de disponibilidade, tratado como particular;
- cancelamento legado do WhatsApp permanece disponível somente a `service_role`;
- não houve implementação de Doctoralia, Google Calendar, Feegow, webhook, mirror, sincronização ou reconciliação externa;
- não houve migração ampla da UI para `SchedulingService`.

## 12. Pendências não bloqueantes e próximas fases

- executar a suíte E2E completa quando houver credenciais E2E próprias;
- atualizar Browserslist;
- avaliar code splitting do bundle;
- tornar a Waitlist consciente de modalidade em fase própria;
- remover overloads legados depois da migração dos consumidores;
- migrar consumidores de Agenda gradualmente para o `SchedulingService`;
- iniciar a Fase 5.5C somente como trabalho separado.

## 13. Critérios de conclusão

- [x] Supabase local preparado;
- [x] 62 migrations aplicadas em reset completo;
- [x] testes SQL transacionais aprovados;
- [x] correções SQL comprovadas aplicadas;
- [x] tipos oficiais regenerados e revisados;
- [x] 59 testes direcionados aprovados;
- [x] 91 testes totais aprovados;
- [x] lint direcionado aprovado;
- [x] build de produção aprovado;
- [x] smoke funcional autenticado aprovado;
- [x] compatibilidade legada verificada;
- [x] migration remota aplicada após aprovação local;
- [x] validação pós-deploy não destrutiva aprovada;
- [x] commit técnico isolado criado e enviado ao GitHub;
- [x] relatório final atualizado.

## 14. Conclusão

A Fase 5.5B.1-V está **CONCLUÍDA**. O motor interno de scheduling foi validado localmente em PostgreSQL real, passou nas suítes SQL e TypeScript, teve os tipos regenerados, foi exercitado via API autenticada, recebeu deploy remoto controlado e está versionado no GitHub. A Fase 5.5C permanece fora deste escopo e não foi iniciada.
