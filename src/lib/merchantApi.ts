/**
 * merchantApi.ts — Frontend API client for the Merchant Platform v2
 * Supports: Profiles, Invites, Relationships, Terms, Advances, Purchases,
 * Profit-Share, Capital Pools, Settlements, Comments, Adjustments,
 * Messages, Approvals, Audit, Notifications
 */

const WORKER_BASE = import.meta.env.VITE_WORKER_API_URL || "";

async function getAuthToken(): Promise<string | null> {
  try {
    return (await (window as any).Clerk?.session?.getToken()) || null;
  } catch { return null; }
}

async function mFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Profile ──
export interface MerchantProfile {
  id: string; owner_user_id: string; merchant_id: string; nickname: string;
  display_name: string; merchant_type: string; region: string | null;
  default_currency: string; discoverability: string; bio: string | null;
  status: string; created_at: string; updated_at: string;
}

export const fetchMyProfile = () => mFetch<{ profile: MerchantProfile | null }>("/api/merchant/profile/me");
export const createProfile = (data: {
  nickname: string; display_name: string; merchant_type?: string;
  region?: string; default_currency?: string; discoverability?: string; bio?: string;
}) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile", { method: "POST", body: JSON.stringify(data) });
export const updateProfile = (data: Partial<{
  display_name: string; merchant_type: string; region: string;
  default_currency: string; discoverability: string; bio: string;
}>) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile/me", { method: "PATCH", body: JSON.stringify(data) });
export const fetchProfile = (merchantId: string) =>
  mFetch<{ profile: MerchantProfile }>(`/api/merchant/profile/${merchantId}`);
export const searchMerchants = (q: string) =>
  mFetch<{ results: MerchantProfile[] }>(`/api/merchant/search?q=${encodeURIComponent(q)}`);
export const checkNickname = (nickname: string) =>
  mFetch<{ available: boolean }>(`/api/merchant/check-nickname?nickname=${encodeURIComponent(nickname)}`);

// ── Invites ──
export interface MerchantInvite {
  id: string; from_merchant_id: string; to_merchant_id: string;
  status: string; purpose: string | null; requested_role: string;
  message: string | null; requested_scope: string | null;
  expires_at: string | null; created_at: string; updated_at: string;
  from_display_name?: string; from_nickname?: string; from_merchant_code?: string;
  to_display_name?: string; to_nickname?: string; to_merchant_code?: string;
}

export const sendInvite = (data: {
  to_merchant_id: string; purpose?: string; requested_role?: string;
  message?: string; requested_scope?: string[];
}) => mFetch<{ invite: MerchantInvite }>("/api/merchant/invites", { method: "POST", body: JSON.stringify(data) });
export const fetchInbox = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/inbox");
export const fetchSentInvites = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/sent");
export const acceptInvite = (id: string) => mFetch<{ relationship_id: string }>(`/api/merchant/invites/${id}/accept`, { method: "POST", body: "{}" });
export const rejectInvite = (id: string, reason?: string) => mFetch(`/api/merchant/invites/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
export const withdrawInvite = (id: string) => mFetch(`/api/merchant/invites/${id}/withdraw`, { method: "POST", body: "{}" });

// ── Relationships ──
export interface MerchantRelationship {
  id: string; merchant_a_id: string; merchant_b_id: string;
  relationship_type: string; status: string;
  a_display_name?: string; a_nickname?: string; a_merchant_code?: string;
  b_display_name?: string; b_nickname?: string; b_merchant_code?: string;
  my_role?: string; created_at: string; updated_at: string;
}

export const fetchRelationships = () => mFetch<{ relationships: MerchantRelationship[] }>("/api/merchant/relationships");
export const fetchRelationship = (id: string) => mFetch<{
  relationship: MerchantRelationship; roles: any[]; summary: {
    totalDeals: number; activeExposure: number; realizedProfit: number; pendingApprovals: number;
  };
}>(`/api/merchant/relationships/${id}`);
export const updateRelSettings = (id: string, data: any) =>
  mFetch(`/api/merchant/relationships/${id}/settings`, { method: "PATCH", body: JSON.stringify(data) });
export const suspendRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/suspend`, { method: "POST", body: "{}" });
export const terminateRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/terminate`, { method: "POST", body: "{}" });

// ── Relationship Terms ──
export interface RelationshipTerms {
  id: string; relationship_id: string;
  default_owner_ratio: number; default_operator_ratio: number;
  loss_policy: string; settlement_cycle: string;
  allowed_currencies: string; allowed_deal_classes: string;
  advances_enabled: number; purchases_enabled: number;
  profit_share_enabled: number; capital_pools_enabled: number;
}

export const fetchTerms = (relId: string) =>
  mFetch<{ terms: RelationshipTerms | null }>(`/api/merchant/terms/${relId}`);
export const saveTerms = (relId: string, data: Partial<{
  default_owner_ratio: number; default_operator_ratio: number;
  loss_policy: string; settlement_cycle: string;
  allowed_currencies: string[]; allowed_deal_classes: string[];
  advances_enabled: boolean; purchases_enabled: boolean;
  profit_share_enabled: boolean; capital_pools_enabled: boolean;
}>) => mFetch<{ terms: RelationshipTerms }>(`/api/merchant/terms/${relId}`, { method: "PUT", body: JSON.stringify(data) });

// ── Deals (generic) ──
export interface MerchantDeal {
  id: string; relationship_id: string; deal_type: string; title: string;
  amount: number; currency: string; status: string; metadata: string | null;
  issue_date: string | null; due_date: string | null; close_date: string | null;
  expected_return: number | null; realized_pnl: number | null;
  created_by: string; created_at: string; updated_at: string;
}

export const fetchDeals = (relId?: string) =>
  mFetch<{ deals: MerchantDeal[] }>(`/api/merchant/deals${relId ? `?relationship_id=${relId}` : ""}`);
export const createDeal = (data: {
  relationship_id: string; deal_type: string; title: string; amount: number;
  currency?: string; issue_date?: string; due_date?: string; expected_return?: number;
}) => mFetch<{ deal: MerchantDeal }>("/api/merchant/deals", { method: "POST", body: JSON.stringify(data) });
export const updateDeal = (id: string, data: Partial<MerchantDeal>) =>
  mFetch<{ deal: MerchantDeal }>(`/api/merchant/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const submitSettlement = (dealId: string, data: { paid_amount: number; paid_date: string; variance_note?: string }) =>
  mFetch<{ settlement_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/submit-settlement`, { method: "POST", body: JSON.stringify(data) });
export const recordProfit = (dealId: string, data: {
  period: string; gross_profit: number; net_distributable: number;
  share_a?: number; share_b?: number; note?: string;
}) => mFetch<{ profit_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/record-profit`, { method: "POST", body: JSON.stringify(data) });
export const closeDeal = (dealId: string, data?: { realized_pnl?: number; note?: string }) =>
  mFetch<{ approval_id: string }>(`/api/merchant/deals/${dealId}/close`, { method: "POST", body: JSON.stringify(data || {}) });

// ── Advances ──
export interface MerchantAdvance extends MerchantDeal {
  funding_lines: FundingLine[];
  principal_sent: number;
  principal_returned: number;
  outstanding_principal: number;
}

export interface FundingLine {
  id: string; deal_id: string; line_type: string; amount: number;
  currency: string; usdt_qty: number | null; unit_rate: number | null;
  transfer_reference: string | null; source_wallet: string | null;
  destination_wallet: string | null; creator_merchant_id: string;
  confirmer_merchant_id: string | null; confirmed_at: string | null;
  note: string | null; created_at: string;
}

export const fetchAdvances = (relId?: string) =>
  mFetch<{ advances: MerchantAdvance[] }>(`/api/merchant/advances${relId ? `?relationship_id=${relId}` : ""}`);
export const createAdvance = (data: {
  relationship_id: string; title: string; amount: number; currency?: string;
  due_date?: string; fee_amount?: number; note?: string;
}) => mFetch<{ advance: MerchantDeal }>("/api/merchant/advances", { method: "POST", body: JSON.stringify(data) });
export const sendPrincipal = (dealId: string, data: {
  amount: number; currency?: string; usdt_qty?: number; unit_rate?: number;
  transfer_reference?: string; source_wallet?: string; destination_wallet?: string;
}) => mFetch<{ funding_line_id: string }>(`/api/merchant/advances/${dealId}/send`, { method: "POST", body: JSON.stringify(data) });
export const returnPrincipal = (dealId: string, data: {
  amount: number; currency?: string; transfer_reference?: string;
}) => mFetch<{ funding_line_id: string; outstanding: number }>(`/api/merchant/advances/${dealId}/return`, { method: "POST", body: JSON.stringify(data) });

// ── Purchases (Merchant Sales) ──
export const fetchPurchases = (relId?: string) =>
  mFetch<{ purchases: MerchantDeal[] }>(`/api/merchant/purchases${relId ? `?relationship_id=${relId}` : ""}`);
export const createPurchase = (data: {
  relationship_id: string; title: string; usdt_qty: number; sale_rate: number;
  cost_basis?: number; currency?: string; due_date?: string; payment_method?: string;
}) => mFetch<{ purchase: MerchantDeal }>("/api/merchant/purchases", { method: "POST", body: JSON.stringify(data) });

// ── Profit Share Deals ──
export interface ProfitAllocation {
  id: string; deal_id: string; relationship_id: string;
  gross_proceeds: number; cost_basis: number; network_fees: number;
  transfer_fees: number; deal_expenses: number; approved_corrections: number;
  net_deal_profit: number; owner_ratio: number; operator_ratio: number;
  owner_share: number; operator_share: number;
  status: string; submitted_by: string; approved_by: string | null;
  created_at: string; updated_at: string;
}

export interface ProfitShareDeal extends MerchantDeal {
  allocations: ProfitAllocation[];
  funding_lines: FundingLine[];
}

export const fetchProfitShareDeals = (relId?: string) =>
  mFetch<{ deals: ProfitShareDeal[] }>(`/api/merchant/profit-share${relId ? `?relationship_id=${relId}` : ""}`);
export const createProfitShareDeal = (data: {
  relationship_id: string; title: string; capital_amount: number; currency?: string;
  owner_ratio: number; operator_ratio: number; loss_policy?: string;
  principal_guarantee?: boolean; due_date?: string;
}) => mFetch<{ deal: MerchantDeal }>("/api/merchant/profit-share", { method: "POST", body: JSON.stringify(data) });
export const submitProfitAllocation = (dealId: string, data: {
  gross_proceeds: number; cost_basis: number; network_fees?: number;
  transfer_fees?: number; deal_expenses?: number; approved_corrections?: number;
}) => mFetch<{ allocation_id: string; approval_id: string }>(`/api/merchant/profit-share/${dealId}/allocate`, { method: "POST", body: JSON.stringify(data) });

// ── Capital Pools ──
export interface CapitalPool {
  id: string; relationship_id: string; capital_owner_id: string; operator_id: string;
  initial_capital: number; current_capital: number; minimum_reserve: number;
  currency: string; profit_split_owner: number; profit_split_operator: number;
  loss_carry_forward: number; high_water_mark: number;
  payout_cycle: string; settlement_cutoff_day: number;
  status: string; start_date: string; close_date: string | null;
  created_at: string; updated_at: string;
  periods: PoolPeriod[];
}

export interface PoolPeriod {
  id: string; pool_id: string; period_label: string;
  opening_capital: number; top_ups: number; withdrawals: number; closing_capital: number;
  realized_profit: number; carried_loss_recovered: number; pool_fees: number;
  distributable_profit: number; owner_payout: number; operator_payout: number;
  loss_carry_forward: number; effective_yield: number | null;
  status: string; locked_at: string | null; settled_at: string | null;
  created_at: string;
}

export const fetchPools = (relId?: string) =>
  mFetch<{ pools: CapitalPool[] }>(`/api/merchant/pools${relId ? `?relationship_id=${relId}` : ""}`);
export const createPool = (data: {
  relationship_id: string; operator_id: string; initial_capital: number;
  currency?: string; profit_split_owner?: number; profit_split_operator?: number;
  minimum_reserve?: number; payout_cycle?: string; settlement_cutoff_day?: number;
  start_date?: string;
}) => mFetch<{ pool: CapitalPool }>("/api/merchant/pools", { method: "POST", body: JSON.stringify(data) });
export const topUpPool = (poolId: string, amount: number) =>
  mFetch<{ ok: boolean }>(`/api/merchant/pools/${poolId}/top-up`, { method: "POST", body: JSON.stringify({ amount }) });
export const withdrawPool = (poolId: string, amount: number) =>
  mFetch<{ ok: boolean }>(`/api/merchant/pools/${poolId}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) });
export const closePeriod = (poolId: string, data: {
  period_label: string; realized_profit: number; pool_fees?: number;
}) => mFetch<{ period_id: string; distributable_profit: number; owner_payout: number; operator_payout: number }>(
  `/api/merchant/pools/${poolId}/close-period`, { method: "POST", body: JSON.stringify(data) });

// ── Comments ──
export interface MerchantComment {
  id: string; deal_id: string | null; relationship_id: string;
  parent_id: string | null; sender_merchant_id: string; sender_user_id: string;
  comment_type: string; body: string; sender_name?: string; sender_nickname?: string;
  created_at: string; deleted_at: string | null;
}

export const fetchComments = (params: { deal_id?: string; relationship_id?: string }) => {
  const qs = new URLSearchParams(params as any).toString();
  return mFetch<{ comments: MerchantComment[] }>(`/api/merchant/comments?${qs}`);
};
export const postComment = (data: {
  deal_id?: string; relationship_id: string; parent_id?: string;
  comment_type?: string; body: string;
}) => mFetch<{ comment_id: string }>("/api/merchant/comments", { method: "POST", body: JSON.stringify(data) });

// ── Adjustments / Corrections ──
export interface MerchantAdjustment {
  id: string; deal_id: string; relationship_id: string;
  requester_merchant_id: string; requester_name?: string;
  field_challenged: string; old_value: string | null;
  proposed_value: string; reason: string; evidence_url: string | null;
  status: string; approver_merchant_id: string | null;
  approved_adjustment_value: string | null;
  resolved_at: string | null; created_at: string;
}

export const fetchAdjustments = (dealId: string) =>
  mFetch<{ adjustments: MerchantAdjustment[] }>(`/api/merchant/adjustments?deal_id=${dealId}`);
export const createAdjustment = (data: {
  deal_id: string; relationship_id: string; field_challenged: string;
  old_value?: string; proposed_value: string; reason: string; evidence_url?: string;
}) => mFetch<{ adjustment_id: string; approval_id: string }>("/api/merchant/adjustments", { method: "POST", body: JSON.stringify(data) });
export const resolveAdjustment = (id: string, data: { status: 'approved' | 'rejected'; approved_adjustment_value?: string }) =>
  mFetch<{ ok: boolean }>(`/api/merchant/adjustments/${id}/resolve`, { method: "POST", body: JSON.stringify(data) });

// ── Messages ──
export interface MerchantMessage {
  id: string; relationship_id: string; sender_user_id: string;
  sender_merchant_id: string; message_type: string; body: string;
  sender_name?: string; sender_nickname?: string;
  read_by: string | null; created_at: string;
}

export const fetchMessages = (relId: string, limit = 50, offset = 0) =>
  mFetch<{ messages: MerchantMessage[] }>(`/api/merchant/messages/${relId}/messages?limit=${limit}&offset=${offset}`);
export const sendMessage = (relId: string, body: string) =>
  mFetch<{ message: MerchantMessage }>(`/api/merchant/messages/${relId}/messages`, { method: "POST", body: JSON.stringify({ body }) });

// ── Approvals ──
export interface MerchantApproval {
  id: string; relationship_id: string; type: string;
  target_entity_type: string | null; target_entity_id: string | null;
  proposed_payload: string | null; status: string;
  submitted_by_user_id: string; submitted_by_merchant_id: string;
  submitter_name?: string; submitter_nickname?: string;
  resolution_note: string | null; submitted_at: string; resolved_at: string | null;
}

export const fetchApprovalInbox = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/inbox");
export const fetchSentApprovals = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/sent");
export const approveRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
export const rejectRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });

// ── Audit ──
export interface AuditLog {
  id: string; actor_user_id: string; actor_merchant_id: string | null;
  entity_type: string; entity_id: string; action: string;
  before_state: string | null; after_state: string | null;
  note: string | null; actor_name?: string; created_at: string;
}

export const fetchRelAudit = (relId: string) =>
  mFetch<{ logs: AuditLog[] }>(`/api/merchant/audit/relationship/${relId}`);
export const fetchMyActivity = () =>
  mFetch<{ logs: AuditLog[] }>("/api/merchant/audit/activity");

// ── Notifications ──
export interface MerchantNotification {
  id: string; user_id: string; merchant_id: string | null;
  category: string; title: string; body: string | null;
  link_type: string | null; link_id: string | null;
  read_at: string | null; created_at: string;
}

export const fetchNotifications = (limit = 50) =>
  mFetch<{ notifications: MerchantNotification[] }>(`/api/merchant/notifications?limit=${limit}`);
export const fetchUnreadCount = () =>
  mFetch<{ unread: number }>("/api/merchant/notifications/count");
export const markNotificationRead = (id: string) =>
  mFetch(`/api/merchant/notifications/${id}/read`, { method: "POST", body: "{}" });
export const markAllRead = () =>
  mFetch("/api/merchant/notifications/read-all", { method: "POST", body: "{}" });
