interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

const VALID_REGIMES = new Set(["risk_on", "neutral", "risk_off"]);

export function validateResponse(response: any): ValidationResult {
  const errors: string[] = [];

  if (!response || typeof response !== "object") {
    return { valid: false, errors: ["Response is not an object"] };
  }

  // marketState
  if (!response.marketState || typeof response.marketState !== "object") {
    errors.push("marketState missing or invalid");
  } else {
    if (!VALID_REGIMES.has(response.marketState.regime)) {
      errors.push(`marketState.regime invalid: ${response.marketState.regime}`);
    }
    if (typeof response.marketState.summary_ar !== "string" || !response.marketState.summary_ar) {
      errors.push("marketState.summary_ar missing");
    }
  }

  // risk
  if (!response.risk || typeof response.risk !== "object" || typeof response.risk.primary_ar !== "string" || !response.risk.primary_ar) {
    errors.push("risk.primary_ar missing or invalid");
  }

  // decision
  if (!response.decision || typeof response.decision !== "object" || typeof response.decision.action_ar !== "string" || !response.decision.action_ar) {
    errors.push("decision.action_ar missing or invalid");
  }

  // opportunity
  if (!response.opportunity || typeof response.opportunity !== "object" || typeof response.opportunity.replacement_ar !== "string" || !response.opportunity.replacement_ar) {
    errors.push("opportunity.replacement_ar missing or invalid");
  }

  // compactSummary
  if (!response.compactSummary || typeof response.compactSummary !== "object" || typeof response.compactSummary.text_ar !== "string" || !response.compactSummary.text_ar) {
    errors.push("compactSummary.text_ar missing or invalid");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
