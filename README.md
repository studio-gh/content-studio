# Content Studio

Workspace visual do Content Studio, com calendário editorial e prévia 3:4 do feed do Instagram.

## Estado atual

- Interface de leitura conectada ao Worker do Notion.
- Módulos de leitura para Planejamento, Biblioteca e Canto das Ideias.
- O perfil do Instagram é consultado pela fonte de dados correta dentro da Central da Marca.
- Calendário mostra todos os formatos, incluindo Stories.
- Grade do Instagram oculta Stories e respeita a propriedade `Ordem no feed`.
- O painel de revisão permite navegar entre publicações com botões anterior/próxima ou pelas setas esquerda/direita.
- Ao fechar o painel, o foco retorna ao ponto de origem; respostas antigas são ignoradas quando a pessoa troca rapidamente de publicação.
- URLs de arquivos do Notion são solicitadas novamente a cada sincronização para evitar depender de links assinados antigos.
- API somente leitura nesta etapa. As rotas privadas agora exigem JWT do Cloudflare Access validado criptograficamente e associação ativa no D1 (`workspace_members`). O painel de revisão não registra aprovações externas; comentários e alterações são feitos no registro original do Notion. Não há edição persistente, reordenação por arrastar ou criação de ideias pela interface.

## Estrutura

- `index.html`: aplicação web.
- `worker.js`: API intermediária do Notion.
- `wrangler.toml`: configuração do Cloudflare Worker.
- `.github/workflows/deploy-worker.yml`: publicação manual do Worker via GitHub Actions.
- `.github/workflows/validate.yml`: verificações de sintaxe e regras essenciais.

## Multi-workspace e revisão de clientes

A migration `migrations/0001_workspace_review_foundation.sql` define workspaces, membros e papéis, conexões Notion por workspace, lotes de revisão, itens, eventos imutáveis e links de revisão com hash e expiração. A imutabilidade de `review_events` agora também é protegida por triggers no próprio banco.

A arquitetura e as regras de segurança estão documentadas em `docs/security-and-review-architecture.md`. **A migration ainda não foi aplicada e a API ainda não usa essas tabelas.** A autenticação precisa validar criptograficamente o JWT do Cloudflare Access, resolver o workspace e aplicar permissões no servidor antes de liberar qualquer dado privado ou ação de cliente.

## Worker

O Worker requer o secret `NOTION_TOKEN`. O token deve permanecer exclusivamente nos secrets do Cloudflare.

Antes de publicar, configure `NOTION_TOKEN` nos secrets do Worker no painel Cloudflare. Para usar o workflow manual, configure também os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub. O workflow exige acionamento manual e usa o ambiente `production`.

A API atual disponibiliza:
- `GET /api/health`
- `GET /api/notion-test`
- `GET /api/profile` (consulta a fonte de dados `Perfil do Instagram` dentro da Central da Marca)
- `GET /api/post/:pageId` (texto dos blocos do registro selecionado)
- `GET /api/feed?limit=100`
- `GET /api/library` (leitura do Acervo/Biblioteca)
- `GET /api/ideas` (leitura do Canto das Ideias)

A API ainda não deve ser considerada pronta para múltiplos clientes. OAuth do Notion, isolamento por workspace/marca, sessões e escrita autenticada são requisitos para a versão comercial.

## Validação

O GitHub Actions executa:
- sintaxe do Worker e dos scripts da interface;
- testes do Worker com respostas simuladas do Notion;
- separação de Stories entre calendário e grade;
- mapeamento e ordenação do feed;
- ausência da rota pública de escrita insegura;
- ausência de token do Notion no HTML;
- execução real da migration em SQLite e validação das constraints do schema.

## Pendências antes de publicar

1. Configurar D1, aplicar a migration e implementar validação JWT do Cloudflare Access, resolução de workspace e permissões server-side.
2. Implementar OAuth/conexão Notion isolada por workspace e criptografia dos tokens.
3. Publicar o Worker com secrets configurados e validar a resposta real da API.
4. Separar conteúdo demonstrativo dos dados reais de cada marca.
5. Revisar a Biblioteca de Conteúdo e o onboarding, preservando o HTML congelado.
6. Validar leitura e escrita antes de descongelar a prévia do Instagram.
7. Implementar a experiência de ideias e a biblioteca via API segura.
8. Testar a Central da Marca com uma pessoa iniciante e reduzir texto se necessário.
9. Definir preço, checkout, entrega e suporte.
10. Preparar campanha de lançamento.

A versão publicada não deve ser substituída até a conclusão dessas validações.
