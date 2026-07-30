/**
 * ⚠️ 已退役，沒有部署在線上。2026-07-30 從 Cloudflare 刪除。
 *
 * 這個 app 最後決定不接 AI：案子資料由手填，鼠點連結看原始貼文。
 * 前端已經沒有 CONFIG.workerUrl，不會呼叫這裡。
 *
 * 留著這份檔案只是為了「哪天想接回 AI」時不用重寫。要復活的話：
 *   1. npx wrangler deploy --config worker/wrangler.toml
 *   2. npx wrangler secret put GEMINI_API_KEY（或 ANTHROPIC_API_KEY）
 *   3. npx wrangler secret put APP_KEY
 *   4. 把 Worker 網址和同一組 APP_KEY 填回 index.html 的 window.CONFIG
 *   5. 前端要重新加上呼叫它的程式碼（已在 8d1bd13 那個 commit 移除）
 *
 * ────────────────────────────────────────────────
 * 留鼠看 — AI 中繼站（可切換供應商）
 *
 * 前端不放金鑰，只打這個 Worker。
 *
 * 環境變數（Cloudflare 後台 Settings → Variables，或 wrangler.toml [vars]）：
 *   PROVIDER           一般變數，"gemini" 或 "anthropic"（預設 gemini）
 *   MODEL              一般變數，模型代號（留空用該供應商的預設值）
 *   ALLOW_ORIGINS      一般變數，允許的網址，逗號分隔
 *   APP_KEY            祕密變數，前端也要填同一串
 *   GEMINI_API_KEY     祕密變數，走 gemini 時需要
 *   ANTHROPIC_API_KEY  祕密變數，走 anthropic 時需要
 *
 * 設定祕密變數：
 *   npx wrangler secret put GEMINI_API_KEY
 */

const MAX_PROMPT = 20000;
// 新一代模型預設會思考，而輸出上限是「思考＋回答」共用的。
// 留寬一點，不然回答會被截斷變成壞掉的 JSON。
const MAX_TOKENS = 8000;

const DEFAULTS = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5",
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allow = (env.ALLOW_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = allow.includes(origin);

    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : allow[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-app-key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ error: "只收 POST" }, 405, cors);
    if (!ok) return reply({ error: "這個網域沒有被允許" }, 403, cors);
    if (request.headers.get("x-app-key") !== env.APP_KEY) return reply({ error: "app key 不對" }, 401, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "看不懂的請求內容" }, 400, cors);
    }

    const { prompt, search } = body || {};
    if (typeof prompt !== "string" || !prompt.trim()) return reply({ error: "沒有給 prompt" }, 400, cors);
    if (prompt.length > MAX_PROMPT) return reply({ error: "內容太長了，分兩次貼" }, 400, cors);

    const provider = (env.PROVIDER || "gemini").toLowerCase();
    const model = env.MODEL || DEFAULTS[provider];

    if (provider !== "gemini" && provider !== "anthropic") {
      return reply({ error: `不認得的 PROVIDER：${provider}` }, 500, cors);
    }

    const key = provider === "gemini" ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
    if (!key) {
      const which = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
      return reply({ error: `Worker 還沒設定 ${which}` }, 500, cors);
    }

    try {
      const out = provider === "gemini"
        ? await callGemini({ key, model, prompt, search })
        : await callAnthropic({ key, model, prompt, search });

      if (out.error) return reply({ error: out.error }, out.status || 502, cors);
      return reply({ text: out.text, model, provider }, 200, cors);
    } catch {
      return reply({ error: "連不上 AI 服務，等一下再試" }, 502, cors);
    }
  },
};

/* ---------- Gemini ---------- */
async function callGemini({ key, model, prompt, search }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const build = (withSearch) => {
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    };
    if (withSearch) payload.tools = [{ google_search: {} }];
    return payload;
  };

  const send = (payload) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });

  let res = await send(build(!!search));
  let data = await res.json();

  // 免費層對大多數模型不開放 Google Search grounding。
  // 被擋掉的話拿掉工具重試一次，讓一般的貼文解析照樣能用。
  let searchDropped = false;
  if (!res.ok && search && /tool|google_search|grounding|not supported|unsupported/i.test(data?.error?.message || "")) {
    searchDropped = true;
    res = await send(build(false));
    data = await res.json();
  }

  if (!res.ok) {
    return { error: geminiMsg(data, res.status), status: res.status };
  }

  const cand = (data.candidates || [])[0];
  const finish = cand?.finishReason;

  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
    return { error: "這段內容被 Gemini 的安全機制擋下了，換一則試試", status: 422 };
  }

  const text = (cand?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();

  if (!text) {
    if (finish === "MAX_TOKENS") return { error: "內容太長被截斷了，分兩次貼", status: 502 };
    if (searchDropped) {
      return {
        error: "免費層不支援上網查詢，請直接貼貼文的文字內容，不要只貼網址",
        status: 422,
      };
    }
    return { error: "Gemini 沒有回傳內容，再試一次", status: 502 };
  }

  return { text };
}

function geminiMsg(data, status) {
  const m = data?.error?.message || "";
  if (status === 429 || /quota|rate limit|exhaust/i.test(m)) {
    return "Gemini 免費額度用完了（每天會重置），或請求太密集，等一下再試";
  }
  if (status === 400 && /API key|api_key/i.test(m)) return "Gemini 金鑰無效，去 AI Studio 重新拿一把";
  if (status === 403) return "Gemini 金鑰沒有權限，確認它是在 AI Studio 建的";
  if (status === 404 || /not found|not supported/i.test(m)) {
    return "模型代號不對，去 ai.google.dev 對一下免費層可用的代號，改 MODEL 這個變數";
  }
  return m || `Gemini 回了 ${status}`;
}

/* ---------- Anthropic ---------- */
async function callAnthropic({ key, model, prompt, search }) {
  const payload = {
    model,
    max_tokens: MAX_TOKENS,
    // 抽資料不需要想很久，壓低思考深度省錢又夠準
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt }],
  };
  // 只有網址時要靠搜尋補資料。這個工具版本代號如果報錯，
  // 去 docs.claude.com 查目前可用的版本。
  if (search) payload.tools = [{ type: "web_search_20260209", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    return { error: data?.error?.message || `上游回了 ${res.status}`, status: res.status };
  }

  // 被安全機制擋下時會回 200 但內容是空的
  if (data.stop_reason === "refusal") {
    return { error: "這段內容被模型的安全機制擋下了，換一則試試", status: 422 };
  }

  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  if (!text) {
    const why = data.stop_reason === "max_tokens" ? "內容太長被截斷了" : "模型沒有回傳內容";
    return { error: `${why}，再試一次或分兩次貼`, status: 502 };
  }

  return { text };
}

function reply(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
}
