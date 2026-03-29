/**
 * merchantApi.ts — Frontend API client for the Merchant Platform v2
 * 
 * NOTE: The Merchant Platform backend routes were previously hosted on Cloudflare Workers.
 * This module is preserved for UI compatibility but the backend needs to be migrated
 * to Supabase Edge Functions or tables before merchant features will work.
 * For now, all calls will fail gracefully.
 */

import { supabase } from "@/integrations/supabase/client";

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// Merchant backend is not yet migrated — stub all calls
async function mFetch<T>(_path: string, _opts?: RequestInit): Promise<T> {
  throw new Error("Merchant platform backend not yet migrated to Supabase. This feature is temporarily unavailable.");
}

// ── Profile ──
export interface MerchantProfile {
  id: string; owner_user_id: string; merchant_id: string; nickname: string;
  display_name: string; merchant_type: string; region: string | null;
  default_currency: string; discoverability: string; bio: string | null;
  status: string; created_at: string; updated_at: string;
}

export const fetchMyProfile = () => mFetch<{ profile: MerchantProfile | null }>("/api/merchant/profile/me");
export const createProfile = (data: any) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile", { method: "POST", body: JSON.stringify(data) });
export const updateProfile = (data: any) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile/me", { method: "PATCH", body: JSON.stringify(data) });
export const fetchProfile = (merchantId: string) => mFetch<{ profile: MerchantProfile }>(`/api/merchant/profile/${merchantId}`);
export const searchMerchants = (q: string) => mFetch<{ results: MerchantProfile[] }>(`/api/merchant/search?q=${encodeURIComponent(q)}`);
export const checkNickname = (nickname: string) => mFetch<{ available: boolean }>(`/api/merchant/check-nickname?nickname=${encodeURIComponent(nickname)}`);

// ── Invites ──
export interface MerchantInvite {
  id: string; from_merchant_id: string; to_merchant_id: string;
  status: string; purpose: string | null; requested_role: string;
  message: string | null; requested_scope: string | null;
  expires_at: string | null; created_at: string; updated_at: string;
  from_display_name?: string; from_nickname?: string; from_merchant_code?: string;
  to_display_name?: string; to_nickname?: string; to_merchant_code?: string;
}

export const sendInvite = (data: any) => mFetch<{ invite: MerchantInvite }>("/stub");
export const fetchInbox = () => mFetch<{ invites: MerchantInvite[] }>("/stub");
export const fetchSentInvites = () => mFetch<{ invites: MerchantInvite[] }>("/stub");
export const acceptInvite = (id: string) => mFetch<{ relationship_id: string }>(`/stub`);
export const rejectInvite = (id: string, reason?: string) => mFetch(`/stub`);
export const withdrawInvite = (id: string) => mFetch(`/stub`);

// ── Relationships ──
export interface MerchantRelationship {
  id: string; merchant_a_id: string; merchant_b_id: string;
  relationship_type: string; status: string;
  a_display_name?: string; a_nickname?: string; a_merchant_code?: string;
  b_display_name?: string; b_nickname?: string; b_merchant_code?: string;
  my_role?: string; created_at: string; updated_at: string;
}

export const fetchRelationships = () => mFetch<{ relationships: MerchantRelationship[] }>("/stub");
export const fetchRelationship = (id: string) => mFetch<any>(`/stub`);
export const updateRelSettings = (id: string, data: any) => mFetch(`/stub`);
export const suspendRelationship = (id: string) => mFetch(`/stub`);
export const terminateRelationship = (id: string) => mFetch(`/stub`);

// ── Relationship Terms ──
export interface RelationshipTerms {
  id: string; relationship_id: string;
  default_owner_ratio: number; default_operator_ratio: number;
  loss_policy: string; settlement_cycle: string;
  allowed_currencies: string; allowed_deal_classes: string;
  advances_enabled: number; purchases_enabled: number;
  profit_share_enabled: number; capital_pools_enabled: number;
}

export const fetchTerms = (relId: string) => mFetch<{ terms: RelationshipTerms | null }>(`/stub`);
export const saveTerms = (relId: string, data: any) => mFetch<{ terms: RelationshipTerms }>(`/stub`);

// ── Deals ──
export interface MerchantDeal {
  id: string; relationship_id: string; deal_type: string; title: string;
  amount: number; currency: string; status: string; metadata: string | null;
  issue_date: string | null; due_date: string | null; close_date: string | null;
  expected_return: number | null; realized_pnl: number | null;
  created_by: string; created_at: string; updated_at: string;
}

export const fetchDeals = (relId?: string) => mFetch<{ deals: MerchantDeal[] }>(`/stub`);
export const createDeal = (data: any) => mFetch<{ deal: MerchantDeal }>("/stub");
export const updateDeal = (id: string, data: any) => mFetch<{ deal: MerchantDeal }>(`/stub`);
export const submitSettlement = (dealId: string, data: any) => mFetch<any>(`/stub`);
export const recordProfit = (dealId: string, data: any) => mFetch<any>(`/stub`);
export const closeDeal = (dealId: string, data?: any) => mFetch<any>(`/stub`);

// ── Advances ──
export interface MerchantAdvance extends MerchantDeal { funding_lines: any[]; principal_sent: number; principal_returned: number; outstanding_principal: number; }
export interface FundingLine { id: string; deal_id: string; line_type: string; amount: number; currency: string; usdt_qty: number | null; unit_rate: number | null; transfer_reference: string | null; source_wallet: string | null; destination_wallet: string | null; creator_merchant_id: string; confirmer_merchant_id: string | null; confirmed_at: string | null; note: string | null; created_at: string; }

export const fetchAdvances = (relId?: string) => mFetch<{ advances: MerchantAdvance[] }>(`/stub`);
export const createAdvance = (data: any) => mFetch<{ advance: MerchantDeal }>("/stub");
export const sendPrincipal = (dealId: string, data: any) => mFetch<any>(`/stub`);
export const returnPrincipal = (dealId: string, data: any) => mFetch<any>(`/stub`);

// ── Purchases ──
export const fetchPurchases = (relId?: string) => mFetch<{ purchases: MerchantDeal[] }>(`/stub`);
export const createPurchase = (data: any) => mFetch<{ purchase: MerchantDeal }>("/stub");

// ── Profit Share ──
export interface ProfitAllocation { id: string; deal_id: string; relationship_id: string; gross_proceeds: number; cost_basis: number; network_fees: number; transfer_fees: number; deal_expenses: number; approved_corrections: number; net_deal_profit: number; owner_ratio: number; operator_ratio: number; owner_share: number; operator_share: number; status: string; submitted_by: string; approved_by: string | null; created_at: string; updated_at: string; }
export interface ProfitShareDeal extends MerchantDeal { allocations: ProfitAllocation[]; funding_lines: FundingLine[]; }

export const fetchProfitShareDeals = (relId?: string) => mFetch<{ deals: ProfitShareDeal[] }>(`/stub`);
export const createProfitShareDeal = (data: any) => mFetch<{ deal: MerchantDeal }>("/stub");
export const submitProfitAllocation = (dealId: string, data: any) => mFetch<any>(`/stub`);

// ── Capital Pools ──
export interface CapitalPool { id: string; relationship_id: string; capital_owner_id: string; operator_id: string; initial_capital: number; current_capital: number; minimum_reserve: number; currency: string; profit_split_owner: number; profit_split_operator: number; loss_carry_forward: number; high_water_mark: number; payout_cycle: string; settlement_cutoff_day: number; status: string; start_date: string; close_date: string | null; created_at: string; updated_at: string; periods: PoolPeriod[]; }
export interface PoolPeriod { id: string; pool_id: string; period_label: string; opening_capital: number; top_ups: number; withdrawals: number; closing_capital: number; realized_profit: number; carried_loss_recovered: number; pool_fees: number; distributable_profit: number; owner_payout: number; operator_payout: number; loss_carry_forward: number; effective_yield: number | null; status: string; locked_at: string | null; settled_at: string | null; created_at: string; }

export const fetchPools = (relId?: string) => mFetch<{ pools: CapitalPool[] }>(`/stub`);
export const createPool = (data: any) => mFetch<{ pool: CapitalPool }>("/stub");
export const topUpPool = (poolId: string, amount: number) => mFetch<{ ok: boolean }>(`/stub`);
export const withdrawPool = (poolId: string, amount: number) => mFetch<{ ok: boolean }>(`/stub`);
export const closePeriod = (poolId: string, data: any) => mFetch<any>(`/stub`);

// ── Comments ──
export interface MerchantComment { id: string; deal_id: string | null; relationship_id: string; parent_id: string | null; sender_merchant_id: string; sender_user_id: string; comment_type: string; body: string; sender_name?: string; sender_nickname?: string; created_at: string; deleted_at: string | null; }

export const fetchComments = (params: any) => mFetch<{ comments: MerchantComment[] }>(`/stub`);
export const postComment = (data: any) => mFetch<{ comment_id: string }>("/stub");

// ── Adjustments ──
export interface MerchantAdjustment { id: string; deal_id: string; relationship_id: string; requester_merchant_id: string; requester_name?: string; field_challenged: string; old_value: string | null; proposed_value: string; reason: string; evidence_url: string | null; status: string; approver_merchant_id: string | null; approved_adjustment_value: string | null; resolved_at: string | null; created_at: string; }

export const fetchAdjustments = (dealId: string) => mFetch<{ adjustments: MerchantAdjustment[] }>(`/stub`);
export const createAdjustment = (data: any) => mFetch<{ adjustment_id: string; approval_id: string }>("/stub");
export const resolveAdjustment = (id: string, data: any) => mFetch<{ ok: boolean }>(`/stub`);

// ── Messages ──
export interface MerchantMessage { id: string; relationship_id: string; sender_user_id: string; sender_merchant_id: string; message_type: string; body: string; sender_name?: string; sender_nickname?: string; read_by: string | null; created_at: string; }

export const fetchMessages = (relId: string, limit = 50, offset = 0) => mFetch<{ messages: MerchantMessage[] }>(`/stub`);
export const sendMessage = (relId: string, body: string) => mFetch<{ message: MerchantMessage }>(`/stub`);

// ── Approvals ──
export interface MerchantApproval { id: string; relationship_id: string; type: string; target_entity_type: string | null; target_entity_id: string | null; proposed_payload: string | null; status: string; submitted_by_user_id: string; submitted_by_merchant_id: string; submitter_name?: string; submitter_nickname?: string; resolution_note: string | null; submitted_at: string; resolved_at: string | null; }

export const fetchApprovalInbox = () => mFetch<{ approvals: MerchantApproval[] }>("/stub");
export const fetchSentApprovals = () => mFetch<{ approvals: MerchantApproval[] }>("/stub");
export const approveRequest = (id: string, note?: string) => mFetch<{ ok: boolean }>(`/stub`);
export const rejectRequest = (id: string, note?: string) => mFetch<{ ok: boolean }>(`/stub`);

// ── Audit ──
export interface AuditLog { id: string; actor_user_id: string; actor_merchant_id: string | null; entity_type: string; entity_id: string; action: string; before_state: string | null; after_state: string | null; note: string | null; actor_name?: string; created_at: string; }

export const fetchRelAudit = (relId: string) => mFetch<{ logs: AuditLog[] }>(`/stub`);
export const fetchMyActivity = () => mFetch<{ logs: AuditLog[] }>("/stub");

// ── Notifications ──
export interface MerchantNotification { id: string; user_id: string; merchant_id: string; type: string; title: string; body: string | null; entity_type: string | null; entity_id: string | null; read: number; created_at: string; }

export const fetchNotifications = (limit = 50) => mFetch<{ notifications: MerchantNotification[] }>(`/stub`);
export const markNotificationRead = (id: string) => mFetch<{ ok: boolean }>(`/stub`);
export const markAllRead = () => mFetch<{ ok: boolean }>("/stub");
export const unreadCount = () => mFetch<{ count: number }>("/stub");
