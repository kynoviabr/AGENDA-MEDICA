# Design System Clinova

## 1. Objetivo
Este documento descreve o Design System aplicado no projeto Clinova para garantir consistência visual, usabilidade e velocidade de implementação entre módulos.

## 2. Princípios
1. Clareza operacional: informação importante visível em poucos segundos.
2. Consistência: padrões únicos de layout, componentes e feedbacks.
3. Eficiência: fluxos com baixa fricção para tarefas repetitivas.
4. Escalabilidade: componentes reutilizáveis e variantes controladas.
5. Acessibilidade: foco, contraste e navegação por teclado.

## 3. Stack de UI
1. React + TypeScript
2. Tailwind CSS
3. shadcn/ui + Radix UI
4. Lucide Icons
5. class-variance-authority (CVA)
6. TanStack Query (estado assíncrono)

## 4. Arquitetura Visual
1. Estrutura padrão com sidebar + área principal de conteúdo.
2. Cabeçalho da página com título, descrição e ações principais.
3. Blocos de filtros no topo em card/linha horizontal.
4. Tabelas e cards como superfícies primárias de dados.
5. Modais/drawers para criação, edição e detalhes.

## 5. Tokens de Design
Usar tokens semânticos (não hex direto em página):
1. `--background`, `--foreground`
2. `--card`, `--card-foreground`
3. `--primary`, `--primary-foreground`
4. `--secondary`, `--secondary-foreground`
5. `--muted`, `--muted-foreground`
6. `--accent`, `--accent-foreground`
7. `--destructive`, `--destructive-foreground`
8. `--border`, `--input`, `--ring`

Estados semânticos adicionais recomendados:
1. `success`
2. `warning`
3. `info`

## 6. Tipografia
1. Fonte sans moderna, legível em telas administrativas.
2. Escala recomendada:
   - H1: 30-36, semibold
   - H2: 24-28, semibold
   - H3: 20-22, semibold
   - Body: 14-16, regular
   - Label/auxiliar: 12-14, medium
3. `muted-foreground` para textos de suporte.

## 7. Espaçamento e Grid
1. Base de espaçamento em múltiplos de 4 (`p-2`, `p-4`, `p-6`).
2. Distância padrão entre blocos: `gap-4` ou `gap-6`.
3. Cards com padding consistente e alinhamento vertical previsível.
4. Densidade equilibrada para operações administrativas.

## 8. Borda, Raio e Sombra
1. `rounded-lg` como padrão para cards e inputs.
2. Borda discreta em superfícies de dados.
3. Sombras leves para destaque, sem exagero.

## 9. Componentes Base
1. `PageHeader`: título + descrição + CTA(s).
2. `BrandButton`: variantes `primary`, `outline`, `ghost`, `destructive`.
3. `BrandBadge`: status semântico.
4. `Card` e `CardContent` para blocos de informação.
5. `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`.
6. `Tabs` para submódulos.
7. `Table` para listagens operacionais.
8. `Dialog` para fluxos de criação/edição.
9. `Toast` para feedback de ação.

## 10. Padrão de Página
1. Título e descrição no topo.
2. Filtros de busca/status/período logo abaixo.
3. Cards de resumo quando fizer sentido analítico.
4. Tabela principal com ações por linha.
5. Modal/drawer para detalhe e manutenção.

## 11. Estados de Interface
1. Loading: spinner/skeleton por bloco.
2. Empty state: mensagem objetiva + ação sugerida.
3. Error state: linguagem clara e acionável.
4. Sucesso: toast e atualização de UI imediata.
5. Validações de formulário no próprio contexto (campo/modal).

## 12. Regras de Formulário
1. Labels sempre visíveis.
2. Campos obrigatórios marcados.
3. Mensagens de erro claras e específicas.
4. Botões primários desabilitados quando pré-condições não forem atendidas.
5. Evitar depender só de toast para validação crítica.

## 13. Padrões de Tabela
1. Cabeçalho fixo e legível.
2. Colunas de identificação no início (nome/código/status).
3. Busca textual + filtros combináveis.
4. Estados vazios e carregamento alinhados ao contexto.
5. Ações por linha consistentes (ver, editar, status).

## 14. Badges e Status
Padrão semântico recomendado:
1. Draft/Rascunho: neutro
2. Pendente: warning
3. Aprovado/Concluído: success
4. Rejeitado/Erro: destructive
5. Informativo: info

## 15. Acessibilidade
1. Contraste AA mínimo.
2. Focus ring visível em todos os elementos interativos.
3. Navegação por teclado para tabs, modal e selects.
4. `aria-*` em componentes customizados.
5. Mensagens de erro com contexto semântico.

## 16. Motion e Microinterações
1. Transições curtas (150-250ms).
2. Sem animações distrativas em telas operacionais.
3. Hover/focus/pressed consistentes.

## 17. Convenções de Código
1. Evitar estilos inline para regras recorrentes.
2. Extrair variantes para componentes compartilhados.
3. Manter tokens e semântica de cor centralizados.
4. Evitar duplicação de lógica de UI entre páginas.

## 18. Checklist de Qualidade Visual
1. Espaçamentos consistentes entre seções.
2. Botões com variantes corretas.
3. Inputs/selects com altura e alinhamento padronizados.
4. Mensagens de erro legíveis e no contexto certo.
5. Tela funcional em desktop e mobile.
6. Sem hardcode de cor fora dos tokens.

## 19. Governança
1. Novo componente só entra no sistema se tiver variante definida.
2. Refatorar duplicações para componentes compartilhados.
3. Revisão visual obrigatória em PR de interface.

