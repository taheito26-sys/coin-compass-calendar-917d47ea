import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLivePrices } from "@/hooks/useLivePrices";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function CoinAutocomplete({ value, onChange, placeholder = "BTC" }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const { coins } = useLivePrices();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        const portalContent = document.getElementById("coin-autocomplete-portal");
        if (portalContent && portalContent.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const updateCoords = () => {
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      }
    };

    updateCoords();
    // Listening on all scroll events in capture phase to catch scrolls in internal containers
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

  const q = value.toLowerCase().trim();
  const matches = q.length > 0
    ? coins.filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, matches.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && matches[selected]) {
      e.preventDefault();
      onChange(matches[selected].symbol.toUpperCase());
      setOpen(false);
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="inp"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setSelected(0); }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && createPortal(
        <div 
          id="coin-autocomplete-portal"
          style={{
            position: "fixed", 
            top: coords.top + 2, 
            left: coords.left, 
            width: coords.width, 
            zIndex: 1000000, // Very high to sit on top of everything
            background: "var(--panel)", 
            border: "1px solid var(--line)",
            borderRadius: "var(--lt-radius-sm, 8px)",
            maxHeight: 240, 
            overflowY: "auto",
            boxShadow: "0 12px 40px rgba(0,0,0,.3)",
          }}
        >
          {matches.map((c, i) => (
            <div
              key={c.id}
              onMouseDown={(e) => e.stopPropagation()} // Prevent closing on click
              onClick={() => { onChange(c.symbol.toUpperCase()); setOpen(false); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 11,
                background: i === selected ? "var(--brand3)" : "transparent",
                borderBottom: "1px solid var(--line2)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={c.image} alt="" style={{ width: 18, height: 18, borderRadius: 9 }} />
                <span style={{ fontWeight: 800, color: "var(--text)" }}>{c.symbol.toUpperCase()}</span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>{c.name}</span>
              </div>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>#{c.market_cap_rank}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
