# Kynovia

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
