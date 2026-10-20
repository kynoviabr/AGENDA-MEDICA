# Template de Design System
## Projeto: Sistemas de Segurança e Portarias

Este template reaproveita o padrão visual do Clinova e adapta para operação de portaria, controle de acesso e monitoramento.

## 1. Direção de Produto
Objetivo da UI: permitir que operador/gestor identifique risco, pendência e ação prioritária em menos de 3 minutos.

Princípios:
1. Operacional primeiro: informações críticas no topo.
2. Zero ambiguidade: status e ações devem ser inequívocos.
3. Registro auditável: histórico e trilha de ações sempre acessíveis.
4. Baixa fricção para operação recorrente.

## 2. Mapa de Módulos (recomendado)
1. Dashboard Operacional
2. Portarias (postos, turnos, eventos)
3. Visitantes
4. Moradores/Unidades (ou colaboradores/áreas)
5. Acessos e Credenciais
6. Ocorrências
7. Rondas
8. Relatórios
9. Configurações

## 3. Layout Base
1. Sidebar fixa com ícones + rótulo.
2. Header de página com título, descrição e CTA primária.
3. Linha de filtros no topo (período, local, status, busca).
4. Cards de resumo operacional.
5. Tabela/lista principal com ações rápidas.

## 4. Paleta Semântica
Usar o mesmo modelo de tokens do Clinova:
1. `primary`: ação principal (ex.: “Registrar entrada”)
2. `success`: evento liberado/normalizado
3. `warning`: atenção necessária
4. `destructive`: bloqueio, risco, falha
5. `muted`: contexto secundário

## 5. Tipografia e Escala
1. H1: contexto do módulo (ex.: “Portaria Central”)
2. H2/H3: blocos de operação
3. Body: registros e descrições
4. Label: filtros/formulários

Priorizar legibilidade para uso contínuo.

## 6. Componentes Obrigatórios
1. `PageHeader`
2. `BrandButton`
3. `BrandBadge` para status operacionais
4. `Card` de KPI
5. `Table` com coluna de status e timestamp
6. `Dialog` de registro rápido (entrada/saída/ocorrência)
7. `Drawer` de detalhe completo do evento
8. `Toast` de confirmação/erro

## 7. Vocabulário de Status (padrão)
1. `Liberado` (success)
2. `Pendente validação` (warning)
3. `Negado` (destructive)
4. `Em análise` (info)
5. `Concluído` (success)
6. `Expirado` (muted/destructive conforme risco)

## 8. Padrão de Dashboard Operacional
Cards no topo:
1. Entradas hoje
2. Saídas hoje
3. Acessos negados
4. Ocorrências abertas
5. Alertas críticos
6. Tempo médio de atendimento

Tabela central:
1. Data/hora
2. Tipo de evento
3. Pessoa/veículo
4. Local
5. Status
6. Responsável
7. Ações

## 9. Padrão de Formulário (Portaria)
Registro rápido deve ter:
1. Tipo (visitante, prestador, entrega, veículo, colaborador)
2. Documento/identificação
3. Destino/local/unidade
4. Responsável autorizador
5. Janela de acesso
6. Observação

Regra de UX:
1. Campos críticos no topo
2. Validação inline
3. Erro explicativo dentro do modal
4. CTA primária única e evidente

## 10. Estados de Interface
1. Loading com skeleton em tabela/cards
2. Empty state com ação direta
3. Falha com mensagem acionável
4. Sucesso com toast + atualização instantânea da lista

## 11. Alertas e Prioridade
Classificação:
1. Crítico (vermelho): ação imediata
2. Alto (laranja): tratar no turno
3. Médio (amarelo): acompanhar
4. Baixo (azul/cinza): informativo

## 12. Acessibilidade e Operação
1. Navegação por teclado para operação rápida.
2. Foco visível em todos os controles.
3. Contraste forte para uso em ambientes de baixa iluminação.
4. Mensagens curtas e objetivas.

## 13. Regras de implementação
1. Reaproveitar wrappers (`PageHeader`, `BrandButton`, `BrandBadge`).
2. Não hardcodar cores por página.
3. Centralizar variantes em componentes compartilhados.
4. Definir status e semântica antes de construir telas.

## 14. Checklist de pronto para produção
1. Consistência visual com o sistema base.
2. Fluxos críticos testados (entrada, saída, bloqueio, ocorrência).
3. Feedbacks claros em sucesso/erro.
4. Estados vazios e loading implementados.
5. Responsividade validada desktop/tablet.

