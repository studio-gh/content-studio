import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("worker.js", "utf8");
const loaded = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const worker = loaded.default;

const env = { NOTION_TOKEN: "mock-token" };
const accessContext = { access: { getIdentity: async () => ({ email: "owner@example.com" }) } };
const authorizedRequest = (url, init = {}) => new Request(url, init);

const post = {
  id: "page-post-1",
  url: "https://www.notion.so/page-post-1",
  last_edited_time: "2026-11-17T12:00:00.000Z",
  properties: {
    "Publicação": { type: "title", title: [{ plain_text: "Post de teste" }] },
    "Data": { type: "date", date: { start: "2026-11-20" } },
    "Editoria": { type: "select", select: { name: "Bastidores" } },
    "Formato": { type: "select", select: { name: "Stories" } },
    "Status": { type: "status", status: { name: "Pronto" } },
    "Categoria": { type: "select", select: { name: "Arte" } },
    "Pilar": { type: "select", select: { name: "Produto" } },
    "Objetivos": { type: "multi_select", multi_select: [{ name: "Vender" }] },
    "Tags": { type: "multi_select", multi_select: [{ name: "Processo criativo" }] },
    "Ordem no feed": { type: "number", number: 3 },
    "Prévia do feed": { type: "files", files: [{ type: "file", name: "preview.png", file: { url: "https://files.notion.so/signed-preview" } }] }
  }
};

const profile = {
  id: "profile-1",
  url: "https://www.notion.so/profile-1",
  properties: {
    "Nome exibido": { type: "rich_text", rich_text: [{ plain_text: "Marca Teste" }] },
    "@ do Instagram": { type: "rich_text", rich_text: [{ plain_text: "marca.teste" }] },
    "Bio": { type: "rich_text", rich_text: [{ plain_text: "Bio de teste" }] },
    "Site": { type: "url", url: "https://example.com" },
    "Foto do perfil": { type: "files", files: [] }
  }
};

const feedQuerySizes = [];
const libraryItem = {
  id: "library-item-1",
  url: "https://www.notion.so/library-item-1",
  properties: {
    "Nome": { type: "title", title: [{ plain_text: "Moodboard de campanha" }] },
    "Tipo": { type: "select", select: { name: "Imagem" } },
    "Categoria": { type: "select", select: { name: "Referências" } },
    "Marca": { type: "select", select: { name: "Marca exemplo" } },
    "Descrição": { type: "rich_text", rich_text: [{ plain_text: "Referência visual de teste." }] },
    "Tags": { type: "multi_select", multi_select: [{ name: "Inspiração" }] },
    "Link do Drive": { type: "url", url: "https://drive.google.com/example" },
    "Arquivo": { type: "file", files: [{ type: "external", name: "moodboard.jpg", external: { url: "https://example.com/moodboard.jpg" } }] }
  }
};
const ideaItem = {
  id: "idea-item-1",
  url: "https://www.notion.so/idea-item-1",
  created_time: "2026-11-18T10:00:00.000Z",
  properties: {
    "Ideia": { type: "title", title: [{ plain_text: "Série de referências do mês" }] },
    "Anotação": { type: "rich_text", rich_text: [{ plain_text: "Reunir descobertas em uma publicação recorrente." }] },
    "Tema": { type: "select", select: { name: "Design" } },
    "Status": { type: "status", status: { name: "Nova" } },
    "Origem": { type: "url", url: "https://example.com/reference" },
    "Criada em": { type: "created_time", created_time: "2026-11-18T10:00:00.000Z" }
  }
};

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === "https://test.cloudflareaccess.com/cdn-cgi/access/certs") return Response.json({ keys: [publicJwk] });
  if (url.includes("/data_sources/")) {
    const dataSourceId = url.split("/data_sources/")[1].split("/")[0];
    if (dataSourceId === "3d40dbe6-469b-44ef-b678-8fa30f9ce7f2") return Response.json({ results: [libraryItem], has_more: false });
    if (dataSourceId === "ec75898c-2fbc-4d40-8be0-19f8e3ac01bb") return Response.json({ results: [ideaItem], has_more: false });
    if (dataSourceId === "e82f8a29-82ef-4397-aebf-cd62f1222cc4") return Response.json({ results: [profile], has_more: false });
    feedQuerySizes.push(Number(new URL(url).searchParams.get("page_size") || JSON.parse(init.body || "{}").page_size));
    return Response.json({ results: [post], has_more: false, next_cursor: null });
  }
  if (url.includes("/blocks/")) {
    const page = new URL(url).searchParams.get("start_cursor");
    if (!page) return Response.json({ results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Legenda de teste do post." }] } }], has_more: true, next_cursor: "cursor-2" });
    return Response.json({ results: [{ type: "heading_2", heading_2: { rich_text: [{ plain_text: "Detalhes adicionais." }] } }], has_more: false, next_cursor: null });
  }
  if (url.includes("/databases/")) {
    return Response.json({ results: [profile], has_more: false });
  }
  if (url.endsWith("/users/me")) {
    return Response.json({ name: "Content Studio Test" });
  }
  throw new Error("Unexpected mocked URL: " + url);
};

const health = await worker.fetch(new Request("https://worker.test/api/health"), {});
assert.equal(health.status, 200);
assert.equal((await health.json()).authenticationConfigured, false);

const deniedResponse = await worker.fetch(new Request("https://worker.test/api/feed"), env);

assert.equal(deniedResponse.status, 401, "private endpoints must reject missing Access JWT");
const feedResponse = await worker.fetch(authorizedRequest("https://worker.test/api/feed?limit=100"), env, accessContext);
assert.equal(feedResponse.status, 200);
const feed = await feedResponse.json();
assert.equal(feed.posts.length, 1);
assert.deepEqual(feedQuerySizes, [100], "Feed API must honor the frontend 100-item request");
assert.equal(feed.posts[0].format, "Stories");
assert.equal(feed.posts[0].pillar, "Produto");
assert.equal(feed.posts[0].order, 3);
assert.equal(feed.posts[0].previewImage, "https://files.notion.so/signed-preview");

const copyResponse = await worker.fetch(authorizedRequest("https://worker.test/api/post/12345678-1234-1234-1234-123456789abc"), env, accessContext);
assert.equal(copyResponse.status, 200);
const copy = await copyResponse.json();
assert.equal(copy.content[0].text, "Legenda de teste do post.");
assert.equal(copy.hasMore, true);
assert.equal(copy.nextCursor, "cursor-2");
const nextCopyResponse = await worker.fetch(authorizedRequest("https://worker.test/api/post/12345678-1234-1234-1234-123456789abc?cursor=cursor-2"), env, accessContext);
const nextCopy = await nextCopyResponse.json();
assert.equal(nextCopy.content[0].text, "Detalhes adicionais.");
assert.equal(nextCopy.hasMore, false);

const profileResponse = await worker.fetch(authorizedRequest("https://worker.test/api/profile"), env, accessContext);
const profileData = await profileResponse.json();
assert.equal(profileData.profile.name, "Marca Teste");
assert.equal(profileData.profile.username, "marca.teste");

const libraryResponse = await worker.fetch(authorizedRequest("https://worker.test/api/library"), env, accessContext);
assert.equal(libraryResponse.status, 200);
const library = await libraryResponse.json();
assert.equal(library.items[0].name, "Moodboard de campanha");
assert.equal(library.items[0].category, "Referências");
assert.equal(library.items[0].previewUrl, "https://example.com/moodboard.jpg");
assert.equal(library.items[0].driveUrl, "https://drive.google.com/example");

const ideasResponse = await worker.fetch(authorizedRequest("https://worker.test/api/ideas"), env, accessContext);
assert.equal(ideasResponse.status, 200);
const ideas = await ideasResponse.json();
assert.equal(ideas.items[0].title, "Série de referências do mês");
assert.equal(ideas.items[0].theme, "Design");
assert.equal(ideas.items[0].status, "Nova");

const writeResponse = await worker.fetch(authorizedRequest("https://worker.test/api/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env, accessContext);
assert.equal(writeResponse.status, 405);

console.log("PASS: health endpoint and fail-closed private route");
console.log("PASS: Cloudflare Access identity context validation");
console.log("PASS: feed mapping, 100-item limit, Stories, pillar, order and refreshed file URL");
console.log("PASS: paginated page body extraction for review panel");
console.log("PASS: profile mapping");
console.log("PASS: read-only Library API mapping");
console.log("PASS: read-only Ideas API mapping");
console.log("PASS: write route rejected");
