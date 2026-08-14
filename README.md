# Kynovia

## Escopo ativo do produto

Esta versão mantém ativos os módulos centrais necessários para a operação atual:

- Dashboard
- CRM
- WhatsApp IA
- Pacientes
- Tratamentos
- Convênios
- Agenda
- Relatórios
- Configurações

O plano técnico para operar de 100 a 1.000 clínicas está em [`docs/ESCALABILIDADE.md`](docs/ESCALABILIDADE.md).

## Convênios e profissionais

O módulo **Convênios** permite cadastrar, por clínica, o nome do plano, registro ANS, contatos, orientações de autorização, situação e os profissionais que o atendem.

Clínicas novas recebem automaticamente uma base editável com dez marcas comuns: Unimed, Bradesco Saúde, SulAmérica Saúde, Amil, Hapvida, NotreDame Intermédica, Porto Saúde, Prevent Senior, Care Plus e CASSI. O registro ANS não é preenchido automaticamente, pois uma marca pode operar por diferentes pessoas jurídicas e registros regionais; a clínica deve informar o código correspondente ao próprio contrato.

A relação muitos-para-muitos é armazenada em `professional_health_insurances`, sempre vinculada à mesma clínica do convênio e do profissional. Essa estrutura foi criada para que o atendimento com IA possa, em uma etapa posterior, consultar com segurança quais profissionais estão disponíveis para o convênio informado pelo paciente. A estrutura está pronta; a consulta ainda precisa ser conectada ao fluxo conversacional da IA antes de ser considerada uma resposta automatizada ativa.

## WhatsApp com IA — funcionalidade central

O WhatsApp com IA faz parte do núcleo do produto e **não está entre os módulos MVP desativados**. A arquitetura é multi-clínica:

- A Kynovia configura uma única vez o aplicativo Meta, webhook, App Secret, token de verificação e chave OpenAI.
- O administrador de cada clínica clica em **Conectar WhatsApp**, entra na Meta e escolhe o próprio número pelo Embedded Signup.
- O webhook identifica automaticamente a clínica pelo `phone_number_id` recebido da Meta.
- Cada token de acesso é criptografado no servidor com AES-GCM e nunca é enviado ao navegador.
- Objetivo da IA e mensagem de transferência para atendimento humano continuam configuráveis por clínica.

### Configuração da plataforma

Variáveis públicas do frontend (ambiente de build):

```env
VITE_META_APP_ID=
VITE_META_CONFIG_ID=
```

Secrets das Supabase Edge Functions, administrados somente pela Kynovia:

```env
META_APP_ID=
META_APP_SECRET=
META_CONFIG_ID=
META_GRAPH_API_VERSION=v23.0
WHATSAPP_WEBHOOK_TOKEN=
WHATSAPP_TOKEN_ENCRYPTION_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

`WHATSAPP_TOKEN_ENCRYPTION_KEY` deve ser uma chave aleatória forte com pelo menos 32 caracteres. Não use chaves da Meta ou do Supabase como chave de criptografia. O callback único da plataforma é:

```text
https://<project-ref>.supabase.co/functions/v1/whatsapp-ai-agent
```

Não configure `WHATSAPP_AI_DEFAULT_CLINIC_ID`, `WHATSAPP_ACCESS_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID`: essas variáveis pertenciam ao protótipo de uma única clínica e foram substituídas pelo roteamento multi-clínica.

## Módulos MVP desativados

O repositório contém código de um MVP anterior para os módulos abaixo, mas eles estão **deliberadamente desativados no produto atual**:

- Propostas
- Contratos
- Pagamentos
- Financeiro Contratos
- Metas
- Sessões
- Evolução
- Fotos
- Feedback
- NPS
- Satisfação

### O que significa “desativado”

- Os módulos não aparecem na navegação da clínica.
- As abas de Configurações relacionadas a Metas, Custos, Anamnese e Parâmetros/Alertas desses módulos também ficam ocultas.
- As permissões dos módulos desativados não são oferecidas na gestão de grupos de acesso.
- Os recursos equivalentes de Contratos, Pagamentos, Sessões, Evolução, Fotos e Feedback também não aparecem no portal do paciente.
- Tentativas de abrir diretamente as rotas desses módulos são redirecionadas para o início da área correspondente.
- O código-fonte, componentes, páginas, permissões e estrutura de banco foram preservados como referência do MVP.
- Nenhum desses módulos deve ser considerado funcional, suportado ou parte do escopo comercial atual.

### Possível reativação futura

Esses módulos poderão ser avaliados e reativados futuramente. A reativação não deve se limitar a recolocar links no menu: cada módulo precisará passar por revisão de requisitos, segurança e permissões, aderência ao modelo de dados atual, testes automatizados, validação de experiência e homologação antes de voltar ao produto.

As rotas desativadas estão documentadas diretamente em `src/App.tsx`. Os itens de navegação foram removidos de `src/components/layouts/ClinicSidebar.tsx` e `src/components/layouts/PatientPortalLayout.tsx`.

## E2E rápido (Playwright)

1. Crie o arquivo de variáveis de E2E:
```bash
cp .env.e2e.example .env.e2e.local
```

2. Edite `/Users/dempas/Documents/Agenda Medica/.env.e2e.local` com usuário/senha válidos.

3. Rode os testes:
```bash
npm run test:e2e:smoke
npm run test:e2e:flow
```

O `playwright.e2e.config.ts` carrega automaticamente `.env`, `.env.e2e` e `.env.e2e.local`.

Para validação completa da release Agenda Avançada:

```bash
npm run test:release:agenda
```
