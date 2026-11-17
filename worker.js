const NOTION_VERSION = "2022-06-28";

const CONTENT_DATA_SOURCE_ID = "68e086ed-8655-413f-aca0-53fe36ad82e0";
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
    pillar: getText(p["Pilar"]) || getText(p["Pilar editorial"]),
    objectives: getMultiSelect(p["Objetivos"]),
    tags: getMultiSelect(p["Tags"]),
    previewImage: files[0]?.url || null,
    previewFiles: files,
    notionUrl: page.url,
    updatedAt: page.last_edited_time
  };
}

function extractBlockText(block) {
  const value = block?.[block.type];
  if (!value) return "";
  const rich = value.rich_text || value.title || [];
  const text = rich.map(item => item.plain_text || item.text?.content || "").join("");
  if (block.type === "child_page") return value.title || "";
  return text;
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
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "content-studio-api", notionTokenConfigured: Boolean(env.NOTION_TOKEN) }, { headers });
    }
    if (!env.NOTION_TOKEN) {
      return Response.json({ ok: false, error: "Integração com Notion indisponível" }, { status: 503, headers });
    }

    async function notionRequest(path, options = {}, apiVersion = NOTION_VERSION) {
      const response = await fetch(`https://api.notion.com/v1${path}`, {
        ...options,
        headers: {
          "Authorization": `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": apiVersion,
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`Notion API retornou ${response.status}`);
      return data;
    }

    try {

      if (url.pathname === "/api/notion-test") {
        const data = await notionRequest("/users/me");
        return Response.json({ ok: true, message: "Conexão com Notion funcionando", integration: data.name || "Content Studio API" }, { headers });
      }
      const routeParts = url.pathname.split("/").filter(Boolean);
      const postId = routeParts.length === 3 && routeParts[0] === "api" && routeParts[1] === "post" ? routeParts[2] : "";
      if (postId && /^[0-9a-f-]{36}$/i.test(postId)) {
        const cursor = url.searchParams.get("cursor");
        const query = new URLSearchParams({ page_size: "100" });
        if (cursor && cursor.length <= 200) query.set("start_cursor", cursor);
        const data = await notionRequest(`/blocks/${postId}/children?${query.toString()}`);
        const content = (data.results || []).map(block => ({
          type: block.type,
          text: extractBlockText(block),
          hasChildren: Boolean(block.has_children)
        })).filter(block => block.text || block.hasChildren);
        return Response.json({
          ok: true,
          content,
          hasMore: Boolean(data.has_more),
          nextCursor: data.next_cursor || null
        }, { headers });
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
        const allResults = [];
        let startCursor;
        let hasMore = true;

        while (hasMore && allResults.length < pageSize) {
          const data = await notionRequest(`/data_sources/${CONTENT_DATA_SOURCE_ID}/query`, {
            method: "POST",
            body: JSON.stringify({
              page_size: Math.min(100, pageSize - allResults.length),
              ...(startCursor ? { start_cursor: startCursor } : {}),
              filter: { property: "Data", date: { is_not_empty: true } },
              sorts: [{ property: "Data", direction: "ascending" }, { timestamp: "created_time", direction: "ascending" }]
            })
          }, "2025-09-03");

          allResults.push(...(data.results || []));
          hasMore = Boolean(data.has_more);
          startCursor = data.next_cursor || undefined;
          if (!startCursor) hasMore = false;
        }

        // Keep every format here. The calendar needs Stories too; the profile grid filters them in the UI.
        const posts = allResults.map(normalizePost);

        return Response.json({
          ok: true,
          total: posts.length,
          hasMore,
          nextCursor: startCursor || null,
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
