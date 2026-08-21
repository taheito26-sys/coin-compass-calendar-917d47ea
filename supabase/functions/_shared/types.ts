
export type SyncStage = "test" | "sync" | "fetch" | "normalize" | "insert";

export type ExchangeId = "binance" | "bybit" | "okx" | "gate" | "kraken" | "coinbase";

export class AppError extends Error {
  status: number;
  stage: SyncStage;
  exchange?: string;
  code?: string;
  hint?: string;

  constructor(params: {
    message: string;
    status: number;
    stage: SyncStage;
    exchange?: string;
    code?: string;
    hint?: string;
  }) {
    super(params.message);
    this.name = "AppError";
    this.status = params.status;
    this.stage = params.stage;
    this.exchange = params.exchange;
    this.code = params.code;
    this.hint = params.hint;
  }
}

export class UpstreamError extends AppError {
  endpoint: string;
  upstreamStatus: number;
  rawResponseTruncated: string;

  constructor(params: {
    message: string;
    exchange: string;
    stage?: SyncStage;
    code?: string;
    endpoint: string;
    upstreamStatus: number;
    rawResponseTruncated: string;
    hint?: string;
  }) {
    super({
      message: params.message,
      status: 502,
      stage: params.stage || "fetch",
      exchange: params.exchange,
      code: params.code,
      hint: params.hint,
    });
    this.name = "UpstreamError";
    this.endpoint = params.endpoint;
    this.upstreamStatus = params.upstreamStatus;
    this.rawResponseTruncated = params.rawResponseTruncated;
  }
}

export interface ExchangeRequestParams {
  exchange: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  stage: SyncStage;
  endpoint: string;
  logContext?: Record<string, unknown>;
}

export interface ExchangeResponse<T = any> {
  status: number;
  text: string;
  data: T;
}

export interface FetchStats {
  fetchedPages: number;
  fetchedTrades: number;
  normalizedTrades: number;
  invalidTrades: number;
  windowsScanned?: number;
}

export interface FetchResult {
  trades: any[];
  stats: FetchStats;
}

export interface PositionInfo {
  exchange: ExchangeId;
  instId: string;
  instType: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
  liquidationPrice: number;
  margin: number;
  marginMode: string;
  currency: string;
}

