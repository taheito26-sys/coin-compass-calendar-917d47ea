import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { AIRecommendationCard } from "./AIRecommendationCard";
import { ModelComparisonView } from "./ModelComparisonView";
import { AIAnalysisCard } from "@/features/ai-analysis/components/AIAnalysisCard";
import type { AIAnalysisRequest } from "@/lib/ai/types";
import {
  Brain,
  Loader2,
  AlertTriangle,
  Shield,
  TrendingUp,
  RefreshCw,
  Info,
} from "lucide-react";

const ARABIC_FALLBACK_TEXT = "الصورة غير واضحة حالياً، الأفضل التريث ومراقبة السيولة قبل أي تدوير.";

export function AIAnalysisPanel() {
  const { data, status, error, analyze, retry, reset } = useAIAnalysis();
  const portfolio = useUnifiedPortfolio();
  const [model, setModel] = useState<"claude" | "gemini">("gemini");
  const [riskProfile, setRiskProfile] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [comparisonData, setComparisonData] = useState<{
    claude: typeof data;
    gemini: typeof data;
  } | null>(null);
  const [comparing, setComparing] = useState(false);

  const hasPortfolioData = portfolio.positions.length > 0 && portfolio.totalMV > 0;
  const isBusy = status === "loading" || comparing;

  const runAnalysis = async () => {
    if (!hasPortfolioData) return;
    const request: AIAnalysisRequest = {
      analysisType: "portfolio",
      model,
      riskProfile,
    };
    await analyze(request);
  };

  const runComparison = async () => {
    if (!hasPortfolioData) return;
    setComparing(true);
    try {
      const [claudeResult, geminiResult] = await Promise.allSettled([
        (async () => {
          const { analyzePortfolio } = await import("@/lib/ai/client");
          return analyzePortfolio({ analysisType: "portfolio", model: "claude", riskProfile });
        })(),
        (async () => {
          const { analyzePortfolio } = await import("@/lib/ai/client");
          return analyzePortfolio({ analysisType: "portfolio", model: "gemini", riskProfile });
        })(),
      ]);

      setComparisonData({
        claude: claudeResult.status === "fulfilled" ? claudeResult.value : null,
        gemini: geminiResult.status === "fulfilled" ? geminiResult.value : null,
      });
    } catch {
      // handled via individual results
    }
    setComparing(false);
  };

  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Portfolio Analysis
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Model selector */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(["claude", "gemini"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    model === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Risk profile */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(["conservative", "moderate", "aggressive"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskProfile(r)}
                  className={`px-2 py-1.5 capitalize transition-colors ${
                    riskProfile === r
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {r.slice(0, 3)}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              onClick={runAnalysis}
              disabled={isBusy || !hasPortfolioData}
            >
              {status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-1" />
              )}
              Analyze Portfolio
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={runComparison}
              disabled={isBusy || !hasPortfolioData}
            >
              {comparing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Compare Models
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasPortfolioData && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Analysis requires portfolio holdings.</p>
              <p className="text-muted-foreground">
                Add transactions or sync an exchange account, then return here to run Claude or Gemini against your real portfolio.
              </p>
            </div>
          </div>
        )}

        {/* Status messages */}
        {hasPortfolioData && status === "idle" && !comparisonData && (
          <div className="text-center text-muted-foreground py-6 text-sm">
            Click <strong>Analyze Portfolio</strong> to get AI-powered insights based on your real holdings.
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Running {model === "claude" ? "Claude" : "Gemini"} on your live portfolio data…</span>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg p-3 text-sm flex-wrap">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error || "Analysis failed. Check your API key configuration in Settings."}</span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={retry} disabled={!hasPortfolioData}>
                Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {status === "partial" && data && (
          <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 rounded-lg p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>AI models unavailable. Showing deterministic analysis based on portfolio rules.</span>
          </div>
        )}

        {/* Single model result */}
        {data && (status === "success" || status === "partial") && !comparisonData && (
          <div className="space-y-4">
            {data.analysis ? (
              <AIAnalysisCard data={data} />
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                <p className="text-sm">بيانات التحليل غير متوفرة بشكل صحيح.</p>
                <p className="text-[10px] mt-1">Fallback: {ARABIC_FALLBACK_TEXT}</p>
              </div>
            )}
            
            {/* Legacy sections (Only if requested or for debugging) */}
            {process.env.NODE_ENV === 'development' && data.rebalancePlan && data.rebalancePlan.length > 0 && (
              <div className="opacity-50">
                <h4 className="text-[10px] uppercase tracking-widest mb-1">Raw Rebalance (Legacy)</h4>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-[10px]">
                    <tbody>
                      {data.rebalancePlan.slice(0, 3).map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-1">{item.asset}</td>
                          <td className="text-right p-1">{item.targetAllocation}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model comparison */}
        {comparisonData && (
          <ModelComparisonView
            claude={comparisonData.claude}
            gemini={comparisonData.gemini}
            onClose={() => setComparisonData(null)}
          />
        )}

        {/* Advisory disclaimer */}
        {(data || comparisonData) && (
          <p className="text-[10px] text-muted-foreground/60 leading-tight">
            This analysis is advisory only and does not constitute financial advice. AI models may produce inaccurate or incomplete assessments. Always conduct your own research before making investment decisions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  badge,
  badgeVariant,
}: {
  label: string;
  value: string;
  badge?: boolean;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      {badge ? (
        <Badge variant={badgeVariant} className="capitalize text-sm">{value}</Badge>
      ) : (
        <div className="text-sm font-semibold">{value}</div>
      )}
    </div>
  );
}
