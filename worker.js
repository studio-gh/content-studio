const NOTION_VERSION = "2022-06-28";

const CONTENT_DATA_SOURCE_ID = "68e086ed-8655-413f-aca0-53fe36ad82e0";
const IDEAS_DATA_SOURCE_ID = "ec75898c-2fbc-4d40-8be0-19f8e3ac01bb";
const ASSETS_DATA_SOURCE_ID = "3d40dbe6-469b-44ef-b678-8fa30f9ce7f2";
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
    order: null,
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

function normalizeIdea(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    title: getText(p["Ideia"]) || "Ideia sem título",
    note: getText(p["Anotação"]),
    status: getText(p["Status"]) || "Nova",
    topic: getText(p["Tema"]),
    source: getText(p["Origem"]),
    createdAt: p["Criada em"]?.date?.start || page.created_time,
    notionUrl: page.url,
    updatedAt: page.last_edited_time
  };
}

function normalizeAsset(page) {
  const p = page.properties || {};
  const files = getFiles(p["Arquivo"]);
  return {
    id: page.id,
    name: getText(p["Nome"]) || "Material sem título",
    type: getText(p["Tipo"]),
    category: getText(p["Categoria"]),
    tags: getMultiSelect(p["Tags"]),
    brand: getText(p["Marca"]),
    description: getText(p["Descrição"]),
    driveUrl: getPropertyValue(p["Link do Drive"]),
    files,
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET" && request.method !== "POST") {
      return Response.json({ ok: false, error: "Método não permitido" }, { status: 405, headers });
    }
    if (!env.NOTION_TOKEN) {
      return Response.json({ ok: false, error: "NOTION_TOKEN não configurado" }, { status: 500, headers });
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

      if (url.pathname === "/api/reorder" && request.method === "POST") {
        if (!env.CONTENT_STUDIO_WRITE_KEY || !env.CONTENT_STUDIO_WRITE_KEY.trim()) {
          return Response.json({ ok: false, error: "Chave de edição não configurada no Worker" }, { status: 503, headers });
        }
        const payload = await request.json();
        if (typeof payload.key !== "string" || payload.key !== env.CONTENT_STUDIO_WRITE_KEY) {
          return Response.json({ ok: false, error: "Chave de edição inválida" }, { status: 401, headers });
        }
        const orderedIds = payload.orderedIds;
        if (!Array.isArray(orderedIds) || orderedIds.length < 1 || orderedIds.length > 50 ||
            orderedIds.some(id => typeof id !== "string") || new Set(orderedIds).size !== orderedIds.length) {
          return Response.json({ ok: false, error: "Lista de publicações inválida" }, { status: 400, headers });
        }
        const current = [];
        let cursor;
        let more = true;
        while (more) {
          const query = await notionRequest(`/data_sources/${CONTENT_DATA_SOURCE_ID}/query`, {
            method: "POST",
            body: JSON.stringify({
              page_size: 100,
              ...(cursor ? { start_cursor: cursor } : {}),
              filter: { property: "Data", date: { is_not_empty: true } }
            })
          }, "2025-09-03");
          current.push(...(query.results || []));
          more = Boolean(query.has_more);
          cursor = query.next_cursor || undefined;
          if (!cursor) more = false;
        }
        const validIds = new Set(current.map(page => page.id));
        if (orderedIds.length !== validIds.size || orderedIds.some(id => !validIds.has(id))) {
          return Response.json({ ok: false, error: "A lista mudou no Notion. Atualize o feed antes de salvar." }, { status: 409, headers });
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await notionRequest(`/pages/${orderedIds[i]}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: { "Ordem no feed": { number: i + 1 } } })
          });
        }
        return Response.json({ ok: true, updated: orderedIds.length }, { headers });
      }
      if (url.pathname === "/api/health") {
        return Response.json({ ok: true, service: "content-studio-api", notionTokenConfigured: true }, { headers });
      }
      if (url.pathname === "/api/notion-test") {
        const data = await notionRequest("/users/me");
        return Response.json({ ok: true, message: "Conexão com Notion funcionando", integration: data.name || "Content Studio API" }, { headers });
      }
      if (url.pathname === "/api/ideas" && request.method === "POST") {
        if (!env.CONTENT_STUDIO_WRITE_KEY || !env.CONTENT_STUDIO_WRITE_KEY.trim()) {
          return Response.json({ ok: false, error: "Chave de edição não configurada no Worker" }, { status: 503, headers });
        }
        let payload;
        try { payload = await request.json(); }
        catch { return Response.json({ ok: false, error: "Corpo JSON inválido" }, { status: 400, headers }); }
        if (typeof payload.key !== "string" || payload.key !== env.CONTENT_STUDIO_WRITE_KEY) {
          return Response.json({ ok: false, error: "Chave de edição inválida" }, { status: 401, headers });
        }
        const title = typeof payload.title === "string" ? payload.title.trim() : "";
        const note = typeof payload.note === "string" ? payload.note.trim() : "";
        const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
        const source = typeof payload.source === "string" ? payload.source.trim() : "";
        const allowedTopics = ["Design", "Tecnologia", "Arte", "Cultura", "Negócios", "Pessoal"];
        if (!title || title.length > 180 || note.length > 2000 || source.length > 2000 ||
            (topic && !allowedTopics.includes(topic))) {
          return Response.json({ ok: false, error: "Dados inválidos. Informe um título de até 180 caracteres; anotação e origem são opcionais." }, { status: 400, headers });
        }
        if (source && !/^https?:\\/\\//i.test(source)) {
          return Response.json({ ok: false, error: "A origem precisa ser um link http ou https." }, { status: 400, headers });
        }
        const properties = {
          "Ideia": { title: [{ text: { content: title } }] },
          "Status": { status: { name: "Nova" } }
        };
        if (note) properties["Anotação"] = { rich_text: [{ text: { content: note } }] };
        if (topic) properties["Tema"] = { select: { name: topic } };
        if (source) properties["Origem"] = { url: source };
        const created = await notionRequest("/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { type: "data_source_id", data_source_id: IDEAS_DATA_SOURCE_ID },
            properties
          })
        }, "2025-09-03");
        return Response.json({ ok: true, idea: normalizeIdea(created) }, { status: 201, headers });
      }
      if (url.pathname === "/api/ideas") {
        const data = await notionRequest(`/data_sources/${IDEAS_DATA_SOURCE_ID}/query`, {
          method: "POST",
          body: JSON.stringify({
            page_size: 50,
            sorts: [{ timestamp: "created_time", direction: "descending" }]
          })
        }, "2025-09-03");
        const ideas = (data.results || []).map(normalizeIdea);
        return Response.json({ ok: true, total: ideas.length, hasMore: Boolean(data.has_more), ideas }, { headers });
      }
      if (url.pathname === "/api/assets") {
        const data = await notionRequest(`/data_sources/${ASSETS_DATA_SOURCE_ID}/query`, {
          method: "POST",
          body: JSON.stringify({
            page_size: 50,
            sorts: [{ timestamp: "created_time", direction: "descending" }]
          })
        }, "2025-09-03");
        const assets = (data.results || []).map(normalizeAsset);
        return Response.json({ ok: true, total: assets.length, hasMore: Boolean(data.has_more), assets }, { headers });
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
        endpoints: ["/api/health", "/api/notion-test", "/api/profile", "/api/feed", "/api/ideas", "/api/assets"]
      }, { headers });
    } catch (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500, headers });
    }
  }
};
