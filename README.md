# Content Studio

Workspace visual do Content Studio, com calendário editorial e prévia 3:4 do feed do Instagram.

## Estado atual

- Interface de leitura conectada ao Worker do Notion.
- Calendário mostra todos os formatos, incluindo Stories.
- Grade do Instagram oculta Stories e respeita a propriedade `Ordem no feed`.
- URLs de arquivos do Notion são solicitadas novamente a cada sincronização para evitar depender de links assinados antigos.
- API propositalmente somente leitura nesta etapa. O painel de revisão não registra aprovações externas; comentários e alterações são feitos no registro original do Notion. Não há edição persistente, reordenação por arrastar ou criação de ideias pela interface.

## Estrutura

- `index.html`: aplicação web.
- `worker.js`: API intermediária do Notion.
- `wrangler.toml`: configuração do Cloudflare Worker.
- `.github/workflows/deploy-worker.yml`: publicação manual do Worker via GitHub Actions.
- `.github/workflows/validate.yml`: verificações de sintaxe e regras essenciais.

## Multi-workspace e revisão de clientes

Foi adicionada a fundação de schema D1 em `migrations/0001_workspace_review_foundation.sql`, cobrindo workspaces, membros e papéis, conexões Notion por workspace, lotes de revisão, itens, eventos imutáveis e links de revisão com hash e expiração.

A arquitetura e as regras de segurança estão documentadas em `docs/security-and-review-architecture.md`. **A migration ainda não foi aplicada e a API ainda não usa essas tabelas.** A autenticação precisa validar criptograficamente o JWT do Cloudflare Access, resolver o workspace e aplicar permissões no servidor antes de liberar qualquer dado privado ou ação de cliente.

## Worker

O Worker requer o secret `NOTION_TOKEN`. O token deve permanecer exclusivamente nos secrets do Cloudflare.

Antes de publicar, configure `NOTION_TOKEN` nos secrets do Worker no painel Cloudflare. Para usar o workflow manual, configure também os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub. O workflow exige acionamento manual e usa o ambiente `production`.

A API atual disponibiliza:
- `GET /api/health`
- `GET /api/notion-test`
- `GET /api/profile`
- `GET /api/post/:pageId` (texto dos blocos do registro selecionado)
- `GET /api/feed?limit=100`

A API ainda não deve ser considerada pronta para múltiplos clientes. OAuth do Notion, isolamento por workspace/marca, sessões e escrita autenticada são requisitos para a versão comercial.

## Validação

O GitHub Actions executa:
- sintaxe do Worker;
- sintaxe dos scripts da interface;
- separação de Stories entre calendário e grade;
- mapeamento e ordenação do feed;
- ausência da rota pública de escrita insegura;
- ausência de token do Notion no HTML.

## Pendências antes de publicar

1. Configurar e publicar o Worker no Cloudflare com `NOTION_TOKEN`.
2. Confirmar a URL do Worker e configurar `API_BASE` na interface.
3. Validar resposta real do Worker, perfil, imagens e URLs assinadas em navegador.
4. Testar desktop e celular.
5. Criar D1, aplicar a migration e implementar validação JWT do Cloudflare Access, resolução de workspace e permissões server-side.\n6. Implementar OAuth/conexão Notion isolada por workspace e criptografia dos tokens.\n7. Implementar revisão do cliente com links expirados/revogáveis e histórico append-only.
6. Implementar a biblioteca de conteúdo e a experiência guiada de onboarding.
7. Separar dados demonstrativos dos dados de cada marca.

A versão publicada não deve ser substituída até a conclusão dessas validações.
