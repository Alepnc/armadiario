import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiAnalyzer, createGeminiLanguageModel } from "@/lib/ai/gemini";
import { llmSelectionSchema } from "@/lib/validation/outfit";
import { toJsonSchema } from "@/lib/ai/anthropic";

const ok = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } }), { status: 200 });

describe("Gemini provider (fetch mocked)", () => {
  let calls: Array<{ url: string; init: RequestInit }>;
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is disabled without a key", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(createGeminiLanguageModel()).toBeNull();
    expect(createGeminiAnalyzer()).toBeNull();
  });

  it("sends a schema-constrained request with the key in a header, not in the URL, and parses the JSON", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return ok(JSON.stringify({ outfits: [{ candidate_id: "c1", title: "Look", reason: "Bene", tips: [] }] }));
    });
    const model = createGeminiLanguageModel()!;
    const { value, usage } = await model.complete({
      system: "sys",
      user: "usr",
      toolName: "x",
      toolDescription: "x",
      jsonSchema: toJsonSchema(llmSelectionSchema),
      parse: (r) => llmSelectionSchema.parse(r),
    });
    expect(value.outfits[0].candidate_id).toBe("c1");
    expect(usage).toMatchObject({ provider: "gemini", inputTokens: 11, outputTokens: 7 });
    const body = JSON.parse(calls[0].init.body as string);
    expect(calls[0].url).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(calls[0].url).not.toContain("test-key");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.type).toBe("object");
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(4096);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
  });

  it("rejects output that does not match the schema instead of trusting it", async () => {
    vi.stubGlobal("fetch", async () => ok(JSON.stringify({ outfits: "banana" })));
    await expect(
      createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => llmSelectionSchema.parse(r) }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries on 429 then succeeds, and gives up with rate_limited", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => (++n < 2 ? new Response("{}", { status: 429 }) : ok("{\"a\":1}")));
    const res = await createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r });
    expect(n).toBe(2);
    expect(res.value).toEqual({ a: 1 });

    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429 }));
    await expect(
      createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  }, 20_000);

  it("falls back to the reserve model when the main one stays overloaded (503) and reports the detail", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(String(url).match(/models\/([^:]+):/)![1]);
      return String(url).includes("gemini-3.5-flash-lite:") ? new Response(JSON.stringify({ error: { message: "The model is overloaded" } }), { status: 503 }) : ok("{\"a\":2}");
    });
    const res = await createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r });
    expect(res.value).toEqual({ a: 2 });
    expect(res.usage.model).toBe("gemini-3.8-flash");
    expect(seen.filter((m) => m === "gemini-3.5-flash-lite")).toHaveLength(3); // 3 attempts, then the fallback

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "The model is overloaded" } }), { status: 503 }));
    await expect(
      createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r }),
    ).rejects.toThrow(/HTTP 503.*overloaded/);
  }, 40_000);

  it("does not switch model on auth/bad-request errors", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 });
    });
    await expect(
      createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r }),
    ).rejects.toThrow(/HTTP 400/);
    expect(seen).toHaveLength(1);
  });

  it("does not retry a timed-out model: hands over to the fallback quickly", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const model = String(url).match(/models\/([^:]+):/)![1];
      seen.push(model);
      if (model === "gemini-3.5-flash-lite") {
        return new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      return Promise.resolve(ok("{\"a\":3}"));
    });
    vi.useFakeTimers();
    const p = createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r });
    await vi.advanceTimersByTimeAsync(16_000);
    const res = await p;
    vi.useRealTimers();
    expect(res.usage.model).toBe("gemini-3.8-flash");
    expect(seen).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
  });

  it("asks for minimal reasoning and drops the hint if the model rejects it", async () => {
    const bodies: Array<{ generationConfig: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string);
      bodies.push(b);
      return b.generationConfig.thinkingConfig
        ? new Response(JSON.stringify({ error: { message: "Unknown name thinkingLevel: thinking_config" } }), { status: 400 })
        : ok("{\"a\":4}");
    });
    const res = await createGeminiLanguageModel()!.complete({ system: "s", user: "u", toolName: "x", toolDescription: "x", jsonSchema: {}, parse: (r) => r });
    expect(res.value).toEqual({ a: 4 });
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
  });

  it("analyzer sends the photo as inline data and validates the answer", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return ok(JSON.stringify({ name: "Jeans", category_slug: "jeans", primary_color: "denim", formality: 2 }));
    });
    const { analysis } = await createGeminiAnalyzer()!.analyze({ image: Buffer.from("img"), mediaType: "image/webp", categorySlugs: ["jeans"] });
    expect(analysis.category_slug).toBe("jeans");
    const parts = JSON.parse(calls[0].init.body as string).contents[0].parts;
    expect(parts[0].inline_data).toMatchObject({ mime_type: "image/webp", data: Buffer.from("img").toString("base64") });
  });
});
