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
- API somente leitura nesta etapa. As rotas privadas exigem uma sessão do Cloudflare Access configurada no próprio Worker. O Worker lê a identidade autenticada via `ctx.access`, sem precisar de chaves JWT ou segredos adicionais de Access. Não há dependência de D1 para o acesso do proprietário nesta versão. O painel de revisão não registra aprovações externas; comentários e alterações são feitos no registro original do Notion. Não há edição persistente, reordenação por arrastar ou criação de ideias pela interface.

## Estrutura

- `index.html`: aplicação web.
- `worker.js`: API intermediária do Notion.
- `wrangler.toml`: configuração do Cloudflare Worker.
- `.github/workflows/deploy-worker.yml`: publicação manual do Worker via GitHub Actions.
- `.github/workflows/validate.yml`: verificações de sintaxe e regras essenciais.

## Multi-workspace e revisão de clientes

A migration `migrations/0001_workspace_review_foundation.sql` define workspaces, membros e papéis, conexões Notion por workspace, lotes de revisão, itens, eventos imutáveis e links de revisão com hash e expiração. A imutabilidade de `review_events` agora também é protegida por triggers no próprio banco.

A arquitetura e as regras de segurança estão documentadas em `docs/security-and-review-architecture.md`. **A migration ainda não foi aplicada e a API ainda não usa essas tabelas.** Nesta versão de proprietário único, o Cloudflare Access protege o Worker e a API lê a identidade autenticada via `ctx.access`. Isso não substitui o isolamento por workspace e os papéis necessários para múltiplos clientes.

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

1. Publicar o Worker com secrets configurados e validar a resposta real da API.
2. Implementar OAuth/conexão Notion isolada por workspace e criptografia dos tokens.
4. Separar conteúdo demonstrativo dos dados reais de cada marca.
5. Revisar a Biblioteca de Conteúdo e o onboarding, preservando o HTML congelado.
6. Validar leitura e escrita antes de descongelar a prévia do Instagram.
7. Implementar a experiência de ideias e a biblioteca via API segura.
8. Testar a Central da Marca com uma pessoa iniciante e reduzir texto se necessário.
9. Definir preço, checkout, entrega e suporte.
10. Preparar campanha de lançamento.

A versão publicada não deve ser substituída até a conclusão dessas validações.
