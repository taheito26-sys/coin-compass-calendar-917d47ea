import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { AIRecommendationCard } from "./AIRecommendationCard";
import { ModelComparisonView } from "./ModelComparisonView";
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

export function AIAnalysisPanel() {
  const { data, status, error, analyze, retry, reset } = useAIAnalysis();
  const portfolio = useUnifiedPortfolio();
  const [model, setModel] = useState<"claude" | "gemini">("claude");
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
            {/* Portfolio summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard
                label="Portfolio Value"
                value={`$${(data.portfolioSummary?.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              />
              <SummaryCard
                label="Cash Available"
                value={`$${(data.portfolioSummary?.cash ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              />
              <SummaryCard
                label="Risk Level"
                value={data.portfolioSummary?.riskLevel ?? "N/A"}
                badge
                badgeVariant={data.portfolioSummary?.riskLevel === "high" ? "destructive" : data.portfolioSummary?.riskLevel === "medium" ? "secondary" : "default"}
              />
              <SummaryCard
                label="Diversification"
                value={`${data.portfolioSummary?.diversificationScore ?? 0}/100`}
              />
            </div>

            {/* Model badge */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="capitalize">{data.model}</Badge>
              <span>{new Date(data.timestamp).toLocaleString()}</span>
            </div>

            {/* Warnings */}
            {data.warnings.length > 0 && (
              <div className="space-y-1.5">
                {data.warnings.map((w, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-xs rounded-md p-2 ${
                      w.severity === "high"
                        ? "bg-destructive/10 text-destructive"
                        : w.severity === "medium"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span dir="auto">{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Recommendations</h4>
                <div className="grid gap-2">
                  {data.recommendations.map((rec, i) => (
                    <AIRecommendationCard key={i} recommendation={rec} />
                  ))}
                </div>
              </div>
            )}

            {/* Rebalance plan */}
            {data.rebalancePlan.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Suggested Rebalance</h4>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium">Asset</th>
                        <th className="text-right p-2 font-medium">Current %</th>
                        <th className="text-right p-2 font-medium">Target %</th>
                        <th className="text-right p-2 font-medium">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rebalancePlan.map((item, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 font-medium">{item.asset}</td>
                          <td className="text-right p-2">{item.currentAllocation.toFixed(1)}%</td>
                          <td className="text-right p-2">{item.targetAllocation.toFixed(1)}%</td>
                          <td className={`text-right p-2 ${item.delta > 0 ? "text-green-500" : item.delta < 0 ? "text-red-500" : ""}`}>
                            {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)}%
                          </td>
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
