import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("worker.js", "utf8");
const loaded = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const worker = loaded.default;

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

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.includes("/data_sources/")) {
    return Response.json({ results: [post], has_more: false, next_cursor: null });
  }
  if (url.includes("/blocks/")) {
    return Response.json({ results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Legenda de teste do post." }] } }], has_more: false });
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
assert.equal((await health.json()).notionTokenConfigured, false);

const feedResponse = await worker.fetch(new Request("https://worker.test/api/feed?limit=100"), { NOTION_TOKEN: "mock-token" });
assert.equal(feedResponse.status, 200);
const feed = await feedResponse.json();
assert.equal(feed.posts.length, 1);
assert.equal(feed.posts[0].format, "Stories");
assert.equal(feed.posts[0].pillar, "Produto");
assert.equal(feed.posts[0].order, 3);
assert.equal(feed.posts[0].previewImage, "https://files.notion.so/signed-preview");

const copyResponse = await worker.fetch(new Request("https://worker.test/api/post/12345678-1234-1234-1234-123456789abc"), { NOTION_TOKEN: "mock-token" });
assert.equal(copyResponse.status, 200);
const copy = await copyResponse.json();
assert.equal(copy.content[0].text, "Legenda de teste do post.");

const profileResponse = await worker.fetch(new Request("https://worker.test/api/profile"), { NOTION_TOKEN: "mock-token" });
const profileData = await profileResponse.json();
assert.equal(profileData.profile.name, "Marca Teste");
assert.equal(profileData.profile.username, "marca.teste");

const writeResponse = await worker.fetch(new Request("https://worker.test/api/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), { NOTION_TOKEN: "mock-token" });
assert.equal(writeResponse.status, 405);

console.log("PASS: health without Notion secret");
console.log("PASS: feed mapping, Stories, pillar, order and refreshed file URL");
console.log("PASS: on-demand page body extraction for review panel");
console.log("PASS: profile mapping");
console.log("PASS: write route rejected");
