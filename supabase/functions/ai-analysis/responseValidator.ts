interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

const VALID_ACTIONS = new Set(["buy", "sell", "hold"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const VALID_SEVERITIES = new Set(["low", "medium", "high"]);

export function validateResponse(response: any): ValidationResult {
  const errors: string[] = [];

  if (!response || typeof response !== "object") {
    return { valid: false, errors: ["Response is not an object"] };
  }

  // Validate recommendations
  if (!Array.isArray(response.recommendations)) {
    errors.push("Missing or invalid recommendations array");
  } else {
    for (let i = 0; i < response.recommendations.length; i++) {
      const rec = response.recommendations[i];
      if (!rec || typeof rec !== "object") {
        errors.push(`recommendations[${i}] is not an object`);
        continue;
      }
      if (!VALID_ACTIONS.has(rec.action)) {
        errors.push(`recommendations[${i}].action invalid: ${rec.action}`);
      }
      if (typeof rec.asset !== "string" || !rec.asset) {
        errors.push(`recommendations[${i}].asset missing`);
      }
      if (typeof rec.confidence !== "number" || isNaN(rec.confidence) || rec.confidence < 0 || rec.confidence > 1) {
        errors.push(`recommendations[${i}].confidence invalid`);
      }
      if (!VALID_PRIORITIES.has(rec.priority)) {
        errors.push(`recommendations[${i}].priority invalid`);
      }
      if (!rec.reason || typeof rec.reason !== "object") {
        errors.push(`recommendations[${i}].reason missing`);
      } else {
        if (typeof rec.reason.market !== "string") errors.push(`recommendations[${i}].reason.market missing`);
        if (typeof rec.reason.portfolio !== "string") errors.push(`recommendations[${i}].reason.portfolio missing`);
        if (typeof rec.reason.risk !== "string") errors.push(`recommendations[${i}].reason.risk missing`);
      }
    }
  }

  // Validate rebalancePlan
  if (!Array.isArray(response.rebalancePlan)) {
    errors.push("Missing or invalid rebalancePlan array");
  } else {
    for (let i = 0; i < response.rebalancePlan.length; i++) {
      const plan = response.rebalancePlan[i];
      if (!plan || typeof plan !== "object") {
        errors.push(`rebalancePlan[${i}] is not an object`);
        continue;
      }
      if (typeof plan.asset !== "string") errors.push(`rebalancePlan[${i}].asset missing`);
      if (typeof plan.currentAllocation !== "number" || isNaN(plan.currentAllocation)) {
        errors.push(`rebalancePlan[${i}].currentAllocation invalid`);
      }
      if (typeof plan.targetAllocation !== "number" || isNaN(plan.targetAllocation) || plan.targetAllocation < 0) {
        errors.push(`rebalancePlan[${i}].targetAllocation invalid`);
      }
      if (typeof plan.delta !== "number" || isNaN(plan.delta)) {
        errors.push(`rebalancePlan[${i}].delta invalid`);
      }
    }
  }

  // Validate warnings
  if (!Array.isArray(response.warnings)) {
    errors.push("Missing or invalid warnings array");
  } else {
    for (let i = 0; i < response.warnings.length; i++) {
      const w = response.warnings[i];
      if (!w || typeof w !== "object") continue;
      if (typeof w.type !== "string") errors.push(`warnings[${i}].type missing`);
      if (!VALID_SEVERITIES.has(w.severity)) errors.push(`warnings[${i}].severity invalid`);
      if (typeof w.message !== "string") errors.push(`warnings[${i}].message missing`);
    }
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
