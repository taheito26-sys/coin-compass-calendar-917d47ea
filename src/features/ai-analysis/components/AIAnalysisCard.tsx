import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Shield, AlertCircle, LucideIcon, Zap, Target } from "lucide-react";
import type { AIAnalysisResponse, MarketRegime } from "../types/aiAnalysis";

interface AIAnalysisCardProps {
  data: AIAnalysisResponse;
}

const REGIME_MAP: Record<MarketRegime, { label: string; color: string; icon: LucideIcon }> = {
  risk_on: { label: "إيجابي - مخاطرة", color: "text-green-500 bg-green-500/10", icon: Zap },
  neutral: { label: "محايد", color: "text-amber-500 bg-amber-500/10", icon: Shield },
  risk_off: { label: "حذر - مخاطرة منخفضة", color: "text-red-500 bg-red-500/10", icon: AlertCircle },
};

export function AIAnalysisCard({ data }: AIAnalysisCardProps) {
  const { analysis, portfolioMeta, model, timestamp } = data;
  const regimeInfo = REGIME_MAP[analysis.marketState.regime] || REGIME_MAP.neutral;

  return (
    <Card className="border-primary/20 bg-card/95 overflow-hidden" dir="rtl">
      <CardHeader className="bg-muted/30 pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-md flex items-center gap-2 font-bold text-foreground">
            <Brain className="h-5 w-5 text-primary" />
            تحليل السوق الذكي (360°)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase font-bold ${regimeInfo.color}`}>
              <regimeInfo.icon className="h-3 w-3 mr-1" />
              {regimeInfo.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5 text-right">
        {/* 1. الحالة */}
        <div className="space-y-1">
          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 justify-end">
            الحالة
            < Zap className="h-3 w-3" />
          </h4>
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {analysis.marketState.summary_ar}
          </p>
        </div>

        {/* 2. الخطر */}
        <div className="space-y-1">
          <h4 className="text-[11px] font-bold text-destructive uppercase tracking-widest flex items-center gap-1.5 justify-end">
            الخطر
            <AlertCircle className="h-3 w-3" />
          </h4>
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {analysis.risk.primary_ar}
          </p>
        </div>

        {/* 3. القرار */}
        <div className="space-y-1 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <h4 className="text-[11px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5 justify-end">
            القرار
            <Target className="h-3 w-3" />
          </h4>
          <p className="text-sm font-bold leading-relaxed text-foreground italic">
            {analysis.decision.action_ar}
          </p>
        </div>

        {/* 4. فرصة بديلة */}
        <div className="space-y-1">
          <h4 className="text-[11px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1.5 justify-end">
            فرصة بديلة
            <Brain className="h-3 w-3" />
          </h4>
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {analysis.opportunity.replacement_ar}
          </p>
        </div>

        {/* 5. ملخص */}
        <div className="pt-2 mt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            {analysis.compactSummary.text_ar}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-4 border-t border-border/30 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>الموديل: {model.toUpperCase()}</span>
            <span>|</span>
            <span>{new Date(timestamp).toLocaleTimeString("ar-SA")}</span>
          </div>
          <div className="font-bold text-primary/70">
            {portfolioMeta.riskLevel.toUpperCase()} RISK
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
