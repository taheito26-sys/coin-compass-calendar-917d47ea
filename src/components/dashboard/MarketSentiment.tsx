import { useMemo, useState, useEffect } from "react";

export default function MarketSentiment() {
  const [fng, setfng] = useState({ value: 50, label: "Neutral" });

  useEffect(() => {
    async function loadFng() {
      try {
        const res = await fetch("https://api.alternative.me/fng/");
        const json = await res.json();
        const val = parseInt(json.data[0].value);
        const lbl = json.data[0].value_classification;
        setfng({ value: val, label: lbl });
      } catch (err) {
        console.error("F&G Fetch Error:", err);
      }
    }
    loadFng();
  }, []);

  const data = useMemo(() => ({
    fearGreed: fng.value,
    label: fng.label,
    longRatio: 51.2, // Still mock, would need CEX integration
    shortRatio: 48.8,
  }), [fng]);

  const getGaugeColor = (val: number) => {
    if (val < 25) return "var(--bad)";
    if (val < 45) return "#f97316";
    if (val < 55) return "#eab308";
    if (val < 75) return "#84cc16";
    return "var(--good)";
  };

  const needleRotation = (data.fearGreed / 100) * 180 - 90;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Market Sentiment</h2>
        <button className="btn tiny secondary" style={{ fontSize: 10 }}>View More →</button>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 6px" }}>
        {/* Gauge */}
        <div style={{ position: "relative", width: 180, height: 90, overflow: "hidden" }}>
          <svg viewBox="0 0 100 50" style={{ width: "100%", height: "100%" }}>
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="var(--line)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="125.6"
              strokeDashoffset="125.6"
            />
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--bad)" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="var(--good)" />
              </linearGradient>
            </defs>
            {/* Dots */}
            {[0, 25, 50, 75, 100].map((v, i) => {
              const ang = (v / 100) * Math.PI;
              const x = 50 - 46 * Math.cos(ang);
              const y = 50 - 46 * Math.sin(ang);
              return <circle key={i} cx={x} cy={y} r="1" fill="var(--muted2)" />;
            })}
          </svg>
          
          {/* Needle */}
          <div style={{
            position: "absolute", bottom: 0, left: "50%", width: 2, height: 40,
            background: "var(--text)", transformOrigin: "bottom center",
            transform: `translateX(-50%) rotate(${needleRotation}deg)`,
            transition: "transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 2, borderRadius: 2
          }} />
          <div style={{
            position: "absolute", bottom: -4, left: "50%", width: 10, height: 10,
            background: "var(--text)", borderRadius: "50%", transform: "translateX(-50%)",
            zIndex: 3, border: "2px solid var(--panel)"
          }} />

          {/* Indicator label */}
          <div style={{
            position: "absolute", bottom: 10, left: 0, right: 0,
            textAlign: "center", pointerEvents: "none"
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: getGaugeColor(data.fearGreed), lineHeight: 1 }}>{data.fearGreed}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: getGaugeColor(data.fearGreed), marginTop: 4 }}>{data.label}</div>
          </div>
        </div>

        {/* Long/Short Bar */}
        <div style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
            <span style={{ color: "var(--good)" }}>LONG</span>
            <span style={{ color: "var(--bad)" }}>SHORT</span>
          </div>
          <div style={{ height: 12, width: "100%", background: "var(--panel2)", borderRadius: 6, overflow: "hidden", display: "flex", position: "relative" }}>
            <div style={{ width: `${data.longRatio}%`, background: "var(--good)", height: "100%", transition: "width 1s ease" }} />
            <div style={{ width: `${data.shortRatio}%`, background: "var(--bad)", height: "100%", transition: "width 1s ease" }} />
            {/* Indicator line */}
            <div style={{ position: "absolute", left: `${data.longRatio}%`, top: 0, bottom: 0, width: 2, background: "var(--panel)", transform: "translateX(-1px) skewX(-15deg)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, fontWeight: 900, fontFamily: "monospace" }}>
            <span style={{ color: "var(--good)" }}>{data.longRatio}%</span>
            <span style={{ color: "var(--bad)" }}>{data.shortRatio}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
