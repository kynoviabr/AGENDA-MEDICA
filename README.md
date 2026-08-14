# Kynovia

## Escopo ativo do produto

Esta versão mantém ativos os módulos centrais necessários para a operação atual:

- Dashboard
- CRM
- WhatsApp IA
- Pacientes
- Tratamentos
- Agenda
- Relatórios
- Configurações

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
