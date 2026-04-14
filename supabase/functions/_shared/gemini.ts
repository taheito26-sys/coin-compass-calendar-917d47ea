export const GEMINI_MODEL = "gemini-2.5-flash";

interface FetchGeminiTextOptions {
  apiKey: string;
  prompt: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export async function fetchGeminiText({
  apiKey,
  prompt,
  timeoutMs = 45000,
  maxOutputTokens = 2048,
}: FetchGeminiTextOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Gemini request timed out");
    }
    throw err;
  }
}
