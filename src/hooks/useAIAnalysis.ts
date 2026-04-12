import { useState, useCallback, useRef } from "react";
import { analyzePortfolio } from "@/lib/ai/client";
import type { AIAnalysisResponse, AIAnalysisRequest, AIAnalysisStatus } from "@/lib/ai/types";

interface UseAIAnalysisReturn {
  data: AIAnalysisResponse | null;
  status: AIAnalysisStatus;
  error: string | null;
  analyze: (request: AIAnalysisRequest) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useAIAnalysis(): UseAIAnalysisReturn {
  const [data, setData] = useState<AIAnalysisResponse | null>(null);
  const [status, setStatus] = useState<AIAnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const analyze = useCallback(async (request: AIAnalysisRequest) => {
    abortRef.current = false;
    setStatus("loading");
    setError(null);

    try {
      const result = await analyzePortfolio(request);
      if (abortRef.current) return;

      setData(result);
      setStatus(result.model === "deterministic" ? "partial" : "success");
    } catch (err: any) {
      if (abortRef.current) return;
      setError(err.message || "Analysis failed");
      setStatus("error");
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { data, status, error, analyze, cancel, reset };
}
