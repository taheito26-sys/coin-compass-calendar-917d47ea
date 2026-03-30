import type { NormalizedRow, SkippedRow } from "./types";

// Coinbase Transaction History CSV
// Headers: Timestamp, Transaction Type, Asset, Quantity Transacted,
//          Spot Price Currency, Spot Price at Transaction, Subtotal,
//          Total (inclusive of fees and/or spread), Fees and/or Spread, Notes

export function parseCoinbase(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = r["Timestamp"] || r["timestamp"] || r["Date"] || r["date"] || "";
      const ts = new Date(dateStr).getTime();
      if (!ts || isNaN(ts)) { skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r }); continue; }

      const txType = (r["Transaction Type"] || r["transaction type"] || r["Type"] || "").trim().toLowerCase();
      if (!["buy","sell","advanced trade buy","advanced trade sell"].includes(txType)) {
        skipped.push({ line: i + 2, reason: `Skipped type: ${txType}`, raw: r }); continue;
      }

      const side: "buy" | "sell" = txType.includes("sell") ? "sell" : "buy";
      const assetRaw = (r["Asset"] || r["asset"] || "").trim().toUpperCase();
      const quoteCurrency = (r["Spot Price Currency"] || r["spot price currency"] || "USD").trim().toUpperCase();
      const symbol = assetRaw ? `${assetRaw}${quoteCurrency}` : "";
      if (!symbol) { skipped.push({ line: i + 2, reason: "Missing asset", raw: r }); continue; }

      const qty = parseNum(r["Quantity Transacted"] || r["quantity transacted"] || r["Quantity"] || "0");
      const price = parseNum(r["Spot Price at Transaction"] || r["spot price at transaction"] || r["Price"] || "0");
      const total = parseNum(r["Total (inclusive of fees and/or spread)"] || r["Total"] || r["Subtotal"] || "0");
      const fee = parseNum(r["Fees and/or Spread"] || r["Fees"] || r["Fee"] || "0");

      if (qty <= 0) { skipped.push({ line: i + 2, reason: "Zero qty", raw: r }); continue; }

      const tradeId = String(r["ID"] || r["id"] || r["Order ID"] || "");
      parsed.push({
        sourceRowIndex: i, timestamp: ts, exchange: "coinbase" as any, symbol, side, qty,
        unitPrice: price > 0 ? price : (qty > 0 ? Math.abs(total) / qty : 0),
        grossValue: Math.abs(total) || qty * price,
        feeAmount: Math.abs(fee), feeAsset: quoteCurrency,
        tradeId, orderId: tradeId, txHash: "", externalId: tradeId, raw: r,
      });
    } catch { skipped.push({ line: i + 2, reason: "Parse error", raw: r }); }
  }
  return { parsed, skipped };
}

function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
