# Configurações — Geral e Unidades

## Objetivo

Concentrar em **Configurações → Geral** os dados básicos da clínica, seus contatos administrativos e a gestão completa das unidades, sem duplicar entidades ou regras existentes.

## Dados da clínica

O bloco **Dados da Clínica** mantém exclusivamente `clinics.name`, apresentado como **Nome da clínica**. Não foi criado nome curto. O campo legado `clinics.address` deixou de ser lido e salvo por esta tela.

## Contato administrativo

Os campos existentes foram reutilizados e apenas receberam nomenclatura explícita:

- `clinics.email`: E-mail administrativo;
- `clinics.support_whatsapp`: WhatsApp administrativo;
- `clinics.phone`: Telefone administrativo.

Esses contatos servem para contrato, cobrança, suporte e relacionamento com a clínica. Eles não são copiados para nenhuma unidade.

## Diferença entre WhatsApp administrativo e WhatsApp IA

O WhatsApp administrativo é um contato institucional salvo em `clinics.support_whatsapp`. Ele não é conectado a Meta, webhook, conversas, atendimento ou agendamento de pacientes.

O número usado pela Aura para pacientes continua sendo configurado exclusivamente em **Configurações → WhatsApp IA**. Nenhum componente, schema ou comportamento de WhatsApp IA foi alterado.

## Unidades

A seção **Unidades** usa exclusivamente `clinic_locations`. Ela apresenta cards compactos e responsivos com:

- nome e indicação de unidade principal/inativa;
- endereço resumido ou cidade/UF;
- telefone local;
- resumo legível dos dias e horários;
- alerta discreto quando o expediente ainda não foi configurado;
- ação **Editar unidade**.

Quando não há unidades, o empty state orienta a cadastrar pelo menos uma unidade para endereço, horários e Agenda.

## Source of truth

| Responsabilidade | Source of truth |
|---|---|
| nome e contatos administrativos | `clinics` |
| endereço, telefone local, timezone, estacionamento e acessibilidade | `clinic_locations` |
| expediente e preferências da Agenda | `clinic_locations.opening_hours`, `hide_closed_days`, `limit_calendar_to_operating_hours` |
| feriados e horários especiais | `scheduling_exceptions` |
| vínculo profissional × unidade | `professional_locations` |
| atendimento de pacientes via WhatsApp | configuração existente de WhatsApp IA |

`clinics.address` continua no banco somente por compatibilidade legada; não é exibido, alterado nem removido por esta tarefa.

## Component reuse

`LocationsTab` continua sendo o único componente de gestão de unidades. Ele foi convertido em lista compacta com um editor compartilhado em modal para criação e edição. O editor reutiliza `WeeklyHoursEditor`, validações da Fase 5.7.3 e queries/mutations existentes.

O modal reúne nome, telefone local, endereço, CEP, cidade, UF, timezone, estacionamento, acessibilidade, múltiplos períodos semanais, preferências visuais da Agenda e, na edição, feriados/horários especiais. A gestão de profissional × unidade foi preservada na mesma seção.

Não foi implementada exclusão destrutiva nem desativação nova.

## Unidades tab decision

A aba separada **Unidades** foi removida da navegação de Configurações porque toda sua funcionalidade foi movida por reutilização para **Geral**: CRUD não destrutivo, horários, exceções e vínculos profissionais. Não existe uma segunda tela independente concorrendo sobre `clinic_locations`.

## Migration decision

Nenhuma migration foi criada. Os campos `name`, `email`, `phone` e `support_whatsapp` já atendem aos dados administrativos; `clinic_locations` e `scheduling_exceptions` já atendem à gestão das unidades.

## Tests

- testes unitários do resumo de Mon–Fri, sábado, múltiplos períodos e horários ausentes;
- teste do endereço pertencente à unidade;
- typecheck, lint direcionado, build e `git diff --check`;
- smoke visual local de Geral, editor adicionar/editar, ausência da aba duplicada e responsividade sem overflow.

## What was NOT changed

- schema, RLS e políticas existentes;
- regras, RPCs ou providers de scheduling;
- Agenda ou readiness;
- Conversation Engine, Knowledge Engine, safety, tools, handoff ou prompts;
- Meta/WhatsApp IA;
- Google Calendar, OAuth ou provider externo;
- production;
- qualquer outra aba de Configurações além da remoção da referência redundante de Unidades.
