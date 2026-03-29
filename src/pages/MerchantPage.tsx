/**
 * MerchantPage v2 — Full merchant lending & profit-sharing platform
 * Tabs: Overview, Directory, Invites, Relationships, Advances, Sales, Profit-Share,
 *       Capital Pools, Settlements, Approvals, Notifications, Audit, Settings
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/supabaseAuth";
import * as api from "@/lib/merchantApi";

type MerchantTab = "overview" | "directory" | "invites" | "relationships" | "advances" | "sales" | "profit_share" | "pools" | "settlements" | "approvals" | "notifications" | "audit" | "settings";

const TABS: { id: MerchantTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "directory", label: "Directory", icon: "🔍" },
  { id: "invites", label: "Invites", icon: "📨" },
  { id: "relationships", label: "Connections", icon: "🤝" },
  { id: "advances", label: "Advances", icon: "💵" },
  { id: "sales", label: "Sales", icon: "🏷️" },
  { id: "profit_share", label: "Profit-Share", icon: "📈" },
  { id: "pools", label: "Pools", icon: "🏦" },
  { id: "settlements", label: "Settlements", icon: "💳" },
  { id: "approvals", label: "Approvals", icon: "✅" },
  { id: "notifications", label: "Alerts", icon: "🔔" },
  { id: "audit", label: "Audit", icon: "📋" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

// ── Shared UI primitives ──
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 20px", flex: "1 1 180px", minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "var(--good)", pending: "var(--warn)", rejected: "#ef4444",
    accepted: "var(--good)", withdrawn: "var(--muted)", expired: "var(--muted)",
    draft: "var(--muted)", due: "var(--warn)", settled: "var(--good)",
    closed: "var(--muted)", overdue: "#ef4444", cancelled: "var(--muted)",
    approved: "var(--good)", suspended: "#ef4444", terminated: "#ef4444",
    open: "var(--brand)", locked: "var(--warn)", paused: "var(--warn)",
    disputed: "#ef4444",
  };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: colors[status] || "var(--muted)", color: "#fff", textTransform: "uppercase",
    }}>{status}</span>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{children}</div>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>{text}</div>;
}

function Card({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
      padding: 14, marginBottom: 8, cursor: onClick ? "pointer" : "default",
      transition: "border-color .15s", ...style,
    }}>{children}</div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: "var(--muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Onboarding ──
function MerchantOnboarding({ onCreated }: { onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [merchantType, setMerchantType] = useState("independent");
  const [region, setRegion] = useState("");
  const [bio, setBio] = useState("");
  const [discoverability, setDiscoverability] = useState("public");
  const [nickAvailable, setNickAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkNick = useCallback(async (v: string) => {
    if (v.length < 3) { setNickAvailable(null); return; }
    try { const { available } = await api.checkNickname(v); setNickAvailable(available); } catch { setNickAvailable(null); }
  }, []);

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      await api.createProfile({ nickname, display_name: displayName, merchant_type: merchantType, region: region || undefined, discoverability, bio: bio || undefined });
      onCreated();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Create Your Merchant Profile</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>
        Step {step} of 2 — {step === 1 ? "Identity" : "Preferences"}
      </p>

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FieldRow label="Display Name *">
            <input className="inputBox" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Taheito Trading" />
          </FieldRow>
          <FieldRow label={`Nickname * ${nickAvailable === true ? "✓ Available" : nickAvailable === false ? "✗ Taken" : ""}`}>
            <input className="inputBox" value={nickname} onChange={e => { setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); checkNick(e.target.value); }} placeholder="taheito_trading" />
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>3-30 chars: a-z, 0-9, underscore</div>
          </FieldRow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldRow label="Type">
              <select className="inputBox" value={merchantType} onChange={e => setMerchantType(e.target.value)}>
                <option value="independent">Independent</option><option value="desk">Desk</option>
                <option value="partner">Partner</option><option value="other">Other</option>
              </select>
            </FieldRow>
            <FieldRow label="Region">
              <input className="inputBox" value={region} onChange={e => setRegion(e.target.value)} placeholder="Qatar" />
            </FieldRow>
          </div>
          <FieldRow label="Discoverability">
            <select className="inputBox" value={discoverability} onChange={e => setDiscoverability(e.target.value)}>
              <option value="public">Public — searchable</option>
              <option value="merchant_id_only">Merchant ID only</option>
              <option value="hidden">Hidden</option>
            </select>
          </FieldRow>
          <FieldRow label="Bio">
            <textarea className="inputBox" value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Short description..." style={{ resize: "vertical" }} />
          </FieldRow>
          <button className="btn primary" onClick={() => setStep(2)} disabled={!displayName || !nickname || nickAvailable === false}
            style={{ padding: "10px 20px" }}>Next →</button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: "var(--muted)", fontSize: 12 }}>You can configure operating preferences after creating your profile in Relationship Settings.</p>
          {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn primary" onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>
              {loading ? "Creating..." : "Create Merchant Profile"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overview Tab (v2 Dashboard) ──
function OverviewTab({ profile, relationships, deals, advances, unreadCount }: {
  profile: api.MerchantProfile; relationships: api.MerchantRelationship[];
  deals: api.MerchantDeal[]; advances: api.MerchantAdvance[]; unreadCount: number;
}) {
  const activeRels = relationships.filter(r => r.status === "active").length;
  const totalOutstandingPrincipal = advances.reduce((s, a) => s + a.outstanding_principal, 0);
  const overduePrincipal = advances.filter(a => a.due_date && new Date(a.due_date) < new Date() && a.outstanding_principal > 0)
    .reduce((s, a) => s + a.outstanding_principal, 0);
  const activeDeals = deals.filter(d => ["active", "due"].includes(d.status)).length;
  const totalExposure = deals.filter(d => ["active", "due"].includes(d.status)).reduce((s, d) => s + d.amount, 0);
  const totalRealized = deals.reduce((s, d) => s + (d.realized_pnl || 0), 0);

  return (
    <div>
      {/* Profile header */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{profile.display_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>@{profile.nickname}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Merchant ID</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)", fontFamily: "monospace" }}>{profile.merchant_id}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <StatusBadge status={profile.status} />
          <span style={{ fontSize: 10, color: "var(--muted)", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{profile.merchant_type}</span>
          {profile.region && <span style={{ fontSize: 10, color: "var(--muted)", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{profile.region}</span>}
        </div>
        {profile.bio && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>{profile.bio}</p>}
      </Card>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Active Connections" value={activeRels} />
        <StatCard label="Total Capital Deployed" value={`$${fmt(totalExposure)}`} accent="var(--warn)" />
        <StatCard label="Outstanding Principal" value={`$${fmt(totalOutstandingPrincipal)}`} accent={totalOutstandingPrincipal > 0 ? "var(--warn)" : "var(--good)"} />
        <StatCard label="Overdue Principal" value={`$${fmt(overduePrincipal)}`} accent={overduePrincipal > 0 ? "#ef4444" : "var(--good)"} />
        <StatCard label="Realized P&L" value={`$${fmt(totalRealized)}`} accent={totalRealized >= 0 ? "var(--good)" : "#ef4444"} />
        <StatCard label="Active Deals" value={activeDeals} />
        <StatCard label="Unread Alerts" value={unreadCount} accent={unreadCount > 0 ? "var(--warn)" : undefined} />
      </div>

      {/* Merchant Cards (per relationship) */}
      {relationships.filter(r => r.status === "active").length > 0 && (
        <>
          <SectionTitle>Active Merchant Partners</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 20 }}>
            {relationships.filter(r => r.status === "active").map(rel => {
              const cp = rel.my_role === "owner"
                ? { name: rel.b_display_name, nick: rel.b_nickname }
                : { name: rel.a_display_name, nick: rel.a_nickname };
              const relDeals = deals.filter(d => d.relationship_id === rel.id);
              const relExposure = relDeals.filter(d => ["active", "due"].includes(d.status)).reduce((s, d) => s + d.amount, 0);
              const relProfit = relDeals.reduce((s, d) => s + (d.realized_pnl || 0), 0);
              return (
                <Card key={rel.id}>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{cp.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>@{cp.nick} · {rel.relationship_type}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
                    <div><span style={{ color: "var(--muted)" }}>Exposure:</span> <span style={{ color: "var(--warn)", fontWeight: 600 }}>${fmt(relExposure)}</span></div>
                    <div><span style={{ color: "var(--muted)" }}>Profit:</span> <span style={{ color: relProfit >= 0 ? "var(--good)" : "#ef4444", fontWeight: 600 }}>${fmt(relProfit)}</span></div>
                    <div><span style={{ color: "var(--muted)" }}>Deals:</span> {relDeals.length}</div>
                    <div><StatusBadge status={rel.status} /></div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Directory Tab ──
function DirectoryTab({ myProfile, onInviteSent }: { myProfile: api.MerchantProfile; onInviteSent: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.MerchantProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<api.MerchantProfile | null>(null);
  const [inviteMsg, setInviteMsg] = useState("");
  const [invitePurpose, setInvitePurpose] = useState("general collaboration");
  const [sending, setSending] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try { const { results: r } = await api.searchMerchants(query); setResults(r.filter(m => m.id !== myProfile.id)); }
    catch { setResults([]); } finally { setSearching(false); }
  };

  const doInvite = async () => {
    if (!inviteTarget) return;
    setSending(true);
    try {
      await api.sendInvite({ to_merchant_id: inviteTarget.id, purpose: invitePurpose, message: inviteMsg || undefined });
      setInviteTarget(null); setInviteMsg(""); onInviteSent();
    } catch (err: any) { alert(err.message); } finally { setSending(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="inputBox" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by Merchant ID or nickname..."
          onKeyDown={e => e.key === "Enter" && doSearch()} style={{ flex: 1 }} />
        <button className="btn primary" onClick={doSearch} disabled={searching}>{searching ? "..." : "Search"}</button>
      </div>
      {results.map(m => (
        <Card key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{m.display_name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>@{m.nickname} · {m.merchant_id}</div>
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{m.merchant_type} · {m.region || "—"}</div>
          </div>
          <button className="btn primary" onClick={() => setInviteTarget(m)} style={{ fontSize: 11, padding: "6px 14px" }}>Send Invite</button>
        </Card>
      ))}
      {inviteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setInviteTarget(null)}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, width: "min(440px, 90vw)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "var(--text)", fontSize: 16, marginBottom: 16 }}>Invite {inviteTarget.display_name}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FieldRow label="Purpose"><input className="inputBox" value={invitePurpose} onChange={e => setInvitePurpose(e.target.value)} /></FieldRow>
              <FieldRow label="Message"><textarea className="inputBox" value={inviteMsg} onChange={e => setInviteMsg(e.target.value)} rows={3} placeholder="Introduce yourself..." /></FieldRow>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn secondary" onClick={() => setInviteTarget(null)}>Cancel</button>
                <button className="btn primary" onClick={doInvite} disabled={sending}>{sending ? "Sending..." : "Send Invite"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invites Tab ──
function InvitesTab({ onAction }: { onAction: () => void }) {
  const [inbox, setInbox] = useState<api.MerchantInvite[]>([]);
  const [sent, setSent] = useState<api.MerchantInvite[]>([]);
  const [view, setView] = useState<"inbox" | "sent">("inbox");

  useEffect(() => { api.fetchInbox().then(r => setInbox(r.invites)).catch(() => {}); }, []);
  useEffect(() => { api.fetchSentInvites().then(r => setSent(r.invites)).catch(() => {}); }, []);

  const handleAccept = async (id: string) => {
    try { await api.acceptInvite(id); onAction(); api.fetchInbox().then(r => setInbox(r.invites)); } catch (e: any) { alert(e.message); }
  };
  const handleReject = async (id: string) => {
    try { await api.rejectInvite(id); api.fetchInbox().then(r => setInbox(r.invites)); } catch (e: any) { alert(e.message); }
  };
  const handleWithdraw = async (id: string) => {
    try { await api.withdrawInvite(id); api.fetchSentInvites().then(r => setSent(r.invites)); } catch (e: any) { alert(e.message); }
  };

  const list = view === "inbox" ? inbox : sent;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${view === "inbox" ? "primary" : "secondary"}`} onClick={() => setView("inbox")} style={{ fontSize: 11 }}>
          Inbox ({inbox.filter(i => i.status === "pending").length})
        </button>
        <button className={`btn ${view === "sent" ? "primary" : "secondary"}`} onClick={() => setView("sent")} style={{ fontSize: 11 }}>
          Sent ({sent.filter(i => i.status === "pending").length})
        </button>
      </div>
      {list.length === 0 && <Empty text="No invites" />}
      {list.map(inv => (
        <Card key={inv.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>
                {view === "inbox" ? (inv.from_display_name || inv.from_merchant_id) : (inv.to_display_name || inv.to_merchant_id)}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{inv.purpose || "General collaboration"} · Role: {inv.requested_role}</div>
              {inv.message && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4, fontStyle: "italic" }}>"{inv.message}"</div>}
              <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>{new Date(inv.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={inv.status} />
              {view === "inbox" && inv.status === "pending" && (
                <>
                  <button className="btn primary" onClick={() => handleAccept(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Accept</button>
                  <button className="btn secondary" onClick={() => handleReject(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Reject</button>
                </>
              )}
              {view === "sent" && inv.status === "pending" && (
                <button className="btn secondary" onClick={() => handleWithdraw(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Withdraw</button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Relationships / Connections Tab ──
function RelationshipsTab({ relationships, onSelect }: { relationships: api.MerchantRelationship[]; onSelect: (id: string) => void }) {
  return (
    <div>
      {relationships.length === 0 && <Empty text="No connections yet. Send invites from the Directory." />}
      {relationships.map(rel => {
        const cp = rel.my_role === "owner"
          ? { name: rel.b_display_name, nick: rel.b_nickname, code: rel.b_merchant_code }
          : { name: rel.a_display_name, nick: rel.a_nickname, code: rel.a_merchant_code };
        return (
          <Card key={rel.id} onClick={() => onSelect(rel.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{cp.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>@{cp.nick} · {cp.code}</div>
                <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{rel.relationship_type} · Your role: {rel.my_role}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <StatusBadge status={rel.status} />
                <div style={{ fontSize: 9, color: "var(--muted2)" }}>{new Date(rel.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Advances Tab ──
function AdvancesTab() {
  const [advances, setAdvances] = useState<api.MerchantAdvance[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rels, setRels] = useState<api.MerchantRelationship[]>([]);
  const [form, setForm] = useState({ relationship_id: "", title: "", amount: 0, currency: "USDT", due_date: "", note: "" });

  useEffect(() => {
    api.fetchAdvances().then(r => setAdvances(r.advances)).catch(() => {});
    api.fetchRelationships().then(r => setRels(r.relationships.filter(rel => rel.status === "active"))).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      await api.createAdvance(form);
      setShowCreate(false);
      setForm({ relationship_id: "", title: "", amount: 0, currency: "USDT", due_date: "", note: "" });
      api.fetchAdvances().then(r => setAdvances(r.advances));
    } catch (e: any) { alert(e.message); }
  };

  const handleSend = async (dealId: string) => {
    const amount = prompt("Amount to send:");
    if (!amount) return;
    try {
      await api.sendPrincipal(dealId, { amount: parseFloat(amount) });
      api.fetchAdvances().then(r => setAdvances(r.advances));
    } catch (e: any) { alert(e.message); }
  };

  const handleReturn = async (dealId: string) => {
    const amount = prompt("Amount returned:");
    if (!amount) return;
    try {
      await api.returnPrincipal(dealId, { amount: parseFloat(amount) });
      api.fetchAdvances().then(r => setAdvances(r.advances));
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <SectionTitle action={<button className="btn primary" onClick={() => setShowCreate(true)} style={{ fontSize: 11, padding: "6px 14px" }}>+ New Advance</button>}>
        Temporary Advances — Principal Only
      </SectionTitle>

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FieldRow label="Connection">
              <select className="inputBox" value={form.relationship_id} onChange={e => setForm(f => ({ ...f, relationship_id: e.target.value }))}>
                <option value="">Select...</option>
                {rels.map(r => <option key={r.id} value={r.id}>{r.a_display_name} ↔ {r.b_display_name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Title"><input className="inputBox" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="USDT advance to X" /></FieldRow>
            <FieldRow label="Amount"><input className="inputBox" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} /></FieldRow>
            <FieldRow label="Currency">
              <select className="inputBox" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>USDT</option><option>QAR</option><option>USD</option>
              </select>
            </FieldRow>
            <FieldRow label="Due Date"><input className="inputBox" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></FieldRow>
            <FieldRow label="Note"><input className="inputBox" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></FieldRow>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={handleCreate} disabled={!form.title || !form.amount || !form.relationship_id}>Create</button>
          </div>
        </Card>
      )}

      {advances.length === 0 && !showCreate && <Empty text="No advances yet" />}
      {advances.map(a => (
        <Card key={a.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{a.title}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {a.currency} {fmt(a.amount)} · {a.due_date ? `Due: ${a.due_date}` : "No due date"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, fontSize: 10 }}>
                <div><span style={{ color: "var(--muted)" }}>Sent:</span> <strong style={{ color: "var(--text)" }}>{fmt(a.principal_sent)}</strong></div>
                <div><span style={{ color: "var(--muted)" }}>Returned:</span> <strong style={{ color: "var(--good)" }}>{fmt(a.principal_returned)}</strong></div>
                <div><span style={{ color: "var(--muted)" }}>Outstanding:</span> <strong style={{ color: a.outstanding_principal > 0 ? "var(--warn)" : "var(--good)" }}>{fmt(a.outstanding_principal)}</strong></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge status={a.status} />
              {["draft", "active"].includes(a.status) && (
                <>
                  <button className="btn primary" onClick={() => handleSend(a.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Send</button>
                  <button className="btn secondary" onClick={() => handleReturn(a.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Return</button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Sales (Merchant Purchases) Tab ──
function SalesTab() {
  const [purchases, setPurchases] = useState<api.MerchantDeal[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rels, setRels] = useState<api.MerchantRelationship[]>([]);
  const [form, setForm] = useState({ relationship_id: "", title: "", usdt_qty: 0, sale_rate: 0, cost_basis: 0, currency: "QAR", due_date: "" });

  useEffect(() => {
    api.fetchPurchases().then(r => setPurchases(r.purchases)).catch(() => {});
    api.fetchRelationships().then(r => setRels(r.relationships.filter(rel => rel.status === "active"))).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      await api.createPurchase({ ...form, cost_basis: form.cost_basis || undefined, due_date: form.due_date || undefined });
      setShowCreate(false);
      api.fetchPurchases().then(r => setPurchases(r.purchases));
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <SectionTitle action={<button className="btn primary" onClick={() => setShowCreate(true)} style={{ fontSize: 11, padding: "6px 14px" }}>+ New Sale</button>}>
        Merchant Purchases — USDT Sales to Merchants
      </SectionTitle>

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FieldRow label="Connection">
              <select className="inputBox" value={form.relationship_id} onChange={e => setForm(f => ({ ...f, relationship_id: e.target.value }))}>
                <option value="">Select...</option>
                {rels.map(r => <option key={r.id} value={r.id}>{r.a_display_name} ↔ {r.b_display_name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Title"><input className="inputBox" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="USDT sale" /></FieldRow>
            <FieldRow label="USDT Qty"><input className="inputBox" type="number" value={form.usdt_qty} onChange={e => setForm(f => ({ ...f, usdt_qty: +e.target.value }))} /></FieldRow>
            <FieldRow label="Sale Rate (per USDT)"><input className="inputBox" type="number" step="0.01" value={form.sale_rate} onChange={e => setForm(f => ({ ...f, sale_rate: +e.target.value }))} /></FieldRow>
            <FieldRow label="Cost Basis (optional)"><input className="inputBox" type="number" value={form.cost_basis} onChange={e => setForm(f => ({ ...f, cost_basis: +e.target.value }))} /></FieldRow>
            <FieldRow label="Due Date"><input className="inputBox" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></FieldRow>
          </div>
          {form.usdt_qty > 0 && form.sale_rate > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
              Sale Proceeds: <strong style={{ color: "var(--text)" }}>{fmt(form.usdt_qty * form.sale_rate)} {form.currency}</strong>
              {form.cost_basis > 0 && <> · Margin: <strong style={{ color: "var(--good)" }}>{fmt(form.usdt_qty * form.sale_rate - form.cost_basis)}</strong></>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={handleCreate} disabled={!form.title || !form.usdt_qty || !form.sale_rate || !form.relationship_id}>Create</button>
          </div>
        </Card>
      )}

      {purchases.length === 0 && !showCreate && <Empty text="No merchant sales yet" />}
      {purchases.map(p => {
        const meta = JSON.parse(p.metadata || "{}");
        return (
          <Card key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{p.title}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>
                  {meta.usdt_qty} USDT @ {meta.sale_rate} = {fmt(meta.sale_proceeds || p.amount)} {p.currency}
                  {meta.sale_margin != null && <> · Margin: <span style={{ color: meta.sale_margin >= 0 ? "var(--good)" : "#ef4444" }}>{fmt(meta.sale_margin)}</span></>}
                </div>
              </div>
              <StatusBadge status={p.status} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Profit-Share Tab ──
function ProfitShareTab() {
  const [deals, setDeals] = useState<api.ProfitShareDeal[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rels, setRels] = useState<api.MerchantRelationship[]>([]);
  const [form, setForm] = useState({ relationship_id: "", title: "", capital_amount: 0, currency: "USDT", owner_ratio: 0.6, operator_ratio: 0.4, loss_policy: "operator_bears_all", due_date: "" });

  useEffect(() => {
    api.fetchProfitShareDeals().then(r => setDeals(r.deals)).catch(() => {});
    api.fetchRelationships().then(r => setRels(r.relationships.filter(rel => rel.status === "active"))).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      await api.createProfitShareDeal({ ...form, due_date: form.due_date || undefined });
      setShowCreate(false);
      api.fetchProfitShareDeals().then(r => setDeals(r.deals));
    } catch (e: any) { alert(e.message); }
  };

  const handleAllocate = async (dealId: string) => {
    const gross = prompt("Gross Proceeds:"); if (!gross) return;
    const cost = prompt("Cost Basis:"); if (!cost) return;
    try {
      const result = await api.submitProfitAllocation(dealId, { gross_proceeds: +gross, cost_basis: +cost });
      alert(`Allocation submitted. Approval ID: ${result.approval_id}`);
      api.fetchProfitShareDeals().then(r => setDeals(r.deals));
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <SectionTitle action={<button className="btn primary" onClick={() => setShowCreate(true)} style={{ fontSize: 11, padding: "6px 14px" }}>+ New Deal</button>}>
        Deal-Specific Profit Share
      </SectionTitle>

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FieldRow label="Connection">
              <select className="inputBox" value={form.relationship_id} onChange={e => setForm(f => ({ ...f, relationship_id: e.target.value }))}>
                <option value="">Select...</option>
                {rels.map(r => <option key={r.id} value={r.id}>{r.a_display_name} ↔ {r.b_display_name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Title"><input className="inputBox" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FieldRow>
            <FieldRow label="Capital Amount"><input className="inputBox" type="number" value={form.capital_amount} onChange={e => setForm(f => ({ ...f, capital_amount: +e.target.value }))} /></FieldRow>
            <FieldRow label="Currency">
              <select className="inputBox" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>USDT</option><option>QAR</option><option>USD</option>
              </select>
            </FieldRow>
            <FieldRow label="Owner Ratio"><input className="inputBox" type="number" step="0.05" min="0" max="1" value={form.owner_ratio} onChange={e => setForm(f => ({ ...f, owner_ratio: +e.target.value, operator_ratio: 1 - +e.target.value }))} /></FieldRow>
            <FieldRow label="Operator Ratio"><input className="inputBox" type="number" value={form.operator_ratio} disabled /></FieldRow>
            <FieldRow label="Loss Policy">
              <select className="inputBox" value={form.loss_policy} onChange={e => setForm(f => ({ ...f, loss_policy: e.target.value }))}>
                <option value="operator_bears_all">Operator bears all loss</option>
                <option value="shared_ratio">Loss shared by ratio</option>
                <option value="capped_principal">Loss capped to principal</option>
                <option value="no_profit_until_recovered">No profit until recovered</option>
              </select>
            </FieldRow>
            <FieldRow label="Due Date"><input className="inputBox" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></FieldRow>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={handleCreate} disabled={!form.title || !form.capital_amount || !form.relationship_id}>Create</button>
          </div>
        </Card>
      )}

      {deals.length === 0 && !showCreate && <Empty text="No profit-share deals yet" />}
      {deals.map(d => {
        const meta = JSON.parse(d.metadata || "{}");
        const latestAlloc = d.allocations[0];
        return (
          <Card key={d.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{d.title}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>
                  Capital: {d.currency} {fmt(d.amount)} · Owner: {(meta.owner_ratio * 100).toFixed(0)}% / Operator: {(meta.operator_ratio * 100).toFixed(0)}%
                </div>
                {latestAlloc && (
                  <div style={{ marginTop: 6, fontSize: 10, background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 8 }}>
                    <div>Net Profit: <strong style={{ color: latestAlloc.net_deal_profit >= 0 ? "var(--good)" : "#ef4444" }}>{fmt(latestAlloc.net_deal_profit)}</strong></div>
                    <div>Owner Share: <strong>{fmt(latestAlloc.owner_share)}</strong> · Operator Share: <strong>{fmt(latestAlloc.operator_share)}</strong></div>
                    <StatusBadge status={latestAlloc.status} />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <StatusBadge status={d.status} />
                {["active", "due"].includes(d.status) && (
                  <button className="btn primary" onClick={() => handleAllocate(d.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Allocate Profit</button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Capital Pools Tab ──
function PoolsTab() {
  const [pools, setPools] = useState<api.CapitalPool[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rels, setRels] = useState<api.MerchantRelationship[]>([]);
  const [form, setForm] = useState({ relationship_id: "", operator_id: "", initial_capital: 0, currency: "USDT", profit_split_owner: 0.6, profit_split_operator: 0.4, minimum_reserve: 0, payout_cycle: "monthly", start_date: "" });

  useEffect(() => {
    api.fetchPools().then(r => setPools(r.pools)).catch(() => {});
    api.fetchRelationships().then(r => setRels(r.relationships.filter(rel => rel.status === "active"))).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      await api.createPool({ ...form, start_date: form.start_date || undefined });
      setShowCreate(false);
      api.fetchPools().then(r => setPools(r.pools));
    } catch (e: any) { alert(e.message); }
  };

  const handleClosePeriod = async (poolId: string) => {
    const label = prompt("Period label (e.g. 2025-03):");
    if (!label) return;
    const profit = prompt("Realized profit for period:");
    if (!profit) return;
    try {
      const result = await api.closePeriod(poolId, { period_label: label, realized_profit: +profit });
      alert(`Period closed. Distributable: ${fmt(result.distributable_profit)}, Owner: ${fmt(result.owner_payout)}, Operator: ${fmt(result.operator_payout)}`);
      api.fetchPools().then(r => setPools(r.pools));
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <SectionTitle action={<button className="btn primary" onClick={() => setShowCreate(true)} style={{ fontSize: 11, padding: "6px 14px" }}>+ New Pool</button>}>
        Managed Capital Pools
      </SectionTitle>

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FieldRow label="Connection">
              <select className="inputBox" value={form.relationship_id} onChange={e => setForm(f => ({ ...f, relationship_id: e.target.value }))}>
                <option value="">Select...</option>
                {rels.map(r => <option key={r.id} value={r.id}>{r.a_display_name} ↔ {r.b_display_name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Operator Merchant ID"><input className="inputBox" value={form.operator_id} onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))} placeholder="merchant profile id" /></FieldRow>
            <FieldRow label="Initial Capital"><input className="inputBox" type="number" value={form.initial_capital} onChange={e => setForm(f => ({ ...f, initial_capital: +e.target.value }))} /></FieldRow>
            <FieldRow label="Currency">
              <select className="inputBox" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>USDT</option><option>QAR</option><option>USD</option>
              </select>
            </FieldRow>
            <FieldRow label="Owner Split"><input className="inputBox" type="number" step="0.05" min="0" max="1" value={form.profit_split_owner} onChange={e => setForm(f => ({ ...f, profit_split_owner: +e.target.value, profit_split_operator: 1 - +e.target.value }))} /></FieldRow>
            <FieldRow label="Operator Split"><input className="inputBox" type="number" value={form.profit_split_operator} disabled /></FieldRow>
            <FieldRow label="Minimum Reserve"><input className="inputBox" type="number" value={form.minimum_reserve} onChange={e => setForm(f => ({ ...f, minimum_reserve: +e.target.value }))} /></FieldRow>
            <FieldRow label="Start Date"><input className="inputBox" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></FieldRow>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={handleCreate} disabled={!form.initial_capital || !form.relationship_id || !form.operator_id}>Create</button>
          </div>
        </Card>
      )}

      {pools.length === 0 && !showCreate && <Empty text="No capital pools yet" />}
      {pools.map(p => (
        <Card key={p.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{p.currency} Capital Pool</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6, fontSize: 10 }}>
                <div><span style={{ color: "var(--muted)" }}>Current Capital:</span> <strong style={{ color: "var(--text)" }}>{fmt(p.current_capital)}</strong></div>
                <div><span style={{ color: "var(--muted)" }}>Initial:</span> {fmt(p.initial_capital)}</div>
                <div><span style={{ color: "var(--muted)" }}>Min Reserve:</span> {fmt(p.minimum_reserve)}</div>
                <div><span style={{ color: "var(--muted)" }}>Loss Carry:</span> <strong style={{ color: p.loss_carry_forward > 0 ? "#ef4444" : "var(--good)" }}>{fmt(p.loss_carry_forward)}</strong></div>
                <div><span style={{ color: "var(--muted)" }}>HWM:</span> {fmt(p.high_water_mark)}</div>
                <div><span style={{ color: "var(--muted)" }}>Split:</span> {(p.profit_split_owner * 100).toFixed(0)}/{(p.profit_split_operator * 100).toFixed(0)}</div>
              </div>
              {p.periods.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
                  Latest period: {p.periods[0].period_label} · Profit: {fmt(p.periods[0].distributable_profit)} · <StatusBadge status={p.periods[0].status} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge status={p.status} />
              {p.status === "active" && (
                <button className="btn primary" onClick={() => handleClosePeriod(p.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Close Period</button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Settlements Tab (all deal types) ──
function SettlementsTab() {
  const [deals, setDeals] = useState<api.MerchantDeal[]>([]);

  useEffect(() => {
    api.fetchDeals().then(r => setDeals(r.deals)).catch(() => {});
  }, []);

  const handleSettle = async (dealId: string) => {
    const amount = prompt("Settlement amount:");
    if (!amount) return;
    try {
      await api.submitSettlement(dealId, { paid_amount: parseFloat(amount), paid_date: new Date().toISOString().slice(0, 10) });
      api.fetchDeals().then(r => setDeals(r.deals));
    } catch (e: any) { alert(e.message); }
  };

  const activeDealTypes = ["active", "due", "overdue"];
  const settleableDeals = deals.filter(d => activeDealTypes.includes(d.status));

  return (
    <div>
      <SectionTitle>Settlement Center</SectionTitle>
      <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
        Waterfall: Overdue fees → Overdue profit → Oldest principal → Current profit → Current principal
      </p>

      {settleableDeals.length === 0 && <Empty text="No deals requiring settlement" />}
      {settleableDeals.map(d => (
        <Card key={d.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{d.title}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{d.deal_type} · {d.currency} {fmt(d.amount)}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={d.status} />
              <button className="btn primary" onClick={() => handleSettle(d.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Submit Settlement</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Approvals Tab ──
function ApprovalsTab({ onAction }: { onAction: () => void }) {
  const [inbox, setInbox] = useState<api.MerchantApproval[]>([]);
  const [sent, setSent] = useState<api.MerchantApproval[]>([]);
  const [view, setView] = useState<"inbox" | "sent">("inbox");

  useEffect(() => { api.fetchApprovalInbox().then(r => setInbox(r.approvals)).catch(() => {}); }, []);
  useEffect(() => { api.fetchSentApprovals().then(r => setSent(r.approvals)).catch(() => {}); }, []);

  const handleApprove = async (id: string) => {
    const note = prompt("Approval note (optional):");
    try { await api.approveRequest(id, note || undefined); onAction(); api.fetchApprovalInbox().then(r => setInbox(r.approvals)); } catch (e: any) { alert(e.message); }
  };
  const handleReject = async (id: string) => {
    const note = prompt("Rejection reason:");
    try { await api.rejectRequest(id, note || undefined); api.fetchApprovalInbox().then(r => setInbox(r.approvals)); } catch (e: any) { alert(e.message); }
  };

  const list = view === "inbox" ? inbox : sent;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${view === "inbox" ? "primary" : "secondary"}`} onClick={() => setView("inbox")} style={{ fontSize: 11 }}>
          Inbox ({inbox.filter(a => a.status === "pending").length})
        </button>
        <button className={`btn ${view === "sent" ? "primary" : "secondary"}`} onClick={() => setView("sent")} style={{ fontSize: 11 }}>Sent</button>
      </div>
      {list.length === 0 && <Empty text="No approval requests" />}
      {list.map(a => (
        <Card key={a.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{a.type.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.submitter_name || a.submitted_by_merchant_id} · {new Date(a.submitted_at).toLocaleDateString()}</div>
              {a.resolution_note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic", marginTop: 2 }}>{a.resolution_note}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={a.status} />
              {view === "inbox" && a.status === "pending" && (
                <>
                  <button className="btn primary" onClick={() => handleApprove(a.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Approve</button>
                  <button className="btn secondary" onClick={() => handleReject(a.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Reject</button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Notifications Tab ──
function NotificationsTab() {
  const [notifs, setNotifs] = useState<api.MerchantNotification[]>([]);
  useEffect(() => { api.fetchNotifications().then(r => setNotifs(r.notifications)).catch(() => {}); }, []);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: 1 } : x));
  };
  const markAll = async () => {
    await api.markAllRead();
    setNotifs(n => n.map(x => ({ ...x, read: 1 })));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn secondary" onClick={markAll} style={{ fontSize: 10 }}>Mark all read</button>
      </div>
      {notifs.length === 0 && <Empty text="No notifications" />}
      {notifs.map(n => (
        <div key={n.id} onClick={() => !n.read && markRead(n.id)} style={{
          background: n.read ? "var(--panel)" : "rgba(59,130,246,0.06)",
          border: `1px solid ${n.read ? "var(--line)" : "rgba(59,130,246,0.2)"}`,
          borderRadius: 8, padding: 12, marginBottom: 6, cursor: n.read ? "default" : "pointer",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{n.title}</span>
            <span style={{ color: "var(--muted2)" }}>{new Date(n.created_at).toLocaleString()}</span>
          </div>
          {n.body && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{n.body}</div>}
          <span style={{ fontSize: 9, color: "var(--muted2)", textTransform: "uppercase" }}>{n.type}</span>
        </div>
      ))}
    </div>
  );
}

// ── Settings Tab ──
function MerchantSettingsTab({ profile, onSave }: { profile: api.MerchantProfile; onSave: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio || "");
  const [discoverability, setDiscoverability] = useState(profile.discoverability);
  const [region, setRegion] = useState(profile.region || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await api.updateProfile({ display_name: displayName, bio, discoverability, region }); onSave(); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Merchant ID"><div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)", fontFamily: "monospace" }}>{profile.merchant_id}</div></FieldRow>
        <FieldRow label="Nickname (immutable)"><div style={{ fontSize: 13, color: "var(--text)" }}>@{profile.nickname}</div></FieldRow>
        <FieldRow label="Display Name"><input className="inputBox" value={displayName} onChange={e => setDisplayName(e.target.value)} /></FieldRow>
        <FieldRow label="Region"><input className="inputBox" value={region} onChange={e => setRegion(e.target.value)} /></FieldRow>
        <FieldRow label="Discoverability">
          <select className="inputBox" value={discoverability} onChange={e => setDiscoverability(e.target.value)}>
            <option value="public">Public</option><option value="merchant_id_only">Merchant ID only</option><option value="hidden">Hidden</option>
          </select>
        </FieldRow>
        <FieldRow label="Bio"><textarea className="inputBox" value={bio} onChange={e => setBio(e.target.value)} rows={3} /></FieldRow>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ── Audit Tab ──
function AuditTab() {
  const [logs, setLogs] = useState<api.AuditLog[]>([]);
  useEffect(() => { api.fetchMyActivity().then(r => setLogs(r.logs)).catch(() => {}); }, []);

  return (
    <div>
      {logs.length === 0 && <Empty text="No activity yet" />}
      {logs.map(log => (
        <Card key={log.id}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>{log.action} {log.entity_type}</span>
            <span style={{ color: "var(--muted2)", fontSize: 9 }}>{new Date(log.created_at).toLocaleString()}</span>
          </div>
          {log.note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic", marginTop: 2 }}>{log.note}</div>}
        </Card>
      ))}
    </div>
  );
}

// ── Relationship Workspace ──
function RelationshipWorkspace({ relId, onBack }: { relId: string; onBack: () => void }) {
  const [rel, setRel] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [messages, setMessages] = useState<api.MerchantMessage[]>([]);
  const [comments, setComments] = useState<api.MerchantComment[]>([]);
  const [wsTab, setWsTab] = useState<"overview" | "messages" | "comments" | "terms" | "audit">("overview");
  const [msgInput, setMsgInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [auditLogs, setAuditLogs] = useState<api.AuditLog[]>([]);
  const [terms, setTerms] = useState<api.RelationshipTerms | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.fetchRelationship(relId);
      setRel(r.relationship); setSummary(r.summary);
      const [m, c, a, t] = await Promise.all([
        api.fetchMessages(relId), api.fetchComments({ relationship_id: relId }),
        api.fetchRelAudit(relId), api.fetchTerms(relId),
      ]);
      setMessages(m.messages); setComments(c.comments);
      setAuditLogs(a.logs); setTerms(t.terms);
    } catch {}
  }, [relId]);

  useEffect(() => { load(); }, [load]);

  const sendMsg = async () => {
    if (!msgInput.trim()) return;
    try { await api.sendMessage(relId, msgInput); setMsgInput(""); load(); } catch {}
  };

  const addComment = async () => {
    if (!commentInput.trim()) return;
    try { await api.postComment({ relationship_id: relId, body: commentInput }); setCommentInput(""); load(); } catch {}
  };

  if (!rel) return <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading...</div>;

  const WS_TABS = [
    { id: "overview", label: "Overview" }, { id: "messages", label: "Inbox" },
    { id: "comments", label: "Comments" }, { id: "terms", label: "Terms" }, { id: "audit", label: "Audit" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>← Back</button>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 16 }}>{rel.a_display_name} ↔ {rel.b_display_name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{rel.relationship_type} · <StatusBadge status={rel.status} /></div>
          </div>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <StatCard label="Deals" value={summary.totalDeals} />
            <StatCard label="Active Exposure" value={`$${fmt(summary.activeExposure || 0)}`} accent="var(--warn)" />
            <StatCard label="Realized P&L" value={`$${fmt(summary.realizedProfit || 0)}`} accent="var(--good)" />
            <StatCard label="Pending Approvals" value={summary.pendingApprovals} accent={summary.pendingApprovals > 0 ? "var(--warn)" : undefined} />
          </div>
        )}
      </Card>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, marginTop: 12, flexWrap: "wrap" }}>
        {WS_TABS.map(t => (
          <button key={t.id} className={`btn ${wsTab === t.id ? "primary" : "secondary"}`} onClick={() => setWsTab(t.id as any)}
            style={{ fontSize: 11, padding: "6px 14px" }}>{t.label}</button>
        ))}
      </div>

      {wsTab === "overview" && (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          <p>Relationship created on {new Date(rel.created_at).toLocaleDateString()}</p>
          {terms && (
            <div style={{ marginTop: 12, fontSize: 11 }}>
              <strong style={{ color: "var(--text)" }}>Terms:</strong> Owner {(terms.default_owner_ratio * 100).toFixed(0)}% / Operator {(terms.default_operator_ratio * 100).toFixed(0)}% · Loss: {terms.loss_policy.replace(/_/g, " ")} · Cycle: {terms.settlement_cycle}
            </div>
          )}
        </div>
      )}

      {wsTab === "messages" && (
        <div>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
            {messages.length === 0 && <Empty text="No messages yet" />}
            {messages.map(m => (
              <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line2)", opacity: m.message_type === "system" ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{m.sender_name || m.sender_merchant_id}</span>
                  <span style={{ color: "var(--muted2)" }}>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: m.message_type === "system" ? "var(--muted)" : "var(--text)", marginTop: 4 }}>{m.body}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inputBox" value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder="Type a message..."
              onKeyDown={e => e.key === "Enter" && sendMsg()} style={{ flex: 1 }} />
            <button className="btn primary" onClick={sendMsg} style={{ fontSize: 11 }}>Send</button>
          </div>
        </div>
      )}

      {wsTab === "comments" && (
        <div>
          {comments.length === 0 && <Empty text="No comments yet" />}
          {comments.map(c => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{c.sender_name || c.sender_merchant_id}</span>
                <span style={{ color: "var(--muted2)" }}>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginTop: 2 }}>{c.comment_type}</div>
              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>{c.body}</div>
            </Card>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="inputBox" value={commentInput} onChange={e => setCommentInput(e.target.value)} placeholder="Add comment..."
              onKeyDown={e => e.key === "Enter" && addComment()} style={{ flex: 1 }} />
            <button className="btn primary" onClick={addComment} style={{ fontSize: 11 }}>Post</button>
          </div>
        </div>
      )}

      {wsTab === "terms" && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {terms ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>Owner Ratio: <strong style={{ color: "var(--text)" }}>{(terms.default_owner_ratio * 100).toFixed(0)}%</strong></div>
              <div>Operator Ratio: <strong style={{ color: "var(--text)" }}>{(terms.default_operator_ratio * 100).toFixed(0)}%</strong></div>
              <div>Loss Policy: <strong style={{ color: "var(--text)" }}>{terms.loss_policy.replace(/_/g, " ")}</strong></div>
              <div>Settlement Cycle: <strong style={{ color: "var(--text)" }}>{terms.settlement_cycle}</strong></div>
              <div>Advances: <strong style={{ color: "var(--text)" }}>{terms.advances_enabled ? "✓" : "✗"}</strong></div>
              <div>Purchases: <strong style={{ color: "var(--text)" }}>{terms.purchases_enabled ? "✓" : "✗"}</strong></div>
              <div>Profit-Share: <strong style={{ color: "var(--text)" }}>{terms.profit_share_enabled ? "✓" : "✗"}</strong></div>
              <div>Capital Pools: <strong style={{ color: "var(--text)" }}>{terms.capital_pools_enabled ? "✓" : "✗"}</strong></div>
            </div>
          ) : (
            <p>No terms configured yet. Terms will be auto-created with defaults when deals are initiated.</p>
          )}
        </div>
      )}

      {wsTab === "audit" && (
        <div>
          {auditLogs.length === 0 && <Empty text="No audit entries" />}
          {auditLogs.map(log => (
            <Card key={log.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{log.action} {log.entity_type}</span>
                <span style={{ color: "var(--muted2)", fontSize: 9 }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
              {log.note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic" }}>{log.note}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function MerchantPage() {
  const { isSignedIn } = useAuth();
  const [profile, setProfile] = useState<api.MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MerchantTab>("overview");
  const [relationships, setRelationships] = useState<api.MerchantRelationship[]>([]);
  const [deals, setDeals] = useState<api.MerchantDeal[]>([]);
  const [advances, setAdvances] = useState<api.MerchantAdvance[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const { profile: p } = await api.fetchMyProfile();
      setProfile(p);
      if (p) {
        const [rels, d, n, adv] = await Promise.all([
          api.fetchRelationships(), api.fetchDeals(), api.unreadCount(), api.fetchAdvances(),
        ]);
        setRelationships(rels.relationships);
        setDeals(d.deals);
        setUnreadCount(n.count);
        setAdvances(adv.advances);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isSignedIn) loadAll(); }, [isSignedIn, loadAll]);

  useEffect(() => {
    if (!profile) return;
    const iv = setInterval(() => {
      api.unreadCount().then(r => setUnreadCount(r.count)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [profile]);

  if (loading) return <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading...</div>;
  if (!profile) return <MerchantOnboarding onCreated={loadAll} />;

  if (selectedRelId) {
    return <RelationshipWorkspace relId={selectedRelId} onBack={() => { setSelectedRelId(null); loadAll(); }} />;
  }

  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{
        display: "flex", gap: 2, overflowX: "auto", marginBottom: 20,
        borderBottom: "1px solid var(--line)", paddingBottom: 8,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? "var(--brand)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--muted)",
              border: "none", borderRadius: 8, padding: "6px 10px",
              fontSize: 10, fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
              display: "flex", alignItems: "center", gap: 3,
            }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "notifications" && unreadCount > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", fontSize: 8, fontWeight: 900, borderRadius: 999, padding: "1px 5px" }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab profile={profile} relationships={relationships} deals={deals} advances={advances} unreadCount={unreadCount} />}
      {tab === "directory" && <DirectoryTab myProfile={profile} onInviteSent={loadAll} />}
      {tab === "invites" && <InvitesTab onAction={loadAll} />}
      {tab === "relationships" && <RelationshipsTab relationships={relationships} onSelect={setSelectedRelId} />}
      {tab === "advances" && <AdvancesTab />}
      {tab === "sales" && <SalesTab />}
      {tab === "profit_share" && <ProfitShareTab />}
      {tab === "pools" && <PoolsTab />}
      {tab === "settlements" && <SettlementsTab />}
      {tab === "approvals" && <ApprovalsTab onAction={loadAll} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "settings" && <MerchantSettingsTab profile={profile} onSave={loadAll} />}
    </div>
  );
}
