/**
 * priceProvider.ts
 *
 * Real-time crypto price layer.
 * - Binance REST for bootstrap prices
 * - Binance WebSocket for live tick updates
 * - CoinGecko direct for historical charts and coin search
 *
 * No Cloudflare Worker proxy — all requests go direct.
 */

const BINANCE_REST = "https://api.binance.com/api/v3";
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const HIST_TTL_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 30 * 60 * 1000;

const _cache: Record<string, { data: any; ts: number }> = {};

// ─── Symbol Maps ───────────────────────────────────────────

export const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", BNB: "BNBUSDT",
  XRP: "XRPUSDT", DOGE: "DOGEUSDT", ADA: "ADAUSDT", AVAX: "AVAXUSDT",
  DOT: "DOTUSDT", MATIC: "MATICUSDT", LINK: "LINKUSDT", UNI: "UNIUSDT",
  SHIB: "SHIBUSDT", LTC: "LTCUSDT", ATOM: "ATOMUSDT", ETC: "ETCUSDT",
  XLM: "XLMUSDT", NEAR: "NEARUSDT", FIL: "FILUSDT", APT: "APTUSDT",
  ARB: "ARBUSDT", OP: "OPUSDT", SUI: "SUIUSDT", SEI: "SEIUSDT",
  TIA: "TIAUSDT", INJ: "INJUSDT", ALGO: "ALGOUSDT", VET: "VETUSDT",
  FTM: "FTMUSDT", SAND: "SANDUSDT", MANA: "MANAUSDT", GALA: "GALAUSDT",
  AXS: "AXSUSDT", ENJ: "ENJUSDT", LRC: "LRCUSDT", CRV: "CRVUSDT",
  AAVE: "AAVEUSDT", COMP: "COMPUSDT", MKR: "MKRUSDT", SNX: "SNXUSDT",
  SUSHI: "SUSHIUSDT", YFI: "YFIUSDT", BAL: "BALUSDT", ZRX: "ZRXUSDT",
  BAT: "BATUSDT", DYDX: "DYDXUSDT", GRT: "GRTUSDT", CHZ: "CHZUSDT",
  ENS: "ENSUSDT", RNDR: "RNDRUSDT", RENDER: "RENDERUSDT", IMX: "IMXUSDT",
  QNT: "QNTUSDT", TAO: "TAOUSDT", FET: "FETUSDT", AGIX: "AGIXUSDT",
  OCEAN: "OCEANUSDT", WLD: "WLDUSDT", AR: "ARUSDT", STX: "STXUSDT",
  ICP: "ICPUSDT", HBAR: "HBARUSDT", EGLD: "EGLDUSDT", ROSE: "ROSEUSDT",
  FLOW: "FLOWUSDT", KAVA: "KAVAUSDT", IOTA: "IOTAUSDT", ZIL: "ZILUSDT",
  ONE: "ONEUSDT", CELO: "CELOUSDT", THETA: "THETAUSDT", KSM: "KSMUSDT",
  QTUM: "QTUMUSDT", ZEC: "ZECUSDT", DASH: "DASHUSDT", XMR: "XMRUSDT",
  BCH: "BCHUSDT", BSV: "BSVUSDT", TRX: "TRXUSDT", EOS: "EOSUSDT",
  NEO: "NEOUSDT", XTZ: "XTZUSDT", WAVES: "WAVESUSDT", ICX: "ICXUSDT",
  ONT: "ONTUSDT", RVN: "RVNUSDT", SC: "SCUSDT", ZEN: "ZENUSDT",
  ANKR: "ANKRUSDT", STORJ: "STORJUSDT", SKL: "SKLUSDT", CELR: "CELRUSDT",
  BAND: "BANDUSDT", REN: "RENUSDT", NKN: "NKNUSDT", OGN: "OGNUSDT",
  CKB: "CKBUSDT", COTI: "COTIUSDT", MTL: "MTLUSDT", DENT: "DENTUSDT",
  HOT: "HOTUSDT", WIN: "WINUSDT", BTT: "BTTUSDT", JST: "JSTUSDT",
  SUN: "SUNUSDT", MASK: "MASKUSDT", AUDIO: "AUDIOUSDT", BAKE: "BAKEUSDT",
  CAKE: "CAKEUSDT", LUNA: "LUNAUSDT", LUNC: "LUNCUSDT", PEPE: "PEPEUSDT",
  FLOKI: "FLOKIUSDT", BONK: "BONKUSDT", WIF: "WIFUSDT", JUP: "JUPUSDT",
  PYTH: "PYTHUSDT", JTO: "JTOUSDT", MEME: "MEMEUSDT", ORDI: "ORDIUSDT",
  SATS: "1000SATSUSDT", RAY: "RAYUSDT", ORCA: "ORCAUSDT",
  BLUR: "BLURUSDT", STRK: "STRKUSDT", MANTA: "MANTAUSDT", DYM: "DYMUSDT",
  PIXEL: "PIXELUSDT", PORTAL: "PORTALUSDT", AEVO: "AEVOUSDT",
  W: "WUSDT", ENA: "ENAUSDT", NOT: "NOTUSDT", IO: "IOUSDT",
  ZK: "ZKUSDT", ZRO: "ZROUSDT", LISTA: "LISTAUSDT", BOME: "BOMEUSDT",
  BB: "BBUSDT", REZ: "REZUSDT", TON: "TONUSDT", PEOPLE: "PEOPLEUSDT",
  LINA: "LINAUSDT", RUNE: "RUNEUSDT", GMX: "GMXUSDT", PENDLE: "PENDLEUSDT",
  SSV: "SSVUSDT", TWT: "TWTUSDT", CFX: "CFXUSDT", ACH: "ACHUSDT",
  JASMY: "JASMYUSDT", SUPER: "SUPERUSDT", MINA: "MINAUSDT",
  API3: "API3USDT", RSR: "RSRUSDT", FXS: "FXSUSDT", RPL: "RPLUSDT",
  LDO: "LDOUSDT", WSTETH: "WSTETHUSDT", CBETH: "CBETHUSDT",
  WBTC: "WBTCUSDT", STETH: "STETHUSDT", RETH: "RETHUSDT",
  POL: "POLUSDT", KAS: "KASUSDT",
};

export const KNOWN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", AVAX: "avalanche-2",
  DOT: "polkadot", MATIC: "matic-network", LINK: "chainlink",
  UNI: "uniswap", SHIB: "shiba-inu", LTC: "litecoin",
  ATOM: "cosmos", ETC: "ethereum-classic", XLM: "stellar",
  NEAR: "near", FIL: "filecoin", APT: "aptos",
  ARB: "arbitrum", OP: "optimism", SUI: "sui", SEI: "sei-network",
  TIA: "celestia", INJ: "injective-protocol", ALGO: "algorand",
  VET: "vechain", FTM: "fantom", SAND: "the-sandbox",
  MANA: "decentraland", GALA: "gala", AXS: "axie-infinity",
  ENJ: "enjincoin", LRC: "loopring", CRV: "curve-dao-token",
  AAVE: "aave", COMP: "compound-governance-token", MKR: "maker",
  SNX: "havven", SUSHI: "sushi", YFI: "yearn-finance",
  BAL: "balancer", ZRX: "0x", BAT: "basic-attention-token",
  DYDX: "dydx", GRT: "the-graph", CHZ: "chiliz",
  ENS: "ethereum-name-service", RNDR: "render-token", RENDER: "render-token",
  IMX: "immutable-x", QNT: "quant-network", TAO: "bittensor",
  FET: "fetch-ai", AGIX: "singularitynet", OCEAN: "ocean-protocol",
  WLD: "worldcoin-wld", AR: "arweave", STX: "blockstack",
  ICP: "internet-computer", HBAR: "hedera-hashgraph", EGLD: "elrond-erd-2",
  ROSE: "oasis-network", FLOW: "flow", KAVA: "kava",
  IOTA: "iota", ZIL: "zilliqa", ONE: "harmony",
  CELO: "celo", THETA: "theta-token", KSM: "kusama",
  QTUM: "qtum", ZEC: "zcash", DASH: "dash",
  XMR: "monero", BCH: "bitcoin-cash", TRX: "tron",
  EOS: "eos", NEO: "neo", XTZ: "tezos",
  WAVES: "waves", ICX: "icon", ONT: "ontology",
  RVN: "ravencoin", SC: "siacoin", ZEN: "horizen",
  ANKR: "ankr", STORJ: "storj", SKL: "skale",
  CELR: "celer-network", BAND: "band-protocol", REN: "republic-protocol",
  NKN: "nkn", OGN: "origin-protocol", CKB: "nervos-network",
  COTI: "coti", MTL: "metal", DENT: "dent",
  HOT: "holotoken", WIN: "wink", BTT: "bittorrent",
  JST: "just", SUN: "sun-token", MASK: "mask-network",
  AUDIO: "audius", BAKE: "bakerytoken", CAKE: "pancakeswap-token",
  LUNA: "terra-luna-2", LUNC: "terra-luna", PEPE: "pepe",
  FLOKI: "floki", BONK: "bonk", WIF: "dogwifcoin",
  JUP: "jupiter-exchange-solana", PYTH: "pyth-network", JTO: "jito-governance-token",
  MEME: "memecoin-2", ORDI: "ordinals",
  RAY: "raydium", BLUR: "blur",
  STRK: "starknet", MANTA: "manta-network", DYM: "dymension",
  PIXEL: "pixels", PORTAL: "portal-2",
  ENA: "ethena", NOT: "notcoin", TON: "the-open-network",
  PEOPLE: "constitutiondao", RUNE: "thorchain", GMX: "gmx",
  PENDLE: "pendle", CFX: "conflux-token",
  JASMY: "jasmycoin", MINA: "mina-protocol",
  RSR: "reserve-rights-token", FXS: "frax-share", RPL: "rocket-pool",
  LDO: "lido-dao", WBTC: "wrapped-bitcoin", STETH: "staked-ether",
  POL: "polygon-ecosystem-token", KAS: "kaspa",
};

const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD", "UST", "PYUSD"]);

// ─── Reverse Lookup ────────────────────────────────────────

const _reverseMap = new Map<string, string>();
for (const [sym, pair] of Object.entries(BINANCE_SYMBOLS)) {
  _reverseMap.set(pair, sym);
}

// ─── Spot Prices (REST bootstrap) ──────────────────────────

export interface SpotPrice {
  price: number;
  change24h: number;
  ts: number;
  stale: boolean;
  source: "binance" | "coingecko";
}

export async function getSpotPrices(
  assets: { sym: string; coingeckoId?: string | null }[]
): Promise<Record<string, SpotPrice>> {
  const result: Record<string, SpotPrice> = {};
  const now = Date.now();

  const nonStable: typeof assets = [];
  for (const a of assets) {
    if (STABLECOINS.has(a.sym.toUpperCase())) {
      result[a.sym.toUpperCase()] = { price: 1, change24h: 0, ts: now, stale: false, source: "binance" };
    } else {
      nonStable.push(a);
    }
  }

  const binancePairs: string[] = [];
  const pairToAsset = new Map<string, typeof nonStable[0]>();
  for (const a of nonStable) {
    const pair = BINANCE_SYMBOLS[a.sym.toUpperCase()];
    if (pair) {
      binancePairs.push(pair);
      pairToAsset.set(pair, a);
    }
  }

  if (binancePairs.length > 0) {
    try {
      const symbolsParam = JSON.stringify(binancePairs);
      const r = await fetch(`${BINANCE_REST}/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const items: any[] = await r.json();
        for (const item of items) {
          const sym = _reverseMap.get(item.symbol);
          if (sym) {
            result[sym] = {
              price: parseFloat(item.lastPrice) || 0,
              change24h: parseFloat(item.priceChangePercent) || 0,
              ts: now,
              stale: false,
              source: "binance",
            };
          }
        }
      }
    } catch (e) {
      console.warn("[priceProvider] Binance REST failed:", e);
    }
  }

  // CoinGecko fallback for missing
  const missing = nonStable.filter(a => !result[a.sym.toUpperCase()] && a.coingeckoId);
  if (missing.length > 0) {
    try {
      const ids = missing.map(a => a.coingeckoId!).join(",");
      const r = await fetch(
        `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const data: Record<string, { usd?: number; usd_24h_change?: number }> = await r.json();
        for (const a of missing) {
          const cg = data[a.coingeckoId!];
          if (cg?.usd != null) {
            result[a.sym.toUpperCase()] = {
              price: cg.usd,
              change24h: cg.usd_24h_change ?? 0,
              ts: now,
              stale: false,
              source: "coingecko",
            };
          }
        }
      }
    } catch (e) {
      console.warn("[priceProvider] CoinGecko fallback failed:", e);
    }
  }

  return result;
}

// ─── WebSocket Singleton ───────────────────────────────────

let _ws: WebSocket | null = null;
let _wsSymbols: string[] = [];
let _wsCallbacks = new Set<() => void>();
let _wsPrices: Record<string, SpotPrice> = {};
let _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function _buildStreamUrl(symbols: string[]): string {
  const streams = symbols
    .map(sym => {
      const pair = BINANCE_SYMBOLS[sym];
      return pair ? `${pair.toLowerCase()}@ticker` : null;
    })
    .filter(Boolean)
    .join("/");
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}

function _startWS(symbols: string[]) {
  if (_ws) {
    _ws.onclose = null;
    _ws.onerror = null;
    _ws.onmessage = null;
    _ws.close();
    _ws = null;
  }

  if (_wsReconnectTimer) {
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = null;
  }

  const pairs = symbols.filter(s => BINANCE_SYMBOLS[s]);
  if (pairs.length === 0) return;

  const url = _buildStreamUrl(pairs);
  try {
    _ws = new WebSocket(url);
  } catch {
    _wsReconnectTimer = setTimeout(() => _startWS(symbols), 5000);
    return;
  }

  _ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      const d = msg.data;
      if (!d || !d.s) return;

      const sym = _reverseMap.get(d.s);
      if (!sym) return;

      _wsPrices[sym] = {
        price: parseFloat(d.c) || 0,
        change24h: parseFloat(d.P) || 0,
        ts: Date.now(),
        stale: false,
        source: "binance",
      };

      _wsCallbacks.forEach(cb => cb());
    } catch {}
  };

  _ws.onclose = () => {
    _wsReconnectTimer = setTimeout(() => _startWS(symbols), 5000);
  };

  _ws.onerror = () => {
    _ws?.close();
  };
}

export function subscribeLivePrices(
  assetSymbols: string[],
  callback: () => void,
): () => void {
  _wsCallbacks.add(callback);

  const sorted = [...assetSymbols].sort().join(",");
  const existing = [..._wsSymbols].sort().join(",");

  if (sorted !== existing) {
    _wsSymbols = [...assetSymbols];
    _startWS(_wsSymbols);
  }

  return () => {
    _wsCallbacks.delete(callback);
    if (_wsCallbacks.size === 0 && _ws) {
      _ws.onclose = null;
      _ws.close();
      _ws = null;
      _wsSymbols = [];
    }
  };
}

export function getWsPrices(): Record<string, SpotPrice> {
  return { ..._wsPrices };
}

// ─── CoinGecko History (for charts/calendar) ───────────────

export async function getDailyHistory(
  sym: string,
  days = 90,
): Promise<{ day: string; price: number }[]> {
  const key = `hist_${sym.toUpperCase()}_${days}`;
  const cached = _cache[key];
  if (cached && Date.now() - cached.ts < HIST_TTL_MS) return cached.data;

  const formatDate = (ts: number) => {
    if (days === 1) return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 7) return new Date(ts).toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: days > 90 ? '2-digit' : undefined });
  };

  // Try Binance first
  const binancePair = BINANCE_SYMBOLS[sym.toUpperCase()];
  if (binancePair) {
    let interval = "1d", limit = days;
    if (days === 1) { interval = "15m"; limit = 96; }
    else if (days === 7) { interval = "2h"; limit = 84; }
    else if (days === 30) { interval = "12h"; limit = 60; }
    try {
      const url = `${BINANCE_REST}/klines?symbol=${binancePair}&interval=${interval}&limit=${limit}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const json = await r.json();
        const points = json.map((k: any) => ({
          day: formatDate(k[0]),
          price: parseFloat(k[4])
        }));
        _cache[key] = { data: points, ts: Date.now() };
        return points;
      }
    } catch (e) {
      console.warn("[priceProvider] Binance klines failed for", sym, e);
    }
  }

  // Fallback to CoinGecko direct
  const coingeckoId = KNOWN_IDS[sym.toUpperCase()] || sym.toLowerCase();
  try {
    const r = await fetch(
      `${COINGECKO_API}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) return [];
    const json = await r.json();
    const pricesList = json.prices || [];
    const step = Math.ceil(pricesList.length / 100);
    const points = pricesList.filter((_: any, i: number) => i % step === 0).map(([ts, price]: [number, number]) => ({
      day: formatDate(ts),
      price,
    }));
    _cache[key] = { data: points, ts: Date.now() };
    return points;
  } catch {
    return [];
  }
}

export async function searchCoins(
  query: string,
): Promise<{ id: string; symbol: string; name: string; thumb: string }[]> {
  const key = `search_${query.toLowerCase()}`;
  const cached = _cache[key];
  if (cached && Date.now() - cached.ts < SEARCH_TTL_MS) return cached.data;

  try {
    const r = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const json = await r.json();
    const results = (json.coins || []).slice(0, 8).map((c: any) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      thumb: c.thumb || c.large || "",
    }));
    _cache[key] = { data: results, ts: Date.now() };
    return results;
  } catch {
    return [];
  }
}

export function isStale(ts: number): boolean {
  return Date.now() - ts > 5 * 60 * 1000;
}
