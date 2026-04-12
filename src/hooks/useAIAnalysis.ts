import { useState, useCallback, useRef } from "react";
import { analyzePortfolio } from "@/lib/ai/client";
import type { AIAnalysisResponse, AIAnalysisRequest, AIAnalysisStatus } from "@/lib/ai/types";

interface UseAIAnalysisReturn {
  data: AIAnalysisResponse | null;
  status: AIAnalysisStatus;
  error: string | null;
  analyze: (request: AIAnalysisRequest) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useAIAnalysis(): UseAIAnalysisReturn {
  const [data, setData] = useState<AIAnalysisResponse | null>(null);
  const [status, setStatus] = useState<AIAnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const lastRequestRef = useRef<AIAnalysisRequest | null>(null);

  const analyze = useCallback(async (request: AIAnalysisRequest) => {
    abortRef.current = false;
    lastRequestRef.current = request;
    setData(null);
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

  const retry = useCallback(async () => {
    if (!lastRequestRef.current) return;
    await analyze(lastRequestRef.current);
  }, [analyze]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    lastRequestRef.current = null;
    setData(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { data, status, error, analyze, retry, cancel, reset };
}
