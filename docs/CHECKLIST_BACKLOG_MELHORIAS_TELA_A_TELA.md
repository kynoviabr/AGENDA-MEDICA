# Checklist de Entrega — Backlog Melhorias Tela a Tela (Clinova)

Base: `Backlog_Melhorias_Tela_a_Tela_Clinova.docx`

## Itens implementados nesta release

- [x] #01 Pacientes: destaque visual dos cards de anamnese com urgência.
- [x] #02 Pacientes: filtro por tipo de tratamento.
- [x] #03 Pacientes: filtro por range de data de contrato.
- [x] #04 Pacientes: busca por CPF no campo principal.
- [x] #10 Propostas: busca por CPF.
- [x] #11 Propostas: filtro por período (data inicial/final).
- [x] #12 Contratos: busca por CPF (paciente/pagador).
- [x] #13 Contratos: filtro por período (data inicial/final).
- [x] #14 Contratos: filtro por tipo de tratamento.
- [x] #16 Ficha do paciente: telefone clicável para WhatsApp.
- [x] #17 Ficha do paciente: e-mail clicável com `mailto:`.
- [x] #19 Agenda: card "Não atribuído" no topo.
- [x] #20 Agenda: filtro "Não atribuído" e clique do card aplicando o filtro.
- [x] #21 Agenda: reatribuição de profissional direto no detalhe do agendamento.
- [x] #22 Sessões: card "Renovação" no topo com filtro por janela.
- [x] #05 Tratamentos: margem bruta em tempo real no modal.
- [x] #06 Combos: soma dos custos diretos no modal.
- [x] #07 Combos: margem bruta em tempo real no modal.
- [x] #08 Combos: alerta visual abaixo do custo mínimo sem bloquear salvar.
- [x] #09 Tratamentos/Combos: ação "Duplicar" disponível.
- [x] #15 Ficha do paciente: avatar com upload de foto.
- [x] #23 Evolução: carregar tratamentos contratados ao selecionar paciente.
- [x] #24 Evolução: adaptar métricas exibidas conforme tratamento selecionado.

## Duplicidades detectadas (já existia no sistema)

- Item #18 (aba Tratamentos na ficha): já existe no hub do paciente no fluxo atual.
- Parte dos itens de margem/custos de Tratamentos e Combos já estava parcialmente implementada; nesta release foi concluída.

## Banco de dados

- Sem criação de tabela/campo novo nesta release.
- Reuso de dados já existentes (`patients`, `contracts`, `contract_items`, `treatments`, `proposals`, `appointments`).
