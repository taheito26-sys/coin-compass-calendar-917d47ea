import type { NormalizedRow, SkippedRow } from "./types";

// Kraken Trades History CSV
// Headers: txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers

export function parseKraken(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = r["time"] || r["Time"] || r["Date"] || "";
      const ts = new Date(dateStr).getTime();
      if (!ts || isNaN(ts)) { skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r }); continue; }

      const sideRaw = (r["type"] || r["Type"] || "").trim().toLowerCase();
      const side: "buy" | "sell" = sideRaw === "sell" ? "sell" : "buy";

      // Kraken pairs: XXBTZUSD → BTCUSD, XETHZUSD → ETHUSD
      const rawPair = (r["pair"] || r["Pair"] || "").trim().toUpperCase();
      const symbol = normalizeKrakenPair(rawPair);
      if (!symbol) { skipped.push({ line: i + 2, reason: "Missing pair", raw: r }); continue; }

      const qty = parseNum(r["vol"] || r["Vol"] || r["volume"] || r["Qty"] || "0");
      const price = parseNum(r["price"] || r["Price"] || "0");
      const cost = parseNum(r["cost"] || r["Cost"] || "0");
      const fee = parseNum(r["fee"] || r["Fee"] || "0");
      const feeAsset = "USD"; // Kraken charges in quote currency typically

      if (qty <= 0) { skipped.push({ line: i + 2, reason: "Zero vol", raw: r }); continue; }

      const tradeId = String(r["txid"] || r["txId"] || "");
      const orderId = String(r["ordertxid"] || r["orderTxId"] || "");

      parsed.push({
        sourceRowIndex: i, timestamp: ts, exchange: "kraken" as any, symbol, side, qty,
        unitPrice: price > 0 ? price : (qty > 0 ? cost / qty : 0),
        grossValue: cost || qty * price,
        feeAmount: Math.abs(fee), feeAsset,
        tradeId, orderId, txHash: "", externalId: tradeId || orderId, raw: r,
      });
    } catch { skipped.push({ line: i + 2, reason: "Parse error", raw: r }); }
  }
  return { parsed, skipped };
}

// Map Kraken-style pairs like XXBTZUSD, XETHZEUR to canonical like BTCUSD, ETHUEUR
function normalizeKrakenPair(raw: string): string {
  const aliases: Record<string, string> = {
    XXBT: "BTC", XETH: "ETH", XLTC: "LTC", XXLM: "XLM", XXRP: "XRP",
    ZEUR: "EUR", ZUSD: "USD", ZGBP: "GBP", ZCAD: "CAD",
  };
  let s = raw;
  for (const [k, v] of Object.entries(aliases)) {
    s = s.replace(new RegExp(`^${k}`), v).replace(new RegExp(`${k}$`), v);
  }
  return s;
}

function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
