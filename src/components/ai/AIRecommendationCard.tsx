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

      <div className="grid md:grid-cols-3 gap-2 text-xs text-muted-foreground">
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
    </div>
  );
}
