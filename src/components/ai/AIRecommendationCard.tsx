import { Badge } from "@/components/ui/badge";
import type { AIRecommendation } from "@/lib/ai/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const actionConfig = {
  buy: { icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10", label: "Buy" },
  sell: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10", label: "Sell" },
  hold: { icon: Minus, color: "text-amber-500", bg: "bg-amber-500/10", label: "Hold" },
};

const priorityVariant: Record<string, "default" | "secondary" | "destructive"> = {
  high: "destructive",
  medium: "secondary",
  low: "default",
};

export function AIRecommendationCard({ recommendation }: { recommendation: AIRecommendation }) {
  const config = actionConfig[recommendation.action];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-3 ${config.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="font-semibold text-sm">{recommendation.asset}</span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={priorityVariant[recommendation.priority]} className="text-[10px] capitalize">
            {recommendation.priority}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {(recommendation.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2 text-xs text-muted-foreground" dir="auto">
        <div>
          <span className="font-medium text-foreground/80">Market: </span>
          {recommendation.reason.market}
        </div>
        <div>
          <span className="font-medium text-foreground/80">Portfolio: </span>
          {recommendation.reason.portfolio}
        </div>
        <div>
          <span className="font-medium text-foreground/80">Risk: </span>
          {recommendation.reason.risk}
        </div>
      </div>

      {recommendation.alternatives && recommendation.alternatives.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-[10px] font-bold text-primary mb-2 uppercase tracking-tight">Proposed Strategic Alternatives</div>
          <div className="grid gap-2">
            {recommendation.alternatives.map((alt, i) => (
              <div key={i} className="bg-background/50 rounded-md p-2 border border-border/30 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{alt.asset}</span>
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                      {alt.weightPct}%
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] uppercase ${
                    alt.riskWeight === "high" ? "text-red-500 border-red-500/20" : 
                    alt.riskWeight === "medium" ? "text-amber-500 border-amber-500/20" : 
                    "text-green-500 border-green-500/20"
                  }`}>
                    {alt.riskWeight} risk
                  </Badge>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {alt.reason_en}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
