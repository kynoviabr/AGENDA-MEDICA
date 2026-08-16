# Guia operacional do piloto Aura

Este guia é para a equipe interna. Ele não substitui revisão jurídica, DPO, política de backup nem procedimento da Meta/OpenAI.

## Pré-condições

1. Use projetos separados para local, staging e production.
2. Defina `APP_ENV` explicitamente em cada Edge environment.
3. Mantenha `AURA_AI_GLOBAL_DISABLED=true` até terminar os testes de staging.
4. Confirme secrets backend, webhook HMAC, token Meta cifrado, staff e agenda.
5. Execute `npm test`, `npm run eval:ai:fast`, `npm run eval:ai`, SQL e smoke tests.
6. Confirme backup/PITR e teste de restauração com o responsável pela infraestrutura.

## Consultar health e prontidão

- Liveness: `GET /functions/v1/aura-operational-health?mode=liveness`.
- Readiness: tela **Configurações → WhatsApp IA → Status de prontidão da Aura**.
- O readiness autenticado retorna somente códigos, gates, counts e latências da clínica do usuário.
- `Not Ready` nunca deve ser contornado alterando dados diretamente no banco.

## Rollout

| Estágio | Configuração | Saída |
|---|---|---|
| A — Shadow | `ai_engine_mode=shadow`; mutations off | legacy envia; Aura mede |
| B — Active Read | `active`; reads validadas; mutations off | Aura envia e apenas lê |
| C — Knowledge | knowledge verificada e habilitada | respostas administrativas grounded |
| D — Handoff | handoff validado e staff disponível | fila humana operacional |
| E — Mutation | confirmação/idempotência homologadas | mutations controladas |

Avance um estágio por vez. Janela inicial recomendada: um dia útil assistido em shadow e pelo menos dois dias úteis observados por estágio ativo, ajustável ao volume; não é SLA.

## Desligamento e rollback

1. Incidente amplo: `AURA_AI_GLOBAL_DISABLED=true`.
2. Incidente isolado: `is_enabled=false` ou `ai_engine_mode=legacy` na clínica.
3. Mutation: `ai_mutation_tools_enabled=false` primeiro.
4. Knowledge: `ai_knowledge_enabled=false`.
5. Handoff automático: `ai_handoff_enabled=false`; conversas humanas continuam humanas.
6. Prefira flags antes de rollback de frontend/Edge/migration.
7. Não reverta migration destrutivamente; publicar migration corretiva aditiva.

## Incidentes

- **SEV1:** tenant leak, mutation não autorizada ou exposição de secret. Acione kill switch global, preserve auditoria sem copiar PHI e suspenda rollout.
- **SEV2:** indisponibilidade ampla de IA/WhatsApp ou mutations repetidamente falhando. Desligue o gate afetado.
- **SEV3:** falha isolada de tool/knowledge. Mantenha handoff e corrija a configuração.

Fluxo: detectar → conter → desligar feature afetada → investigar por correlation ID → corrigir → validar em staging → reabilitar gradualmente.

## Smoke seguro

Staging usa clínica, contato e dados exclusivamente sintéticos. Valide webhook assinado, inbound, conversation, knowledge, disponibilidade read-only, safety, handoff e outbound. Production começa com liveness/readiness e consultas não destrutivas; não crie appointment real automaticamente.
