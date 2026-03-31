import { describe, it, expect } from "vitest";

// Ported FIFO logic for testing
interface TestTx {
  id: string;
  type: string;
  qty: number;
  price: number;
  fee: number;
  ts: number;
}

interface TestLot {
  txId: string;
  qty: number;
  rem: number;
  unitCost: number;
}

function runFifo(txs: TestTx[]) {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const openLots: TestLot[] = [];
  let realizedPnl = 0;

  for (const tx of sorted) {
    const q = Math.abs(tx.qty);
    if (["buy", "transfer_in"].includes(tx.type)) {
      const totalCost = tx.type === "buy" ? (q * tx.price) + tx.fee : q * tx.price;
      openLots.push({
        txId: tx.id,
        qty: q,
        rem: q,
        unitCost: q > 0 ? totalCost / q : 0
      });
    } else if (["sell", "transfer_out"].includes(tx.type)) {
      let rem = q;
      let costConsumed = 0;
      for (const lot of openLots) {
        if (rem <= 0) break;
        if (lot.rem <= 0) continue;
        const take = Math.min(lot.rem, rem);
        costConsumed += take * lot.unitCost;
        lot.rem -= take;
        rem -= take;
      }
      if (tx.type === "sell") {
        const proceeds = (q * tx.price) - tx.fee;
        realizedPnl += (proceeds - costConsumed);
      }
    }
  }

  const remainingQty = openLots.reduce((s, l) => s + l.rem, 0);
  const remainingCost = openLots.reduce((s, l) => s + l.rem * l.unitCost, 0);

  return { remainingQty, remainingCost, realizedPnl, openLots: openLots.filter(l => l.rem > 0) };
}

describe("Deterministic FIFO Accounting", () => {
  it("calculates simple buy and sell correctly", () => {
    const txs: TestTx[] = [
      { id: "1", type: "buy", qty: 1, price: 100, fee: 0, ts: 1000 },
      { id: "2", type: "sell", qty: 0.5, price: 150, fee: 0, ts: 2000 },
    ];
    const result = runFifo(txs);
    expect(result.remainingQty).toBe(0.5);
    expect(result.remainingCost).toBe(50);
    expect(result.realizedPnl).toBe(25); // (0.5 * 150) - (0.5 * 100) = 75 - 50 = 25
  });

  it("handles multiple buys and partial sells (FIFO order)", () => {
    const txs: TestTx[] = [
      { id: "1", type: "buy", qty: 1, price: 100, fee: 0, ts: 1000 },
      { id: "2", type: "buy", qty: 1, price: 200, fee: 0, ts: 1500 },
      { id: "3", type: "sell", qty: 1.5, price: 300, fee: 0, ts: 2000 },
    ];
    const result = runFifo(txs);
    // Sell 1.5: 1.0 from Lot 1 (cost 100), 0.5 from Lot 2 (cost 100)
    // Total cost consumed: 100 + 100 = 200
    // Total proceeds: 1.5 * 300 = 450
    // Realized: 450 - 200 = 250
    expect(result.remainingQty).toBe(0.5);
    expect(result.remainingCost).toBe(100); // 0.5 left in Lot 2 (unit cost 200)
    expect(result.realizedPnl).toBe(250);
  });

  it("incorporates fees into cost basis", () => {
    const txs: TestTx[] = [
      { id: "1", type: "buy", qty: 1, price: 100, fee: 10, ts: 1000 }, // Total cost 110
      { id: "2", type: "sell", qty: 1, price: 150, fee: 5, ts: 2000 }, // Total proceeds 145
    ];
    const result = runFifo(txs);
    expect(result.realizedPnl).toBe(35); // 145 - 110 = 35
  });

  it("is deterministic regardless of transaction input order (if sorted by TS)", () => {
    const txs: TestTx[] = [
      { id: "2", type: "sell", qty: 1, price: 150, fee: 0, ts: 2000 },
      { id: "1", type: "buy", qty: 1, price: 100, fee: 0, ts: 1000 },
    ];
    const result = runFifo(txs);
    expect(result.realizedPnl).toBe(50);
  });
});
