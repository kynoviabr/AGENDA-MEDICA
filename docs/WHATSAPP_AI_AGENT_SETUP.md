# WhatsApp AI Agent MVP

Este MVP responde automaticamente leads que chamam a clinica no WhatsApp.

## Escopo inicial

- Recebe webhook da WhatsApp Cloud API.
- Ignora eventos que nao sejam mensagens de texto.
- Cria ou atualiza um lead no CRM como `new_lead` e origem `whatsapp_ai`.
- Salva conversa e mensagens.
- Chama a OpenAI API para gerar resposta curta.
- Envia a resposta pelo WhatsApp.
- Registra a interacao no historico do lead.

Fora do escopo inicial:

- Campanhas ativas.
- Templates marketing.
- Agendamento automatico.
- Diagnostico medico.
- Negociacao complexa.
- Multi-numero por clinica.

## Secrets necessarios

Configure estes secrets no Supabase:

```bash
supabase secrets set WHATSAPP_ACCESS_TOKEN="..."
supabase secrets set WHATSAPP_PHONE_NUMBER_ID="..."
supabase secrets set WHATSAPP_WEBHOOK_TOKEN="um-token-que-voce-define"
supabase secrets set META_APP_SECRET="..."
supabase secrets set OPENAI_API_KEY="..."
supabase secrets set OPENAI_MODEL="gpt-5.6-luna"
supabase secrets set WHATSAPP_AI_DEFAULT_CLINIC_ID="..."
```

O `WHATSAPP_AI_DEFAULT_CLINIC_ID` deve ser o `id` da clinica que recebera os leads enquanto o MVP tiver apenas um numero conectado.

## Webhook Meta

Depois de fazer deploy da Edge Function, use a URL:

```txt
https://<project-ref>.supabase.co/functions/v1/whatsapp-ai-agent
```

No painel da Meta:

- Callback URL: URL acima.
- Verify token: mesmo valor de `WHATSAPP_WEBHOOK_TOKEN`.
- Webhook fields: `messages`.

## Banco

A migration `20260805120000_whatsapp_ai_agent.sql` cria:

- `whatsapp_ai_conversations`
- `whatsapp_ai_messages`

Ambas usam RLS para leitura pela equipe da clinica. A Edge Function escreve usando service role.

## Segurança e limites

- `META_APP_SECRET` habilita validacao de assinatura `x-hub-signature-256`.
- A IA nao deve diagnosticar, prometer resultados ou inventar precos.
- O prompt orienta a conduzir o lead para avaliacao humana.
- Chaves ficam apenas em Supabase Secrets, nunca no frontend.

## Deploy

Quando a conta Meta e a chave OpenAI estiverem prontas:

```bash
supabase functions deploy whatsapp-ai-agent --no-verify-jwt
```

Se o Supabase CLI nao estiver instalado, a funcao pode ser criada/deployada pelo Dashboard ou por uma maquina com Supabase CLI autenticado.
