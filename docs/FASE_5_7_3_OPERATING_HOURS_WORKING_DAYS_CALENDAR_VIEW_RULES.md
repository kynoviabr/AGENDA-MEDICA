# Fase 5.7.3 — Operating Hours, Working Days & Calendar View Rules

## Objetivo

Tornar a Aura a fonte de verdade dos dias e horários de funcionamento, calcular a disponibilidade efetiva por unidade e profissional e fazer Agenda, SchedulingService, PostgreSQL, tools de IA e Knowledge Engine obedecerem à mesma regra. Esta fase foi executada sem iniciar integrações externas.

## Estado anterior e audit

Classificação do modelo encontrado antes da implementação:

| Estrutura | Classificação | Decisão |
|---|---|---|
| `clinic_locations.opening_hours` | KEEP + ADAPT | JSONB já era a fonte estruturada correta, mas não tinha schema interno validado nem interface administrativa completa. Foi preservado e passou a usar schema versionado. |
| `clinic_locations.timezone` | KEEP | Continua sendo o timezone canônico da unidade. |
| `professional_availability` | KEEP + ADAPT | Já representava profissional × unidade × weekday. Continua como fonte recorrente e agora aceita múltiplas linhas/períodos sem sobreposição. |
| `appointment_blocks` | KEEP | Continua representando indisponibilidade negativa dentro de uma janela potencialmente válida. |
| `appointments` | KEEP | Continua representando ocupação interna e eventos que não podem desaparecer da Agenda. |
| `get_available_slots` / `assert_appointment_slot` | EXTEND | Foram incorporadas as regras de unidade, profissional e exceções. |
| exceção positiva por data | EXTEND | Não existia estrutura capaz de abrir um horário especial; foi criada `scheduling_exceptions`. |
| feriados externos | DEFER | Não foi integrada API externa. O cadastro é manual. |
| Google/Doctoralia/Feegow | DEFER | Permanecem fora do escopo. |

Respostas objetivas do audit:

- O `opening_hours` anterior era JSONB livre, limitado apenas por tamanho. O formato final é validado e versionado.
- Já existiam horários recorrentes por profissional, específicos por unidade.
- O banco permitia várias linhas por weekday, mas a UI anterior editava apenas um período. A UI agora suporta múltiplos períodos.
- Não havia exceção positiva específica por data. Blocks eram suficientes apenas para indisponibilidade negativa.
- Não havia feriado operacional canônico.
- O RPC já considerava `professional_availability`, blocks e appointments, mas não o `opening_hours` da unidade nem horários especiais.
- A semana mostrava sempre sete dias e a grade usava faixa fixa de 08:00–18:30.
- A configuração é por unidade; a disponibilidade profissional é por profissional × unidade.

## Source of truth e modelo final

### Location operating hours

`clinic_locations.opening_hours` foi preservado. Formato final:

```json
{
  "schemaVersion": 1,
  "weekdays": {
    "1": [{ "start": "08:00", "end": "12:00" }, { "start": "13:00", "end": "18:00" }],
    "2": [{ "start": "08:00", "end": "18:00" }],
    "6": [{ "start": "08:00", "end": "13:00" }]
  }
}
```

Chave ausente ou array vazio significa fechado. Cada dia aceita até seis períodos. Períodos podem encostar, mas não podem se sobrepor.

### Professional working hours

`professional_availability` permanece normalizada, com uma linha por período e as chaves `clinic_id`, `location_id`, `professional_id`, `day_of_week`, `start_time`, `end_time`, vigência e estado. Várias linhas no mesmo dia representam manhã, tarde ou outras janelas.

Profissional sem regra própria fica sem disponibilidade automática. A decisão é fail closed para não inventar slots.

### Professional × location

O profissional pode atender em várias unidades. Tanto a recorrência quanto as exceções carregam unidade. A combinação profissional de uma clínica com localização de outra é bloqueada por FKs compostas e trigger de vínculo profissional–unidade.

### Weekday representation

O padrão único é o de PostgreSQL `EXTRACT(DOW)`:

- `0`: domingo
- `1`: segunda-feira
- `2`: terça-feira
- `3`: quarta-feira
- `4`: quinta-feira
- `5`: sexta-feira
- `6`: sábado

O mesmo padrão é usado no PostgreSQL, domínio TypeScript e UI.

### Timezone

Horários recorrentes pertencem ao IANA timezone de `clinic_locations.timezone`. O banco rejeita timezone inexistente por `pg_timezone_names`. O filtro provider-neutral converte instantes usando `Intl.DateTimeFormat` com o timezone da unidade; o browser não é autoridade.

## Exceptions, holidays e absences

Foi criada a tabela unificada `scheduling_exceptions`:

- `professional_id IS NULL`: exceção da unidade;
- `professional_id IS NOT NULL`: exceção do profissional naquela unidade;
- `is_closed=true`: feriado, folga, férias, congresso ou indisponibilidade integral;
- `is_closed=false`: um ou mais períodos especiais de abertura/trabalho;
- uma exceção por localização/data e uma por profissional/localização/data.

Não existe API de feriados. Feriados e horários especiais são cadastrados manualmente.

Diferenças semânticas:

- operating hours: regra positiva recorrente da unidade;
- professional availability: regra positiva recorrente do profissional naquela unidade;
- exceptions: override positivo ou negativo de uma data;
- blocks: indisponibilidade negativa dentro de um período que seria válido;
- appointments/provider busy: ocupação de um período válido.

Precedência determinística:

1. exceção fechada da unidade;
2. horário especial da unidade;
3. horário semanal da unidade;
4. exceção fechada do profissional;
5. horário especial do profissional;
6. disponibilidade recorrente do profissional;
7. interseção unidade × profissional;
8. blocks;
9. appointments ou busy/free do provider.

Uma exceção especial substitui a recorrência do mesmo nível naquela data. Nenhum `free` externo pode reabrir uma janela eliminada antes da camada de provider.

## Effective working periods

`WorkingHoursPolicy` é provider-neutral e expõe:

- `getLocationOperatingPeriods` / `isLocationOpen`;
- `getProfessionalWorkingPeriods` / `isProfessionalWorking`;
- `getEffectiveWorkingPeriods`;
- `getVisibleWeekDays`;
- `getVisibleTimeRange`;
- `isInstantInsidePeriods`.

A operação central é:

```text
unidade aberta
∩ profissional trabalhando
∩ exceções da data
∩ ausência de blocks
∩ ausência de appointment/provider busy
= slots disponíveis
```

A interseção preserva intervalos partidos. Exemplo: unidade 08–12/13–18 e profissional 10–16 resulta em 10–12/13–16.

## Scheduling integration e autoridade PostgreSQL

O PostgreSQL permanece autoritativo para o provider interno:

- `get_location_operating_periods` resolve recorrência e exceção da unidade;
- `get_professional_working_periods` resolve recorrência e exceção profissional;
- `get_effective_working_periods` calcula a interseção;
- `get_schedule_restriction_reason` diferencia `location_closed` de `professional_not_working`;
- `get_available_slots` gera candidatos apenas nas janelas efetivas e subtrai blocks/appointments;
- `assert_appointment_slot` bloqueia mutação fora do expediente com `AGENDA_OUTSIDE_OPERATING_HOURS`.

O `InternalSchedulingProvider` continua delegando ao RPC, portanto UI, IA e mutações recebem a mesma autoridade. O `SchedulingService` aplica ainda a boundary da Aura aos resultados de qualquer provider não interno. O teste com provider externo sintético livre entre 06:00 e 22:00 comprova que uma unidade 08:00–18:00 continua oferecendo apenas 08:00–18:00.

Não foram adicionados campos Google-specific ao contrato. `SchedulingLocation` carrega configuração operacional e `SchedulingProfessional` pode carregar working hours provider-neutral.

## Agenda UI

### Configurações da unidade

Em **Configurações → Unidades** existem:

- seleção da unidade;
- timezone IANA;
- checkboxes acessíveis por weekday;
- múltiplos períodos com adicionar/remover;
- preferência “Ocultar dias sem atendimento”, default ON;
- preferência “Limitar grade ao funcionamento da unidade”, default ON;
- cadastro e remoção de feriado/fechamento/horário especial.

Validação ocorre antes do save e também no PostgreSQL. O editor limita a seis períodos por dia e possui labels acessíveis.

### Disponibilidade profissional

O diálogo de disponibilidade da Agenda usa o mesmo editor semanal para o profissional selecionado na unidade selecionada. Também permite cadastrar folga/ausência ou horário especial por data, com motivo opcional.

### Comportamento da Agenda

- week: quando a preferência está ativa, oculta dias fechados da unidade; Mon–Fri gera cinco colunas e Mon–Sat seis;
- troca de unidade: refaz configuração, appointments, blocks e exceções com chave de cache que inclui a unidade;
- faixa visível: deriva menor abertura e maior fechamento dos dias visíveis, sem recorrer a 00:00–24:00;
- day: quando fechado, informa “Unidade fechada neste dia”;
- month: foi preservado e não sofreu redesign;
- profissional filtrado: a visibilidade de colunas continua sendo definida pela unidade, evitando complexidade adicional;
- evento preexistente em dia fechado: força o dia a permanecer visível e é marcado como exceção, portanto o dado não desaparece;
- legado sem `opening_hours`: a tela continua acessível com fallback visual e aviso para configurar, mas disponibilidade automática permanece fail closed.

Os cálculos de períodos são memoizados por view/range; não são refeitos para cada célula.

## AI behavior, tools e grounding

`list_locations` retorna `openingHours` sanitizado. Não foi criada tool nova.

Antes de consultar disponibilidade do provider, `get_available_slots` resolve as regras estruturadas disponíveis:

- unidade fechada: resultado controlado com `restrictionReason: location_closed`;
- profissional sem expediente: `restrictionReason: professional_not_working`;
- em ambos os casos a chamada de disponibilidade do provider é evitada;
- a Aura pode oferecer verificar outro dia, mas não troca a data silenciosamente.

`clinic_locations.opening_hours` é fonte structured-first do Knowledge Engine. Uma FAQ livre conflitante não sobrescreve o horário estruturado. Os claims continuam sujeitos ao Response Safety Validator da Fase 5.6E.

## Migration, validação e segurança

Migration aditiva: `20260816110000_phase5_7_3_operating_hours.sql`.

Ela:

- preserva `opening_hours`;
- adiciona preferências `hide_closed_days` e `limit_calendar_to_operating_hours`;
- adiciona validação de shape JSONB, weekday, HH:mm, start/end, sobreposição e máximo de períodos;
- adiciona validação IANA do timezone;
- cria `scheduling_exceptions`, índices, FKs tenant-safe, trigger de vínculo e RLS;
- impede sobreposição de `professional_availability` recorrente;
- incorpora as regras aos RPCs autoritativos;
- adiciona `hasOperatingHours` ao snapshot de readiness.

RLS:

- staff autenticado da clínica pode ler exceções;
- somente admin da própria clínica pode inserir, atualizar ou excluir;
- não existe policy `USING(true)`;
- service role mantém acesso operacional.

Readiness: `OPERATING_HOURS_NOT_CONFIGURED` é blocker obrigatório, pois permitir IA de scheduling sem expediente canônico poderia gerar slots falsos. `hasSchedulingRules` agora requer disponibilidade profissional ativa.

## Tests e evaluation

Cobertura implementada:

- Mon–Fri, Mon–Sat, domingo fechado e colunas visíveis;
- múltiplos períodos e intervalo de almoço;
- interseção profissional/unidade e horário profissional parcialmente externo;
- feriado, horário especial e folga profissional;
- isolamento multi-location;
- evento existente em dia fechado;
- faixa visível;
- timezone IANA;
- período inválido/sobreposto;
- tenant safety e RLS;
- pergunta de dia fechado e dia sem profissional sem chamada de provider;
- structured knowledge contra FAQ conflitante;
- external free/busy sintético sem expandir expediente.

Resultados locais em 16/08/2026:

| Validação | Resultado |
|---|---|
| Unit/integration Vitest | 43 arquivos, 285 testes, todos passaram |
| Testes focados 5.7.3 | 7 arquivos, 62 testes, todos passaram |
| SQL `phase5_7_3_operating_hours.sql` | passou em transação com rollback |
| SQL `phase5_transactional_scheduling.sql` | regressão passou com rollback |
| SQL `phase5_5b1_internal_scheduling_hardening.sql` | regressão passou com rollback |
| Eval fast | 71/71, gates PASS |
| Eval full | 170/170, gates PASS |
| Typecheck | passou |
| ESLint direcionado | passou sem erro ou warning |
| Build Vite | passou; permanece warning não bloqueante de chunk principal grande |

## Staging validation

O dry-run remoto listou exclusivamente `20260816110000_phase5_7_3_operating_hours.sql`. A migration foi aplicada com `db push --linked`, apareceu alinhada nos lados local e remoto em `migration list --linked`, e um novo dry-run retornou `upToDate:true` e nenhuma migration pendente.

A validação foi restrita ao staging atual. Nenhum dado de clínica foi criado ou alterado para o smoke; nenhum blocker anterior da Fase 5.7.2 foi fechado automaticamente e produção não foi criada.

Smoke visual local após o deploy: Agenda abriu normalmente; Configurações → Unidades exibiu editor semanal, timezone, duas preferências e exceções; zero erro de console. Em viewport de tablet 768×900, o documento permaneceu sem overflow horizontal (`scrollWidth 753 <= innerWidth 768`). Nenhum formulário foi salvo durante o smoke.

## What was NOT implemented

- Google Calendar, Google OAuth ou qualquer chamada Google;
- provider externo novo;
- API externa de feriados;
- Doctoralia ou Feegow;
- nova capacidade autônoma de IA;
- production;
- ativação de clínica real;
- qualquer fase posterior.

## Limitations

- Copy days não foi incluído; era opcional e o editor já permite configuração completa.
- A visualização mensal foi preservada e não marca todos os dias fechados visualmente.
- Dias sem agenda do profissional não são ocultados separadamente; as colunas seguem a unidade.
- A migration não inventa expediente para dados legados. Até configuração, a Agenda mostra aviso/fallback visual e scheduling automático fica bloqueado.
- O warning de bundle Vite acima de 500 kB é preexistente/não bloqueante e deve ser tratado em otimização futura.

## Relatório final — 46 pontos

1. **Audit:** opening hours JSONB, disponibilidade profissional, blocks, RPCs e Agenda foram auditados e classificados acima.
2. **Arquivos criados:** policy/index de operating hours, editor semanal, migration, pack SQL, testes de policy e este documento.
3. **Arquivos alterados:** domínio/provider/service de scheduling, Agenda/Unidades, Supabase types, tools/eval/readiness de IA, Knowledge Engine e regressões SQL/testes.
4. **Migration:** migration aditiva criada; `opening_hours` não foi apagado nem duplicado.
5. **Location format:** JSONB versionado `schemaVersion:1` com mapa `weekdays` e arrays de períodos.
6. **Professional format:** linhas recorrentes em `professional_availability`, uma por período.
7. **Professional × location:** horários e exceções são específicos por unidade.
8. **Weekday:** `0=domingo ... 6=sábado` em todas as camadas.
9. **Timezone:** `clinic_locations.timezone` IANA é canônico e validado no banco.
10. **Multiple periods:** até seis/dia, encostáveis, não sobrepostos.
11. **Exceptions:** `scheduling_exceptions` unifica override por unidade ou profissional/data.
12. **Holiday:** cadastro manual como fechamento ou horário especial da unidade.
13. **Professional absence:** folga/ausência integral ou horário especial por data.
14. **Precedence:** exceção específica substitui recorrência; unidade e profissional são intersectados antes da ocupação.
15. **Effective periods:** implementados na policy TypeScript e nas funções SQL.
16. **SchedulingService:** internal usa RPC; external é recortado pela boundary Aura.
17. **RPC:** availability e assertion agora rejeitam/omitem período externo ao expediente.
18. **Internal provider:** retorna somente interseção válida menos blocks e appointments.
19. **Future providers:** free/busy jamais expande working hours; contrato segue provider-neutral.
20. **Location UI:** editor semanal, timezone, preferências e exceções em Configurações → Unidades.
21. **Professional UI:** múltiplos períodos recorrentes e exceção por data.
22. **Hidden days:** dias fechados são ocultados conforme preferência, preservando dias com evento.
23. **Visible range:** menor abertura/maior fechamento dos dias visíveis.
24. **Day view:** mostra mensagem explícita quando a unidade está fechada.
25. **Existing closed-day event:** permanece acessível e identificado como exceção.
26. **AI closed day:** retorna `location_closed` sem chamada de disponibilidade do provider.
27. **Structured-first:** opening hours estruturado prevalece sobre conteúdo curado conflitante.
28. **Tools:** `list_locations` foi ampliada; nenhuma tool nova foi necessária.
29. **Grounding:** operating hours entra como fato estruturado e permanece sob safety validator.
30. **Validation:** shape, weekday, timezone, HH:mm, ordem, overlap e limite são validados em UI/domain/DB.
31. **RLS:** staff lê; admin da clínica gerencia.
32. **Tenant safety:** FKs compostas, vínculo profissional–unidade, queries clinic-scoped e teste cross-tenant.
33. **Readiness:** ausência de operating hours é blocker; regra profissional ativa também é exigida.
34. **Unit tests:** policy e comportamento visual/estruturado cobertos; suíte verde.
35. **Scheduling tests:** serviço, datasource, tool executor e error mapping verdes.
36. **SQL tests:** novo pack e duas regressões transacionais passaram.
37. **Evaluation:** quatro cenários de operating hours foram adicionados ao dataset v1, além dos testes determinísticos específicos.
38. **Eval fast:** 71/71; PASS.
39. **Eval full:** 170/170; PASS.
40. **Tenant regressions:** cross-tenant e packs de scheduling passaram.
41. **Typecheck:** passou.
42. **Lint:** direcionado passou sem erro/warning.
43. **Build:** Vite passou.
44. **Staging:** migration aplicada e confirmada no histórico remoto; dry-run pós-deploy retornou banco atualizado e zero pendências.
45. **Limitações:** listadas acima; nenhuma muda a source of truth ou permite slot indevido.
46. **Confirmação explícita:** Google Calendar NÃO foi implementado; OAuth Google NÃO foi implementado; Doctoralia NÃO foi implementado; Feegow NÃO foi implementado; nenhum provider externo foi criado; production NÃO foi criada; nenhuma clínica real foi ativada; nenhuma próxima fase foi iniciada.

## Next phase

Retornar aos blockers de staging já conhecidos antes de considerar Google. Nenhuma próxima fase foi iniciada neste trabalho.
