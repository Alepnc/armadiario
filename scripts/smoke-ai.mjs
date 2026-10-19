// Smoke test for the AI providers. Reads keys from .env.local and never prints them.
// Usage: npm run smoke:ai
const gemini = process.env.GEMINI_API_KEY;
async function timed(url, init, ms = 45000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}
if (gemini) {
  const model = process.env.GEMINI_STYLIST_MODEL || "gemini-3.5-flash-lite";
  console.log(`[gemini] chiave trovata (${gemini.length} caratteri). Controllo i modelli disponibili…`);
  try {
    const list = await timed("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": gemini } }, 20000);
    const body = await list.json().catch(() => ({}));
    if (!list.ok) console.log(`[gemini] elenco modelli: http ${list.status} ${String(body.error?.message ?? "").slice(0, 160)}`);
    else {
      const names = (body.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => m.name.replace("models/", ""));
      console.log(`[gemini] modelli con generateContent: ${names.filter((n) => /flash/.test(n)).slice(0, 12).join(", ") || "(nessuno)"}`);
    }
  } catch (e) {
    console.log(`[gemini] elenco modelli non raggiungibile: ${e.name === "AbortError" ? "timeout 20s" : e.message}`);
  }
  console.log(`[gemini] provo ${model} (max 45s)…`);
  const t0 = Date.now();
  try {
    const res = await timed(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": gemini },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Scegli il candidato c2 e dai un titolo breve." }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: { candidate_id: { type: "string" }, title: { type: "string" } },
            required: ["candidate_id", "title"],
          },
          maxOutputTokens: 4096,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    const ok = res.ok && Boolean(parsed?.candidate_id);
    console.log(`gemini    ${model.padEnd(20)} ${ok ? "OK  " : "FAIL"} http ${res.status} ${Date.now() - t0}ms${body.error ? " — " + String(body.error.message).slice(0, 220) : ""}${ok ? " → " + JSON.stringify(parsed) : text ? " risposta: " + String(text).slice(0, 120) : ""}`);
    if (!process.env.ANTHROPIC_API_KEY) process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(`gemini    ${model} FAIL ${e.name === "AbortError" ? "timeout dopo 45s (nessuna risposta)" : e.message}`);
    if (!process.env.ANTHROPIC_API_KEY) process.exit(1);
  }
}
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}
const models = {
  stylist: process.env.ANTHROPIC_STYLIST_MODEL || "claude-sonnet-5-5",
  analysis: process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-haiku-5-5",
};

async function call(model) {
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [{ role: "user", content: "Scegli il candidato c2 e dai un titolo breve." }],
      tools: [{
        name: "choose",
        description: "Sceglie un candidato",
        input_schema: { type: "object", properties: { candidate_id: { type: "string" }, title: { type: "string" } }, required: ["candidate_id", "title"] },
      }],
      tool_choice: { type: "tool", name: "choose" },
    }),
  });
  const body = await res.json().catch(() => ({}));
  const tool = body.content?.find((b) => b.type === "tool_use");
  return { status: res.status, ms: Date.now() - t0, ok: res.ok && Boolean(tool?.input?.candidate_id), error: body.error?.message?.slice(0, 160), input: tool?.input };
}

for (const [role, model] of Object.entries(models)) {
  const r = await call(model);
  console.log(`${role.padEnd(9)} ${model.padEnd(20)} ${r.ok ? "OK " : "FAIL"} http ${r.status} ${r.ms}ms${r.error ? " — " + r.error : ""}${r.ok ? " → " + JSON.stringify(r.input) : ""}`);
}
