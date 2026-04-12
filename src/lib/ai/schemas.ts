import { z } from "zod";

export const recommendationSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  asset: z.string().min(1),
  confidence: z.number().min(0).max(1),
  priority: z.enum(["low", "medium", "high"]),
  reason: z.object({
    market: z.string(),
    portfolio: z.string(),
    risk: z.string(),
  }),
});

export const rebalanceItemSchema = z.object({
  asset: z.string().min(1),
  currentAllocation: z.number(),
  targetAllocation: z.number().min(0),
  delta: z.number(),
});

export const warningSchema = z.object({
  type: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
});

export const analysisResponseSchema = z.object({
  model: z.string(),
  timestamp: z.string(),
  portfolioSummary: z.object({
    value: z.number(),
    cash: z.number(),
    riskLevel: z.string(),
    diversificationScore: z.number(),
  }),
  recommendations: z.array(recommendationSchema),
  rebalancePlan: z.array(rebalanceItemSchema),
  warnings: z.array(warningSchema),
});
