# Settings Information Architecture and Links UX

## Objetivo

Organizar Configurações pelo fluxo de implantação da clínica e concentrar as relações operacionais por profissional em **Vínculos**, sem criar fontes de verdade paralelas.

## Fluxo lógico de implantação

Clínica → Profissionais → Serviços → Vínculos operacionais → Atendimento/Regras → WhatsApp IA → CRM → Segurança → Cadastros auxiliares.

## Menu anterior

Geral, Cargos, Conselhos, Categorias, Segurança e Acesso, Profissionais, Regras, Atendimento, Serviços, WhatsApp IA e CRM Kanban.

## Menu final

1. Geral
2. Profissionais
3. Serviços
4. Vínculos
5. Atendimento
6. Regras
7. WhatsApp IA
8. CRM Kanban
9. Segurança e Acesso
10. Cadastros

O menu é uma grade responsiva de 2 colunas no mobile, 3 no tablet e 5 no desktop, sem ordenação alfabética nem rolagem horizontal.

## Cadastros

Cadastros reúne subabas responsivas que reutilizam os componentes existentes. Nenhum CRUD paralelo foi criado.

- **Convênios:** `HealthInsurancesPage`, somente cadastro mestre da clínica.
- **Cargos:** `RolesTab`.
- **Conselhos:** `ClassEntitiesTab`.
- **Categorias:** `CategoriesTab`.

## Profissionais

Permanece responsável por dados próprios do profissional: identificação, contatos, especialidade, conselho, registro, cargo e status. Os controles de criação/edição de vínculos de unidade e serviço foram retirados. A listagem pode exibir relações em modo informativo e oferece o atalho **Gerenciar vínculos**.

## Serviços

Continua sendo o catálogo mestre baseado em `treatments`. A relação entre serviço e profissional não é administrada no cadastro mestre.

## Vínculos

A central seleciona um profissional da clínica e apresenta, nesta ordem:

1. unidades de atendimento;
2. serviços realizados;
3. convênios atendidos;
4. atendimento particular;
5. horário padrão por unidade.

Profissionais inativos são identificados. Unidades, serviços e convênios inativos mantêm vínculos legados visíveis, mas não aceitam novos vínculos. A troca de profissional pede confirmação quando há alterações não salvas.

## Sources of truth

| Entidade | Fonte canônica | Operação da Central |
|---|---|---|
| Profissional × unidade | `professional_locations` | ativa ou inativa vínculo existente |
| Profissional × serviço | `professional_treatments` | ativa ou inativa vínculo existente |
| Profissional × convênio | `professional_health_insurances` | ativa ou inativa vínculo existente |
| Horário por profissional/unidade/dia | `professional_availability` | substitui os períodos do par selecionado |
| Preço particular | `professionals.private_consultation_price` | atualiza valor existente |
| Duração particular | `professional_settings.private_appointment_duration_minutes` | atualiza configuração existente |

Nenhum JSON de vínculos foi adicionado ao profissional.

## Atendimento particular

Particular já é uma modalidade nativa do scheduling. Como não existe um booleano canônico de habilitação, a UI não cria outro campo. Ela representa a modalidade como disponível e edita somente preço e duração já existentes.

## Horário padrão do profissional

O `WeeklyHoursEditor` existente é reutilizado para cada unidade vinculada. Ele mantém múltiplos períodos por dia. Feriados, folgas, horários especiais, bloqueios e exceções continuam fora da Central de Vínculos.

## Remoção segura

- Unidade: antes da inativação, verifica agendamentos futuros, disponibilidade ativa, bloqueios futuros e exceções futuras. Falha fechada se a auditoria falhar ou houver dependência.
- Serviço: bloqueia a inativação quando existem agendamentos futuros ativos para o profissional e serviço.
- Convênio: inativa o vínculo, sem apagar agendamentos ou histórico.
- Profissional sem unidade ou horário não recebe disponibilidade automática; o comportamento continua fail closed.

## Permissões e tenant safety

Somente `admin` pode alterar vínculos. Usuários sem autorização visualizam os dados com controles desabilitados. Todas as leituras e mutations da Central usam `clinic_id` e IDs do mesmo conjunto tenant-scoped. Triggers e RLS existentes continuam garantindo integridade entre clínica, profissional, unidade, serviço e convênio.

## Migration decision

Nenhuma migration foi criada. Todas as relações necessárias e suas proteções já existiam.

## Testes

- ordem e responsividade do menu principal;
- ausência de Branding e das entradas principais antigas;
- composição dos quatro CRUDs em Cadastros;
- delegação dos vínculos operacionais pela tela Profissionais;
- carregamento de unidades, serviços, convênios e particular;
- unidade inativa e permissões de não-admin;
- horários independentes para múltiplas unidades;
- conversão de múltiplos períodos de disponibilidade;
- cálculo de ativações/inativações;
- proteção de dependências de unidade.

## O que não foi alterado

- Dados da Clínica em Geral;
- funcionamento de WhatsApp IA;
- funcionamento do CRM Kanban;
- regras e segurança/RLS;
- SchedulingService, providers, RPCs, appointments, blocks ou exceptions;
- Conversation Engine, tools, Knowledge, Safety, Handoff, avaliações ou prompts;
- Google OAuth, Google Calendar ou providers externos.
