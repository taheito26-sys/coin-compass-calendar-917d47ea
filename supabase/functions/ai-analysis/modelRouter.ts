import { fetchGeminiText } from "../_shared/gemini.ts";

interface ModelOptions {
  anthropicKey: string;
  geminiKey: string;
  timeoutMs: number;
}

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export async function routeModel(
  model: string,
  prompt: string,
  options: ModelOptions
): Promise<any> {
  if (model === "claude") {
    return callClaude(prompt, options);
  } else if (model === "gemini") {
    return callGemini(prompt, options);
  }
  throw new Error(`Unknown model: ${model}`);
}

async function callClaude(prompt: string, options: ModelOptions): Promise<any> {
  if (!options.anthropicKey) {
    throw new Error("Anthropic API key not configured. Set it in Settings > AI Keys.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";
    return parseJsonResponse(content);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Claude request timed out");
    }
    throw err;
  }
}

async function callGemini(prompt: string, options: ModelOptions): Promise<any> {
  if (!options.geminiKey) {
    throw new Error("No Gemini API key configured. Set it in Settings > AI Keys.");
  }
  return callGeminiDirect(prompt, options);
}

async function callGeminiDirect(prompt: string, options: ModelOptions): Promise<any> {
  const content = await fetchGeminiText({
    apiKey: options.geminiKey,
    prompt,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
  });
  return parseJsonResponse(content);
}

function parseJsonResponse(text: string): any {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object in the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        throw new Error("Failed to parse model response as JSON");
      }
    }
    throw new Error("Model response does not contain valid JSON");
  }
}
