const NOTION_VERSION = "2022-06-28";

const CONTENT_DATABASE_ID = "8f372d3b-d2dd-4d92-b3c3-65a176938d14";
const PROFILE_DATABASE_ID = "bd79b8d1f3194107bb7a173511604c54";

function getText(property) {
  if (!property) return "";
  if (property.type === "title" || property.type === "rich_text") {
    return (property[property.type] || []).map(item => item.plain_text || "").join("");
  }
  if (property.type === "select" || property.type === "status") {
    return property[property.type]?.name || "";
  }
  return "";
}

function getPropertyValue(property) {
  if (!property) return null;
  if (property.type === "url") return property.url || null;
  if (property.type === "email") return property.email || null;
  if (property.type === "phone_number") return property.phone_number || null;
  return getText(property) || null;
}

function getMultiSelect(property) {
  return property ? (property.multi_select || []).map(item => item.name) : [];
}

function getFiles(property) {
  if (!property || property.type !== "files") return [];
  return (property.files || []).map(item => ({
    name: item.name || "",
    url: item.file?.url || item.external?.url || null,
    type: item.type || "unknown"
  })).filter(item => item.url);
}

function getDate(property) {
  return property?.date?.start || null;
}

function normalizePost(page) {
  const p = page.properties || {};
  const files = getFiles(p["Prévia do feed"]);
  return {
    id: page.id,
    title: getText(p["Publicação"]) || "Publicação sem título",
    date: getDate(p["Data"]),
    order: typeof p["Ordem no feed"]?.number === "number" ? p["Ordem no feed"].number : null,
    editorial: getText(p["Editoria"]),
    format: getText(p["Formato"]),
    status: getText(p["Status"]),
    category: getText(p["Categoria"]),
    pillar: getText(p["Pilar editorial"]),
    objectives: getMultiSelect(p["Objetivos"]),
    tags: getMultiSelect(p["Tags"]),
    previewImage: files[0]?.url || null,
    previewFiles: files,
    notionUrl: page.url,
    updatedAt: page.last_edited_time
  };
}

function normalizeProfile(page) {
  const p = page.properties || {};
  const photos = getFiles(p["Foto do perfil"]);
  return {
    id: page.id,
    name: getText(p["Nome exibido"]),
    username: getText(p["@ do Instagram"]),
    bio: getText(p["Bio"]),
    website: getPropertyValue(p["Site"]),
    profileImage: photos[0]?.url || null,
    profileImages: photos,
    category: getText(p["Categoria"]),
    contactEmail: getPropertyValue(p["Email de contato"]),
    contactButton: getPropertyValue(p["Botão de contato"]),
    notionUrl: page.url,
    updatedAt: page.last_edited_time
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") {
      return Response.json({ ok: false, error: "Método não permitido" }, { status: 405, headers });
    }
    if (!env.NOTION_TOKEN) {
      return Response.json({ ok: false, error: "NOTION_TOKEN não configurado" }, { status: 500, headers });
    }

    async function notionRequest(path, options = {}) {
      const response = await fetch(`https://api.notion.com/v1${path}`, {
        ...options,
        headers: {
          "Authorization": `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`Notion API retornou ${response.status}`);
      return data;
    }

    try {
      if (url.pathname === "/api/health") {
        return Response.json({ ok: true, service: "content-studio-api", notionTokenConfigured: true }, { headers });
      }
      if (url.pathname === "/api/notion-test") {
        const data = await notionRequest("/users/me");
        return Response.json({ ok: true, message: "Conexão com Notion funcionando", integration: data.name || "Content Studio API" }, { headers });
      }
      if (url.pathname === "/api/profile") {
        const data = await notionRequest(`/databases/${PROFILE_DATABASE_ID}/query`, {
          method: "POST",
          body: JSON.stringify({ page_size: 1, sorts: [{ property: "Perfil", direction: "ascending" }] })
        });
        return Response.json({ ok: true, profile: data.results[0] ? normalizeProfile(data.results[0]) : null }, { headers });
      }
      if (url.pathname === "/api/notion-read-test" || url.pathname === "/api/feed") {
        const requestedLimit = Number(url.searchParams.get("limit") || 50);
        const pageSize = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));
        const data = await notionRequest(`/databases/${CONTENT_DATABASE_ID}/query`, {
          method: "POST",
          body: JSON.stringify({
            page_size: pageSize,
            filter: { property: "Data", date: { is_not_empty: true } },
            sorts: [{ property: "Ordem no feed", direction: "ascending" }]
          })
        });
        const posts = data.results.map(normalizePost);
        return Response.json({
          ok: true,
          total: posts.length,
          hasMore: data.has_more,
          nextCursor: data.next_cursor,
          posts
        }, { headers });
      }
      return Response.json({
        service: "content-studio-api",
        status: "online",
        endpoints: ["/api/health", "/api/notion-test", "/api/profile", "/api/feed"]
      }, { headers });
    } catch (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500, headers });
    }
  }
};
