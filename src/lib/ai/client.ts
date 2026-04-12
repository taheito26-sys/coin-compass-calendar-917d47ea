import type { AIAnalysisResponse, AIAnalysisRequest } from "./types";
import { supabase } from "@/integrations/supabase/client";

export async function analyzePortfolio(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const { data, error } = await supabase.functions.invoke("ai-analysis", {
    body: request,
  });

  if (error) {
    throw new Error(error.message || "AI analysis request failed");
  }

  if (!data) {
    throw new Error("Empty response from AI analysis");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as AIAnalysisResponse;
}
