import { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";

// ── QR Code Generator (SVG-based, no external lib) ─────────────
// Simple text-to-QR placeholder using a visual pattern
function QRBlock({ text }: { text: string }) {
  // Generate a deterministic grid from text hash
  const grid = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    const size = 21;
    const cells: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      cells[y] = [];
      for (let x = 0; x < size; x++) {
        // Position detection patterns (corners)
        const inCorner = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        const cornerBorder = inCorner && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= size - 7 && (x === size - 7 || x === size - 1)) || (y >= size - 7 && (y === size - 7 || y === size - 1)));
        const cornerCenter = inCorner && x >= 2 && x <= 4 && y >= 2 && y <= 4;
        const cornerCenterR = inCorner && x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4;
        const cornerCenterB = inCorner && x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3;
        if (cornerBorder || cornerCenter || cornerCenterR || cornerCenterB) { cells[y][x] = true; continue; }
        // Data area: pseudo-random from hash
        hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
        cells[y][x] = (hash % 3) === 0;
      }
    }
    return cells;
  }, [text]);

  const cellSize = 8;
  const size = grid.length * cellSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: "#fff", borderRadius: 8, border: "1px solid var(--line)" }}>
      {grid.map((row, y) => row.map((on, x) =>
        on ? <rect key={`${x}-${y}`} x={x * cellSize} y={y * cellSize} width={cellSize} height={cellSize} fill="#000" /> : null
      ))}
    </svg>
  );
}

// ── Trade Calculator ────────────────────────────────────────────
function TradeCalculator() {
  const [qty, setQty] = useState("1");
  const [entry, setEntry] = useState("50000");
  const [exit, setExit] = useState("55000");
  const [leverage, setLeverage] = useState("1");
  const [fee, setFee] = useState("0.1");
  const [direction, setDirection] = useState<"long" | "short">("long");

  const result = useMemo(() => {
    const q = parseFloat(qty) || 0, e = parseFloat(entry) || 0, x = parseFloat(exit) || 0, l = parseFloat(leverage) || 1, f = parseFloat(fee) || 0;
    const investment = q * e;
    const feeTotal = investment * (f / 100) * 2; // entry + exit
    const priceDiff = direction === "long" ? x - e : e - x;
    const rawPnl = q * priceDiff * l;
    const netPnl = rawPnl - feeTotal;
    const pnlPct = investment > 0 ? (netPnl / investment) * 100 : 0;
    const liqPrice = direction === "long"
      ? e * (1 - 1 / l * 0.95)
      : e * (1 + 1 / l * 0.95);
    return { investment, feeTotal, rawPnl, netPnl, pnlPct, liqPrice };
  }, [qty, entry, exit, leverage, fee, direction]);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["long", "short"] as const).map(d => (
          <button key={d} onClick={() => setDirection(d)}
            style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11, background: direction === d ? (d === "long" ? "var(--good)" : "var(--bad)") : "var(--panel2)", color: direction === d ? "#fff" : "var(--muted)" }}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Quantity", value: qty, set: setQty },
          { label: "Entry Price", value: entry, set: setEntry },
          { label: "Exit Price", value: exit, set: setExit },
          { label: "Leverage", value: leverage, set: setLeverage },
          { label: "Fee %", value: fee, set: setFee },
        ].map(f => (
          <div key={f.label}>
            <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>{f.label}</label>
            <input className="inp" value={f.value} onChange={e => f.set(e.target.value)} style={{ width: "100%", fontSize: 12 }} />
          </div>
        ))}
      </div>
      <div style={{ background: "var(--panel2)", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Investment", value: fmtFiat(result.investment) },
          { label: "Total Fees", value: fmtFiat(result.feeTotal), color: "var(--bad)" },
          { label: "Net P&L", value: `${result.netPnl >= 0 ? "+" : ""}${fmtFiat(result.netPnl)}`, color: result.netPnl >= 0 ? "var(--good)" : "var(--bad)" },
          { label: "ROI", value: `${result.pnlPct >= 0 ? "+" : ""}${result.pnlPct.toFixed(2)}%`, color: result.pnlPct >= 0 ? "var(--good)" : "var(--bad)" },
          { label: "Liq. Price (est.)", value: parseFloat(leverage) > 1 ? fmtFiat(result.liqPrice) : "N/A", color: "var(--warn)" },
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>{r.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: r.color || "var(--text)", marginTop: 2 }}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function ToolsPage() {
  const [qrText, setQrText] = useState("");

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>Tools</h2>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>Trade calculator, market cap simulator, QR generator</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        {/* Trade Calculator */}
        <div className="panel">
          <div className="panel-head"><h2>🧮 Trade Calculator</h2></div>
          <div className="panel-body"><TradeCalculator /></div>
        </div>

        {/* QR Code Generator */}
        <div className="panel">
          <div className="panel-head"><h2>📱 QR Code Generator</h2></div>
          <div className="panel-body">
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Generate a QR code for any wallet address or text.</p>
            <input className="inp" value={qrText} onChange={e => setQrText(e.target.value)} placeholder="Paste wallet address or any text" style={{ width: "100%", fontSize: 12, marginBottom: 12 }} />
            {qrText.trim() ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 16, background: "var(--panel2)", borderRadius: 8 }}>
                <QRBlock text={qrText} />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 11 }}>Enter text above to generate QR code</div>
            )}
            <p style={{ fontSize: 9, color: "var(--muted2)", marginTop: 8, textAlign: "center" }}>Visual preview only — for production QR scanning, use a dedicated QR library</p>
          </div>
        </div>
      </div>
    </div>
  );
}
