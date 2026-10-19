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
    expect(calls[0].url).toContain("/models/gemini-2.5-flash:generateContent");
    expect(calls[0].url).not.toContain("test-key");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.type).toBe("object");
    expect(body.systemInstruction.parts[0].text).toBe("sys");
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
