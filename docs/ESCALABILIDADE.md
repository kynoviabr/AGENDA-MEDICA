# Escalabilidade: 100 a 1.000 clínicas

## Objetivo

Esta arquitetura foi preparada para iniciar com aproximadamente 100 clínicas e crescer para 1.000 clínicas em 12 meses sem criar um projeto Supabase, banco ou aplicação por clínica.

O número de clínicas, sozinho, não determina a carga. O planejamento operacional deve acompanhar usuários ativos, mensagens de WhatsApp por minuto, agendamentos por dia, armazenamento e consumo de tokens da IA.

## Arquitetura adotada

- **Banco multi-tenant compartilhado:** todas as entidades operacionais usam `clinic_id`.
- **Isolamento:** RLS valida a relação do usuário com a clínica em cada tabela exposta.
- **Índices por clínica:** consultas de agenda, CRM e WhatsApp começam por `clinic_id` e pelos campos usados em filtros e ordenação.
- **WhatsApp multi-clínica:** `phone_number_id` identifica a clínica e possui índice único.
- **Webhook rápido:** a Meta recebe confirmação após validação e o processamento da IA continua como tarefa de background.
- **Idempotência:** `provider_message_id` impede que tentativas repetidas da Meta gerem mensagens duplicadas.
- **Credenciais:** chaves globais permanecem em Supabase Secrets; tokens das clínicas ficam criptografados.

## Fases de capacidade

| Fase | Clínicas | Ação operacional mínima |
| --- | ---: | --- |
| Lançamento | até 100 | Plano Supabase Pro, alertas de uso, backups e logs das Edge Functions |
| Crescimento | 100–500 | Acompanhar p95 do webhook, conexões do banco, tamanho das tabelas e custo de IA semanalmente |
| Escala | 500–1.000 | Teste de carga com tráfego realista, Log Drains/alertas, orçamento de IA por clínica e revisão do plano computacional |

## Indicadores obrigatórios

- Webhook: quantidade, erros, duração p50/p95/p99 e mensagens repetidas.
- OpenAI: tokens, custo, latência, erros e consumo por clínica.
- Meta: falhas de envio, qualidade dos números e limites de mensagens por conta.
- Banco: CPU, memória, conexões, cache hit, crescimento de `whatsapp_ai_messages`, consultas lentas e locks.
- Produto: clínicas ativas, usuários ativos, leads, agendamentos e mensagens por clínica.

## Limites e evolução

Background Tasks eliminam a espera da Meta, mas continuam sujeitas ao tempo máximo da Edge Function. Antes de tráfego sustentado ou campanhas em massa, o processamento deve evoluir para uma fila durável com retentativas e dead-letter queue. Essa decisão deve ser orientada pelo volume de mensagens por minuto, não apenas pelo total de clínicas.

O banco compartilhado atende a meta inicial se as consultas mantiverem `clinic_id`, os índices forem monitorados e o plano Supabase acompanhar o uso. Particionamento de tabelas ou separação física de tenants só deve ser considerado com métricas reais que mostrem necessidade.

## Critérios antes de liberar 1.000 clínicas

1. Executar teste de carga com picos de WhatsApp, CRM e agenda simultâneos.
2. Confirmar que nenhuma consulta operacional relevante faz varredura global sem `clinic_id`.
3. Configurar alertas de banco, Edge Functions, Meta e OpenAI.
4. Validar restauração de backup e procedimento de incidente.
5. Definir retenção/arquivamento das mensagens e anexos.
6. Implementar limites comerciais e proteção contra abuso por clínica.
7. Revisar LGPD, auditoria, exportação e exclusão de dados.
