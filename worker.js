const NOTION_VERSION = "2022-06-28";
const MAX_FEED_ITEMS = 100;

const CONTENT_DATA_SOURCE_ID = "68e086ed-8655-413f-aca0-53fe36ad82e0";
const PROFILE_DATA_SOURCE_ID = "e82f8a29-82ef-4397-aebf-cd62f1222cc4";
const LIBRARY_DATA_SOURCE_ID = "3d40dbe6-469b-44ef-b678-8fa30f9ce7f2";
const IDEAS_DATA_SOURCE_ID = "ec75898c-2fbc-4d40-8be0-19f8e3ac01bb";

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
  if (!property || (property.type !== "files" && property.type !== "file")) return [];
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

function normalizeLibraryItem(page) {
  const p = page.properties || {};
  const files = getFiles(p["Arquivo"]);
  return {
    id: page.id,
    name: getText(p["Nome"]) || "Material sem título",
    type: getText(p["Tipo"]),
    category: getText(p["Categoria"]),
    brand: getText(p["Marca"]),
    description: getText(p["Descrição"]),
    tags: getMultiSelect(p["Tags"]),
    driveUrl: getPropertyValue(p["Link do Drive"]),
    files,
    previewUrl: files[0]?.url || null,
    notionUrl: page.url,
    updatedAt: page.last_edited_time
  };
}

function normalizeIdea(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    title: getText(p["Ideia"]) || "Ideia sem título",
    note: getText(p["Anotação"]),
    theme: getText(p["Tema"]),
    status: getText(p["Status"]),
    sourceUrl: getPropertyValue(p["Origem"]),
    notionUrl: page.url,
    createdAt: p["Criada em"]?.date?.start || page.created_time,
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "https://studio-gh.github.io",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") {
      return Response.json({ ok: false, error: "Método não permitido" }, { status: 405, headers });
    }
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "content-studio-api", authenticationConfigured: true }, { headers });
    }
    let workspaceMember;
    try {
      if (!ctx?.access) throw new Error("Autenticação necessária");
      const identity = await ctx.access.getIdentity();
      if (!identity?.email) throw new Error("Identidade autenticada indisponível");
      workspaceMember = { email: String(identity.email).trim().toLowerCase(), role: "owner", workspace_slug: "studio" };
    } catch {
      return Response.json({ ok: false, error: "Autenticação necessária" }, { status: 401, headers });
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

    async function queryDataSource(dataSourceId, limit = 100) {
      const data = await notionRequest(`/data_sources/${dataSourceId}/query`, {
        method: "POST",
        body: JSON.stringify({ page_size: Math.min(100, Math.max(1, limit)), sorts: [{ timestamp: "last_edited_time", direction: "descending" }] })
      }, "2025-09-03");
      return data.results || [];
    }

    try {
      if (url.pathname === "/api/notion-test") {
        const data = await notionRequest("/users/me");
        return Response.json({ ok: true, message: "Conexão com Notion funcionando", integration: data.name || "Content Studio API", workspace: workspaceMember.workspace_slug, role: workspaceMember.role }, { headers });
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
        const profiles = await queryDataSource(PROFILE_DATA_SOURCE_ID, 1);
        return Response.json({ ok: true, workspace: workspaceMember.workspace_slug, profile: profiles[0] ? normalizeProfile(profiles[0]) : null }, { headers });
      }
      if (url.pathname === "/api/library") {
        const items = await queryDataSource(LIBRARY_DATA_SOURCE_ID, 100);
        return Response.json({ ok: true, workspace: workspaceMember.workspace_slug, total: items.length, items: items.map(normalizeLibraryItem) }, { headers });
      }
      if (url.pathname === "/api/ideas") {
        const items = await queryDataSource(IDEAS_DATA_SOURCE_ID, 100);
        return Response.json({ ok: true, workspace: workspaceMember.workspace_slug, total: items.length, items: items.map(normalizeIdea) }, { headers });
      }
      if (url.pathname === "/api/notion-read-test" || url.pathname === "/api/feed") {
        const requestedLimit = Number(url.searchParams.get("limit") || 50);
        const pageSize = Math.min(MAX_FEED_ITEMS, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));
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
        endpoints: ["/api/health", "/api/notion-test", "/api/profile", "/api/feed", "/api/library", "/api/ideas"]
      }, { headers });
    } catch (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500, headers });
    }
  }
};
