# Fase 5 — Motor transacional da agenda

## Autoridade única

O PostgreSQL/Supabase é a autoridade final de disponibilidade. A interface pode antecipar validações, mas toda criação, remarcação, cancelamento ou reatribuição deve usar as RPCs desta fase.

## Status e ocupação

- Ocupam agenda: `scheduled`, `confirmed`, `in_progress`.
- Liberam o horário: `cancelled`, `rescheduled`.
- Permanecem como histórico encerrado: `completed`, `no_show`.

A constraint `appointments_no_professional_overlap` impede sobreposição dos status ativos para o mesmo profissional, inclusive quando duas requisições chegam simultaneamente e mesmo que apontem para unidades diferentes.

## Duração efetiva

Ordem de resolução:

1. `professional_treatments.duration_minutes`.
2. `treatments.duration_minutes`.
3. `professional_settings.default_appointment_duration_minutes`.
4. Fallback técnico de 30 minutos.

O grid padrão de busca avança em intervalos de 15 minutos. A duração do atendimento não precisa ser múltipla de 15.

## Timezone

Os eventos são persistidos em `timestamptz`. A disponibilidade semanal (`time`) é interpretada no timezone de `clinic_locations.timezone`. Isso impede que o timezone do navegador ou da Edge Function altere o dia da semana calculado.

## RPCs públicas autenticadas

- `get_available_slots`: horários canônicos disponíveis.
- `create_appointment_secure`: criação atômica.
- `reschedule_appointment_secure`: remarcação atômica com rollback integral.
- `cancel_appointment_secure`: cancelamento/falta e liberação do slot.
- `reassign_appointment_professional_secure`: reatribuição protegida.
- `resolve_appointment_duration`: duração efetiva.

As funções usam `SECURITY INVOKER`, RLS e checagem explícita de vínculo com a clínica. `anon` e `PUBLIC` não recebem execução. `service_role` é aceito para automações internas, como WhatsApp.

## Códigos funcionais de erro

- `AGENDA_SLOT_CONFLICT`
- `AGENDA_OUTSIDE_AVAILABILITY`
- `AGENDA_BLOCKED`
- `AGENDA_TREATMENT_NOT_OFFERED`
- `AGENDA_PROFESSIONAL_NOT_AT_LOCATION`
- `AGENDA_LOCATION_INVALID`
- `AGENDA_FORBIDDEN`

Esses códigos são estáveis para frontend, WhatsApp e futuras ferramentas de IA.

## Escopo futuro

O código antigo da lista de espera ainda pode calcular sugestões, porém a confirmação da vaga já passa pela RPC transacional. Em uma fase futura, o cálculo de sugestões deve consumir diretamente `get_available_slots`. Isso não altera o escopo dos módulos MVP desativados.

