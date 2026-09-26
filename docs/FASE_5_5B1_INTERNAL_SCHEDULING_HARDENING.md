# Fase 5.5B.1 — Internal Scheduling Hardening

## Objetivo

Fortalecer a autoridade interna da Agenda Aura antes de qualquer provider externo. A fase centraliza duração por modalidade no PostgreSQL, torna o lifecycle explicitamente multi-tenant, preserva convênio no reagendamento, recalcula duração na reatribuição e substitui updates diretos do Internal Provider por RPCs canônicas.

O produto continua usando PostgreSQL/Supabase como source of truth. A Agenda UI não foi migrada para `SchedulingService`.

## Problemas encontrados na 5.5B

Foram confirmados no código e nas migrations:

1. `get_available_slots` não recebia modalidade nem convênio.
2. `reschedule_appointment_secure` não copiava `billing_type` e `health_insurance_id`.
3. `reassign_appointment_professional_secure` mantinha a duração antiga.
4. confirmação e transições operacionais usavam update direto no data source interno e na Agenda UI.
5. cancelamento, reagendamento e reatribuição não recebiam `clinic_id`.
6. `types.ts` não continha as RPCs recentes nem `valid_from`/`valid_until`.

## Alterações no banco

- função canônica de duração estendida para modalidade e convênio;
- engine de slots modality-aware;
- criação validando a duração canônica e tenant de patient/lead;
- reagendamento tenant-aware com preservação de modalidade;
- reatribuição tenant-aware com recálculo do intervalo;
- cancelamento/no-show tenant-aware;
- confirmação canônica;
- transições operacionais controladas;
- grants/revokes revisados, mantendo `SECURITY INVOKER`;
- nenhuma tabela, coluna, enum, RLS, trigger, constraint ou dado histórico foi removido ou reescrito.

## Migration criada

`supabase/migrations/20260815140000_phase5_5b1_internal_scheduling_hardening.sql`

A migration é coesa, não realiza update em massa e corrige somente o comportamento futuro. Advisory locks, `assert_appointment_slot` e `appointments_no_professional_overlap` permanecem intactos.

Ela é conceitualmente reversível restaurando as definições anteriores das RPCs; não exige rollback de dados porque não transforma registros históricos.

Como o Supabase CLI não está instalado no ambiente, o arquivo foi criado manualmente seguindo a ordenação/nomenclatura existente. A aplicação no banco remoto não foi executada nesta fase local.

## Mudanças em get_available_slots

Assinatura fortalecida:

```sql
get_available_slots(
  p_clinic_id uuid,
  p_location_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_date_from date,
  p_date_to date,
  p_step_minutes integer,
  p_billing_type text,
  p_health_insurance_id uuid
)
```

O provider encaminha `billingType` e `insuranceId`. A função resolve duração no PostgreSQL antes de gerar candidatos.

A assinatura antiga de sete argumentos foi preservada como wrapper privado administrativo, usando `private` e `NULL`. Isso mantém a Agenda/Waitlist atuais compatíveis sem criar cálculo paralelo.

## Duração por modalidade

`resolve_appointment_duration(clinic, professional, treatment, billing, insurance)` é a autoridade comum.

### Particular

1. `professional_settings.private_appointment_duration_minutes`;
2. `professional_treatments.duration_minutes`;
3. `treatments.duration_minutes`;
4. `professional_settings.default_appointment_duration_minutes`;
5. fallback técnico de 30 minutos.

### Convênio

1. exige `health_insurance_id`;
2. exige convênio e vínculo profissional × convênio ativos na mesma clínica;
3. usa `professional_health_insurances.appointment_duration_minutes`;
4. mantém os mesmos fallbacks técnicos dentro da função canônica.

Parâmetros explícitos de duração continuam presentes por compatibilidade, mas, quando enviados, precisam coincidir com a duração canônica. Divergência falha com `AGENDA_DURATION_MISMATCH`.

## Reagendamento

`reschedule_appointment_secure` agora recebe `p_clinic_id`, seleciona a linha por `clinic_id + appointment_id`, recalcula a duração e cria o novo appointment copiando:

- `billing_type`;
- `health_insurance_id`;
- patient/lead;
- treatment;
- appointment type;
- contract metadata já existente;
- regras administrativas de crédito já preservadas;
- notas e encadeamento histórico.

O appointment original continua como `rescheduled` e aponta para o novo registro. Não há alteração retroativa do histórico.

## Reatribuição

A regra final é:

- preservar `start_time`;
- resolver a duração para o novo profissional, serviço, modalidade e convênio;
- recalcular `end_time` e `duration_minutes`;
- validar o intervalo completo com `assert_appointment_slot`;
- persistir somente se não houver conflito.

O provider não recalcula nada em TypeScript; ele retorna os valores confirmados pelo banco.

## Confirmação

Foi criada `confirm_appointment_secure(p_clinic_id, p_appointment_id)`. Ela aceita `scheduled` ou confirmação idempotente de `confirmed`, valida tenant/ownership, define `status = confirmed`, preenche `confirmed_at` e retorna o appointment.

O status SQL `confirmed` continua existindo. O mapper do Internal Provider continua traduzindo-o para status operacional `scheduled` com `confirmationStatus = confirmed`.

## Lifecycle/status

Foi criada `transition_appointment_status_secure` com transições controladas:

```text
scheduled → scheduled (idempotência)
confirmed → in_progress
in_progress → completed
```

Qualquer outra transição falha com `AGENDA_INVALID_STATUS_TRANSITION`. Cancelamento e no-show continuam em `cancel_appointment_secure`, agora com `clinic_id` explícito no caminho canônico.

## Multi-tenancy

- lifecycle busca appointment por `clinic_id + id` antes de modificar;
- autorização continua com `SECURITY INVOKER`, RLS e `is_clinic_staff`;
- create valida patient e lead contra a clínica;
- resolver valida convênio/vínculo contra a clínica;
- `assert_appointment_slot` continua validando unidade, profissional e tratamento;
- triggers/FKs existentes continuam protegendo relações cross-tenant;
- nenhuma RPC canônica fortalecida depende somente de appointment ID.

## clinic_id explícito

As assinaturas canônicas de cancelamento, reagendamento, reatribuição, confirmação e transição operacional recebem `p_clinic_id`.

Existe somente uma compatibilidade temporária: o overload antigo de cancelamento foi mantido exclusivamente para `service_role`, porque o fluxo legado `process-appointment-whatsapp` não pertence ao escopo de alteração. Usuários `authenticated` não recebem execução dessa assinatura antiga.

## RPCs antes/depois

| RPC | Antes | Depois |
|---|---|---|
| `resolve_appointment_duration` | 3 argumentos, sem modalidade | overload canônico de 5 argumentos + wrapper particular |
| `get_available_slots` | 7 argumentos | 9 argumentos modality-aware + wrapper de 7 |
| `create_appointment_secure` | regra de modalidade local na RPC | reutiliza resolver canônico; overload antigo ambíguo removido |
| `reschedule_appointment_secure` | sem clinic, não copiava convênio | clinic explícito, preserva convênio e recalcula duração |
| `cancel_appointment_secure` | somente appointment ID | caminho canônico com clinic; wrapper service-role temporário |
| `reassign_appointment_professional_secure` | mantinha intervalo antigo | clinic explícito e recálculo completo |
| `confirm_appointment_secure` | inexistente | criada |
| `transition_appointment_status_secure` | inexistente | criada com transições restritas |

## InternalSchedulingProvider antes/depois

Antes, slots não encaminhavam modalidade, confirmação/status faziam update direto e lifecycle dependia de RPCs sem clinic. Depois:

- slots enviam `p_billing_type` e `p_health_insurance_id`;
- confirmação usa `confirm_appointment_secure`;
- status usa `transition_appointment_status_secure`;
- cancel/no-show/reschedule/reassign enviam `p_clinic_id`;
- data source continua injetável e sem service role;
- `provider = internal` e `sourceOfTruth = aura` permanecem inalterados;
- mappers de status e confirmação permanecem como única tradução SQL → domínio.

## Error mapping

O mapeamento existente foi preservado. `AGENDA_INSURANCE_REQUIRED` e `AGENDA_DURATION_MISMATCH` foram adicionados às validações conhecidas. Os novos `AGENDA_INVALID_*` já seguem a regra de `SchedulingValidationError`.

Conflitos continuam usando SQLSTATE `23P01`/`AGENDA_SLOT_CONFLICT` e resultam em `SchedulingSlotConflictError`.

## Supabase types

`src/integrations/supabase/types.ts` recebeu um ajuste manual controlado porque a geração automática não está disponível:

- `valid_from` e `valid_until` em `professional_availability`;
- tipos das RPCs de slots, duração, create, cancel, reschedule, reassign, confirm e transition;
- overloads de compatibilidade documentados.

Não houve regeneração massiva nem diff inexplicável.

## Compatibilidade com Agenda UI atual

A Agenda continua acessando Supabase/RPC diretamente; ela não usa `SchedulingService`.

Foram feitos apenas ajustes necessários ao novo contrato:

- inclusão de `clinic_id` nas RPCs lifecycle;
- confirmação e status passaram às RPCs canônicas;
- reagendamento deixou de calcular duração no frontend;
- aceite da waitlist deixa o banco confirmar a duração canônica.

Layout, filtros, dialogs, React Query, views e comportamento visual não foram redesenhados.

## Testes SQL

Foi criado `supabase/tests/phase5_5b1_internal_scheduling_hardening.sql` e atualizado o teste transacional anterior para as assinaturas tenant-aware.

O novo script cobre:

- slots e criação particular;
- vínculo e duração de convênio;
- preservação do convênio no reagendamento;
- histórico do appointment original;
- reatribuição 30 → 45 minutos;
- recálculo de `end_time`;
- conflito na reatribuição quando 45 minutos não cabem;
- rollback integral da reatribuição falha;
- confirmação e transições válidas;
- transição inválida;
- isolamento cross-tenant;
- double booking.

Resultado de execução: **não executado**, porque `supabase --help` retorna `command not found`. Não foi declarado sucesso artificial.

## Testes TypeScript

Foram adicionados quatro casos novos aos testes existentes:

- forwarding de modalidade/convênio para slots;
- duração/convênio retornados pelo banco após reassign;
- `AGENDA_DURATION_MISMATCH` normalizado;
- transição inválida normalizada.

Também foram atualizadas as expectativas de todas as RPCs fortalecidas.

Resultados:

- scheduling direcionado: 5 arquivos e 59 testes aprovados;
- `npm test`: 15 arquivos e 91 testes aprovados;
- typecheck estrito direcionado de scheduling e tipos Supabase: aprovado;
- lint direcionado de scheduling, testes e `AppointmentsPage`: aprovado;
- `npm run build`: aprovado, com os warnings já conhecidos de Browserslist e chunk acima de 500 kB;
- E2E: não executado por ausência de `E2E_USER_EMAIL` e `E2E_USER_PASSWORD`.

## Resultado

Slots, create, reschedule e reassign compartilham a autoridade de duração do PostgreSQL. Reagendamento não perde convênio. Reatribuição preserva o início, recalcula o fim e falha de forma controlada quando o intervalo integral não cabe. O lifecycle canônico é tenant-aware.

## Limitações restantes

1. A migration e os testes SQL ainda precisam ser executados em Supabase local/descartável antes do deploy remoto.
2. O overload antigo de cancelamento permanece temporariamente para o fluxo WhatsApp legado, restrito a `service_role`.
3. A confirmação do fluxo legado WhatsApp ainda realiza update direto; não foi alterada porque WhatsApp/IA está fora do escopo.
4. Waitlist ainda não possui modalidade/convênio próprios e usa o wrapper particular de slots.
5. O enum SQL ainda mistura `confirmed` ao lifecycle; a separação permanece no domínio/mapping.
6. Os tipos foram ajustados manualmente; uma regeneração oficial continua recomendada quando CLI/ambiente estiver disponível.
7. Durações explícitas legadas divergentes agora falham controladamente com `AGENDA_DURATION_MISMATCH`.

## O que deliberadamente NÃO foi implementado

- migração da Agenda UI para `SchedulingService`;
- alteração de Dashboard, Micro CRM ou arquitetura da Waitlist;
- alteração de WhatsApp IA, prompts, tools ou agente;
- Google Calendar, Doctoralia ou Feegow;
- provider connections, contas externas ou tokens;
- external mappings, mirror, sync, webhook ou reconciliation;
- tabelas/colunas de integração externa;
- reescrita de appointments históricos.

## Próxima fase recomendada

Antes de qualquer Fase 5.5C, aplicar a migration em ambiente local/descartável, executar os dois scripts SQL e validar o diff/schema gerado. A Fase 5.5C não foi iniciada.
