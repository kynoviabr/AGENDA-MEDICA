# Configurações — Geral e Unidades

## Objetivo

Concentrar em **Configurações → Geral** os dados básicos da clínica, seus contatos administrativos e a gestão completa das unidades, sem duplicar entidades ou regras existentes.

## Dados da clínica

O bloco **Dados da Clínica** reúne `clinics.name`, apresentado como **Nome da clínica**, e `clinics.logo_url`, apresentado como **Logo da clínica**. Não foi criado nome curto. O campo legado `clinics.address` deixou de ser lido e salvo por esta tela.

O logo reutiliza integralmente o fluxo existente: bucket público `clinic-logos`, validação de PNG/JPG/WebP com limite de 2 MB, upload com `upsert` e persistência da URL em `clinics.logo_url`. Nenhuma nova tabela, coluna, migration ou source of truth foi criada.

A aba **Branding** foi removida da navegação. Os controles de cor primária, secundária, destaque, pré-visualização e textos de tema deixaram de ser expostos em Configurações. Os valores já persistidos no banco não foram apagados nem modificados automaticamente.

## Contato administrativo

Os campos existentes foram reutilizados e apenas receberam nomenclatura explícita:

- `clinics.email`: E-mail administrativo;
- `clinics.support_whatsapp`: WhatsApp administrativo;
- `clinics.phone`: Telefone administrativo.

Esses contatos servem para contrato, cobrança, suporte e relacionamento com a clínica. Eles não são copiados para nenhuma unidade.

## Responsáveis administrativos

O bloco **Contato Administrativo** também mantém dois nomes opcionais pertencentes exclusivamente à clínica:

- `clinics.administrative_manager_name`: **Gestor responsável**;
- `clinics.reception_contact_name`: **Secretária / responsável pela recepção**.

Ambos aceitam até 160 caracteres, são normalizados com trim no salvamento e são persistidos como `NULL` quando vazios. Eles são informações administrativas simples: não representam usuários, login, cargo, membership ou permissão e não possuem FK para `auth.users`.

Esses campos não definem destino de handoff, não alteram Segurança e Acesso, não são enviados à AI e não modificam WhatsApp IA. Caso essas pessoas também utilizem o sistema, seus acessos continuam sendo administrados separadamente.

## Navegação interna

As abas de Configurações usam uma grade responsiva. Em telas desktop são distribuídas em seis colunas e duas linhas equilibradas; em telas menores passam para três ou duas colunas. Isso evita que WhatsApp IA e CRM Kanban fiquem isolados em uma quebra de linha acidental.

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
| nome, logo e contatos administrativos | `clinics` |
| gestor e contato principal da recepção | `clinics.administrative_manager_name`, `clinics.reception_contact_name` |
| endereço, telefone local, timezone, estacionamento e acessibilidade | `clinic_locations` |
| expediente e preferências da Agenda | `clinic_locations.opening_hours`, `hide_closed_days`, `limit_calendar_to_operating_hours` |
| feriados e horários especiais | `scheduling_exceptions` |
| vínculo profissional × unidade | `professional_locations` |
| atendimento de pacientes via WhatsApp | configuração existente de WhatsApp IA |

`clinics.address` continua no banco somente por compatibilidade legada; não é exibido, alterado nem removido por esta tarefa.

## Component reuse

`LocationsTab` continua sendo o único componente de gestão de unidades. Ele foi convertido em lista compacta com um editor compartilhado em modal para criação e edição. O editor reutiliza `WeeklyHoursEditor`, validações da Fase 5.7.3 e queries/mutations existentes.

O modal reúne nome, telefone local, endereço, CEP, cidade, UF, timezone, estacionamento, acessibilidade, múltiplos períodos semanais, preferências visuais da Agenda e, na edição, feriados/horários especiais. A gestão de profissional × unidade pertence agora exclusivamente à seção **Profissionais**.

Não foi implementada exclusão destrutiva nem nova regra de desativação para a entidade unidade.

## Unidades tab decision

A aba separada **Unidades** foi removida da navegação de Configurações porque a gestão da entidade `clinic_locations` foi movida por reutilização para **Geral**: CRUD não destrutivo, horários e exceções. Os vínculos com profissionais são editados em **Profissionais**, sem criar uma segunda gestão concorrente de unidades.

## Profissional × unidade

O vínculo usa exclusivamente `professional_locations` e foi removido de **Geral**. No cadastro de um profissional, o administrador pode selecionar uma ou várias unidades ativas. Nenhuma unidade é escolhida automaticamente. Quando ainda não existem unidades cadastradas, a interface orienta o administrador a criá-las em **Configurações → Geral**.

Cada profissional listado apresenta suas unidades vinculadas e uma ação **Unidades**. O editor carrega os vínculos ativos já marcados, identifica a unidade principal e sinaliza unidades inativas. Uma unidade inativa não pode receber um vínculo novo; um vínculo legado ativo continua visível e pode ser removido de forma controlada.

Salvar utiliza `upsert` para criar ou reativar vínculos e `active = false` para removê-los. Não há exclusão física. Antes de desativar um vínculo, o sistema verifica:

- agendamentos futuros ativos;
- disponibilidade recorrente ativa;
- bloqueios futuros;
- exceções futuras de agenda.

Se qualquer dependência existir ou não puder ser auditada, a operação falha fechada, informa o motivo e preserva o vínculo. Um profissional pode permanecer sem unidade somente de forma explícita; nesse caso a interface alerta que ele não terá disponibilidade válida. As regras existentes de scheduling continuam exigindo profissional e unidade vinculados.

A edição é disponibilizada somente a administradores. Todas as leituras e escritas incluem `clinic_id`; RLS, chaves compostas e triggers existentes continuam responsáveis pelo isolamento entre clínicas.

## Migration decision

O logo e os contatos anteriores não exigiram migration. Para os dois responsáveis administrativos foi criada uma migration estritamente aditiva, pois não havia campo semanticamente equivalente em `clinics`. As colunas são nullable, limitadas a 160 caracteres e não alteram RLS nem registros existentes.

## Tests

- testes unitários do resumo de Mon–Fri, sábado, múltiplos períodos e horários ausentes;
- teste do endereço pertencente à unidade;
- teste do logo em Geral e da ausência da aba Branding e dos controles de cores/tema;
- testes de carregamento, trim, persistência nullable, tenant no update e bloqueio de edição para não administradores;
- testes da ausência do vínculo em Geral, carregamento de vínculos existentes, seleção múltipla, unidade principal/inativa, cálculo de adição/reativação/remoção e descrição das dependências que bloqueiam a remoção;
- typecheck, lint direcionado, build e `git diff --check`;
- testes de renderização da interface de Geral e Profissionais. O smoke visual autenticado depende de uma sessão local válida.

## What was NOT changed

- schema, RLS e políticas existentes;
- regras, RPCs ou providers de scheduling;
- Agenda ou readiness;
- Conversation Engine, Knowledge Engine, safety, tools, handoff ou prompts;
- Meta/WhatsApp IA;
- storage, schema e valores de branding já persistidos;
- Google Calendar, OAuth ou provider externo;
- production;
- qualquer outra aba de Configurações além da movimentação descrita entre Geral e Profissionais.
