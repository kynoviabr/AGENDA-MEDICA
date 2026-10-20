# Runbook — WhatsApp Agenda Fase 2

## Variáveis de ambiente (Supabase Functions)

- `WHATSAPP_WEBHOOK_TOKEN`: token secreto para autenticar inbound no webhook.
- `WHATSAPP_PROVIDER_WEBHOOK_URL`: endpoint do provedor WhatsApp para envio outbound.
- `WHATSAPP_PROVIDER_TOKEN`: bearer token/API key do provedor.
- `WHATSAPP_PROVIDER_MODE`: `meta_cloud_api` ou `webhook` (default `webhook`).
- `WHATSAPP_ACCESS_TOKEN`: token da Meta Cloud API (quando `meta_cloud_api`).
- `WHATSAPP_PHONE_NUMBER_ID`: phone number id da Meta Cloud API (quando `meta_cloud_api`).
- `AGENDA_JOBS_RUNNER_TOKEN`: token do orquestrador `run-agenda-jobs`.

## Funções da fase

- `send-appointment-reminder`
  - Prepara lembretes e tokens.
- `dispatch-appointment-reminders`
  - Envia pendências da fila e atualiza status `pending/sent/failed`.
  - Suporta modo `meta_cloud_api` e fallback `webhook`.
- `process-appointment-whatsapp`
  - Recebe inbound, valida token, processa `CONFIRMAR/CANCELAR`.
- `send-daily-agenda-summary`
  - Gera resumo diário e grava log operacional.
- `check-waitlist`
  - Matching de lista de espera com disponibilidade/conflitos.
- `run-agenda-jobs`
  - Orquestra os jobs por modo (`morning`, `hourly`, `manual`) com `run_key` idempotente.

## Deploy (quando for publicar)

```bash
supabase functions deploy send-appointment-reminder
supabase functions deploy dispatch-appointment-reminders
supabase functions deploy process-appointment-whatsapp
supabase functions deploy send-daily-agenda-summary
supabase functions deploy check-waitlist
supabase functions deploy run-agenda-jobs
```

## Execução manual (teste)

```bash
supabase functions invoke send-appointment-reminder --body '{"lookAheadHours":24}'
supabase functions invoke dispatch-appointment-reminders --body '{"limit":50}'
supabase functions invoke send-daily-agenda-summary --body '{}'
supabase functions invoke check-waitlist --body '{}'
supabase functions invoke run-agenda-jobs --body '{"mode":"manual"}'
```

## Exemplo inbound (webhook)

Header:
- `x-webhook-token: <WHATSAPP_WEBHOOK_TOKEN>`

Body:
```json
{
  "phone": "5511999999999",
  "message": "CONFIRMAR #abc123-token"
}
```

## Exemplo inbound Meta Cloud (estrutura real)

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "5511999999999",
                "text": { "body": "CONFIRMAR #abc123-token" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Cron sugerido (produção)

- 09:00 (BRT): `run-agenda-jobs` com `mode=morning`
- A cada 60 min: `run-agenda-jobs` com `mode=hourly`

Header recomendado:
- `x-runner-token: <AGENDA_JOBS_RUNNER_TOKEN>`
