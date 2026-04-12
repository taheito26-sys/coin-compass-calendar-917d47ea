import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIAnalysisResponse } from "@/lib/ai/types";
import { AIRecommendationCard } from "./AIRecommendationCard";
import { X, AlertTriangle } from "lucide-react";

interface ModelComparisonViewProps {
  claude: AIAnalysisResponse | null;
  gemini: AIAnalysisResponse | null;
  onClose: () => void;
}

export function ModelComparisonView({ claude, gemini, onClose }: ModelComparisonViewProps) {
  const models = [
    { label: "Claude", data: claude },
    { label: "Gemini", data: gemini },
  ];

  // Detect disagreements
  const disagreements: string[] = [];
  if (claude && gemini) {
    if (claude.portfolioSummary.riskLevel !== gemini.portfolioSummary.riskLevel) {
      disagreements.push(
        `Risk level: Claude says "${claude.portfolioSummary.riskLevel}", Gemini says "${gemini.portfolioSummary.riskLevel}"`
      );
    }

    const claudeActions = new Set(claude.recommendations.map((r) => `${r.action}:${r.asset}`));
    const geminiActions = new Set(gemini.recommendations.map((r) => `${r.action}:${r.asset}`));
    for (const a of claudeActions) {
      if (!geminiActions.has(a)) {
        disagreements.push(`Claude recommends ${a.replace(":", " ")} but Gemini does not`);
      }
    }
    for (const a of geminiActions) {
      if (!claudeActions.has(a)) {
        disagreements.push(`Gemini recommends ${a.replace(":", " ")} but Claude does not`);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Model Comparison</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Disagreement alert */}
      {disagreements.length > 0 && (
        <div className="bg-amber-500/10 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Model Disagreements Detected
          </div>
          {disagreements.map((d, i) => (
            <div key={i} className="text-xs text-muted-foreground pl-5">• {d}</div>
          ))}
          <div className="text-[10px] text-muted-foreground/60 pl-5 pt-1">
            When models disagree, exercise extra caution. Consider the more conservative recommendation.
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {models.map(({ label, data }) => (
          <div key={label} className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{label}</Badge>
              {!data && (
                <Badge variant="destructive" className="text-[10px]">Failed</Badge>
              )}
            </div>

            {!data ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                {label} analysis unavailable — provider timeout or error
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Risk: </span>
                    <span className="font-medium capitalize">{data.portfolioSummary.riskLevel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Diversification: </span>
                    <span className="font-medium">{data.portfolioSummary.diversificationScore}/100</span>
                  </div>
                </div>

                {data.recommendations.map((rec, i) => (
                  <AIRecommendationCard key={i} recommendation={rec} />
                ))}

                {data.warnings.length > 0 && (
                  <div className="space-y-1">
                    {data.warnings.map((w, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground">
                        [{w.severity}] {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
