# Checklist de onboarding da clínica piloto Aura

Nenhum item deste checklist ativa a clínica automaticamente.

## Plataforma e acesso

- [ ] Ambiente confirmado (`staging` antes de `production`).
- [ ] `APP_ENV` explícito e kill switch global testado.
- [ ] Admin e recepcionistas corretos; usuários antigos/inativos revisados.
- [ ] Secrets backend separados e rotação registrada fora do repositório.
- [ ] Backup/PITR e procedimento de restauração confirmados pelo operador.

## Clínica e agenda

- [ ] Unidade ativa, endereço, timezone e horário cadastrados.
- [ ] Profissionais ativos, locais e conselhos corretos.
- [ ] Serviços ativos, duração e regras de atendimento configurados.
- [ ] Convênios e vínculos profissional × convênio revisados.
- [ ] Consulta particular e regras de scheduling conferidas.
- [ ] Disponibilidade read-only comparada com a agenda canônica.

## WhatsApp

- [ ] Conexão Meta autorizada pela clínica.
- [ ] HMAC do webhook validado.
- [ ] Inbound e outbound testados com número autorizado sintético.
- [ ] Mensagem Meta repetida deduplicada pelo `provider_message_id`.
- [ ] Falha outbound visível sem marcar entrega.

## Aura

- [ ] `eval:ai:fast` e `eval:ai` verdes.
- [ ] Safety critical 100%, tenant 100%, grounding critical 100%.
- [ ] Reads validadas antes de active.
- [ ] Policies/FAQs revisadas, publicadas e verificadas.
- [ ] Handoff, takeover, outbound humano e no-double-response testados.
- [ ] Staff autorizado disponível para a fila.
- [ ] Mutations desligadas no primeiro active pilot.
- [ ] Confirmação, idempotência e false-success validados antes do Stage E.

## Operação

- [ ] Readiness sem blockers para o estágio escolhido.
- [ ] Warnings aceitos/documentados pela equipe interna.
- [ ] Métricas today e 7d disponíveis.
- [ ] Kill switch por clínica e global testados.
- [ ] Rollback e incidente simulados.
- [ ] Janela assistida, responsáveis e canal de comunicação definidos.
