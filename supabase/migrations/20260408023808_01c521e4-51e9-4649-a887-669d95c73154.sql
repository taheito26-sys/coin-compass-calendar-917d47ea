
-- Seed airdrop projects across exchanges and L1/L2/DeFi platforms
INSERT INTO airdrop_projects (project_name, token_symbol, chain, confidence_score, eligibility_requirements, official_url, snapshot_date, distribution_date) VALUES
-- Exchange-based campaigns
('Binance Megadrop - Lista DAO','LISTA','BNB Chain',90,'Stake BNB in Locked Products, complete Web3 quests','https://www.binance.com/en/megadrop',NULL,NULL),
('Binance Launchpool - Usual','USUAL','Ethereum',85,'Stake BNB or FDUSD in Launchpool','https://www.binance.com/en/launchpool',NULL,NULL),
('Coinbase Learning Rewards','VARIOUS','Multi-chain',95,'Complete learn-and-earn quizzes on Coinbase','https://www.coinbase.com/learn',NULL,NULL),
('OKX Jumpstart - Orderly Network','ORDER','Multi-chain',80,'Hold OKB, participate in Jumpstart mining','https://www.okx.com/jumpstart',NULL,NULL),
('Bybit Launchpool','VARIOUS','Multi-chain',75,'Stake USDT/MNT in Bybit Launchpool','https://www.bybit.com/en/launchpool',NULL,NULL),
('KuCoin Spotlight','VARIOUS','Multi-chain',70,'Hold KCS, complete KYC, participate in token sales','https://www.kucoin.com/spotlight',NULL,NULL),
('Gate.io Startup','VARIOUS','Multi-chain',70,'Hold GT tokens, participate in startup offerings','https://www.gate.io/startup',NULL,NULL),
('Bitget PoolX','VARIOUS','Multi-chain',72,'Stake BGB or USDT in PoolX campaigns','https://www.bitget.com/poolx',NULL,NULL),
('MEXC Kickstarter','VARIOUS','Multi-chain',68,'Vote with MX tokens for new listings','https://www.mexc.com/mx-defi',NULL,NULL),
('HTX Primelist','VARIOUS','Multi-chain',65,'Hold HT tokens, complete tasks on HTX','https://www.htx.com/primelist',NULL,NULL),
('Kraken Parachain Auctions','VARIOUS','Polkadot',60,'Bond DOT/KSM via Kraken for parachain slots','https://www.kraken.com/learn/parachain-auctions',NULL,NULL),
-- L2 / Infrastructure airdrops
('LayerZero Season 2','ZRO','Multi-chain',82,'Bridge assets via Stargate, use LayerZero dApps across chains','https://layerzero.network',NULL,NULL),
('Starknet Provisions R2','STRK','Starknet',78,'Use Starknet dApps (JediSwap, mySwap, Ekubo), bridge via StarkGate','https://starknet.io',NULL,NULL),
('zkSync Era Airdrop','ZK','zkSync Era',85,'Bridge to zkSync, use DEXs (SyncSwap, Mute), hold NFTs','https://zksync.io',NULL,NULL),
('Scroll Airdrop','SCR','Scroll',80,'Bridge to Scroll, provide liquidity on Ambient/Zebra, deploy contracts','https://scroll.io','2026-06-01','2026-07-15'),
('Linea Voyage','LNA','Linea',75,'Complete Linea Voyage missions, bridge via MetaMask, use Linea dApps','https://linea.build',NULL,NULL),
('Blast Gold & Points','BLAST','Blast',88,'Bridge ETH/USDB to Blast, earn points via dApps (Thruster, Juice)','https://blast.io','2026-05-01','2026-06-01'),
('Base Onchain Summer','BASE','Base',55,'Use Base chain dApps, mint NFTs, swap on Aerodrome','https://base.org',NULL,NULL),
-- Restaking / Modular
('EigenLayer Season 2','EIGEN','Ethereum',90,'Restake ETH/LSTs on EigenLayer, delegate to operators','https://eigenlayer.xyz',NULL,NULL),
('Celestia Modular Fellows','TIA','Celestia',60,'Run light nodes, contribute to Celestia ecosystem','https://celestia.org',NULL,NULL),
('Monad Testnet','MONAD','Monad',70,'Participate in Monad testnet, bridge assets, complete quests','https://monad.xyz',NULL,NULL),
('Berachain Boyco','BERA','Berachain',75,'Provide liquidity on Berachain testnet, use proof-of-liquidity','https://berachain.com','2026-05-15',NULL),
-- Alt L1
('Sui Overflow Hackathon','SUI','Sui',50,'Build on Sui, participate in hackathon, use DeFi protocols','https://sui.io',NULL,NULL),
('Aptos Ecosystem Rewards','APT','Aptos',55,'Use Aptos DeFi (Liquidswap, Aries), stake APT, mint NFTs','https://aptoslabs.com',NULL,NULL),
('Sei V2 Airdrop','SEI','Sei',65,'Bridge to Sei, use DragonSwap/Yei Finance, provide liquidity','https://sei.io',NULL,NULL),
('Manta Pacific Points','MANTA','Manta Pacific',72,'Bridge to Manta, stake on Manta Pacific, use zkDeFi apps','https://manta.network',NULL,NULL),
-- DeFi protocol airdrops
('Jupiter Season 2','JUP','Solana',88,'Swap on Jupiter aggregator, use DCA/limit orders, vote in governance','https://jup.ag',NULL,NULL),
('Hyperliquid Points','HYPE','Hyperliquid',85,'Trade perpetuals on Hyperliquid L1, provide HLP liquidity','https://hyperliquid.xyz',NULL,NULL),
('dYdX Season Rewards','DYDX','dYdX Chain',80,'Trade on dYdX v4, stake DYDX, participate in governance','https://dydx.exchange',NULL,NULL),
('Arbitrum STIP Bridge','ARB','Arbitrum',70,'Use Arbitrum dApps funded by STIP grants, bridge and trade','https://arbitrum.io',NULL,NULL),
('Optimism RetroPGF','OP','Optimism',75,'Contribute to Optimism public goods, use OP Mainnet dApps','https://optimism.io',NULL,NULL),
('Pendle Points Market','PENDLE','Multi-chain',78,'Provide liquidity on Pendle, trade yield tokens across chains','https://pendle.finance',NULL,NULL),
('Ethena Sats Campaign','ENA','Ethereum',82,'Mint USDe, provide LP on Curve/Uniswap, stake sUSDe','https://ethena.fi',NULL,NULL),
('Kamino Finance S2','KMNO','Solana',77,'Provide liquidity on Kamino, use multiply vaults, borrow/lend','https://kamino.finance',NULL,NULL),
('Parcl Points','PRCL','Solana',68,'Trade real estate indexes on Parcl, provide liquidity','https://parcl.co',NULL,NULL),
('Drift Protocol','DRIFT','Solana',80,'Trade perps on Drift, provide insurance fund, use BET markets','https://drift.trade',NULL,NULL);

-- Now insert tasks for each project
-- Binance Megadrop
INSERT INTO airdrop_tasks (project_id, task_type, description, required) 
SELECT id, 'staking', 'Stake BNB in Simple Earn Locked Products (120-day minimum)', true FROM airdrop_projects WHERE project_name='Binance Megadrop - Lista DAO'
UNION ALL SELECT id, 'quest', 'Complete all Web3 quests in Binance Megadrop portal', true FROM airdrop_projects WHERE project_name='Binance Megadrop - Lista DAO'
UNION ALL SELECT id, 'kyc', 'Complete full KYC verification on Binance', true FROM airdrop_projects WHERE project_name='Binance Megadrop - Lista DAO';

-- Coinbase Learning
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'education', 'Complete available learn-and-earn quizzes', true FROM airdrop_projects WHERE project_name='Coinbase Learning Rewards'
UNION ALL SELECT id, 'kyc', 'Verify identity on Coinbase', true FROM airdrop_projects WHERE project_name='Coinbase Learning Rewards';

-- EigenLayer
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'staking', 'Restake ETH or LSTs (stETH, rETH, cbETH) on EigenLayer', true FROM airdrop_projects WHERE project_name='EigenLayer Season 2'
UNION ALL SELECT id, 'delegation', 'Delegate restaked assets to an active operator', true FROM airdrop_projects WHERE project_name='EigenLayer Season 2'
UNION ALL SELECT id, 'social', 'Follow EigenLayer on Twitter and join Discord', false FROM airdrop_projects WHERE project_name='EigenLayer Season 2'
UNION ALL SELECT id, 'governance', 'Participate in EIGEN governance proposals', false FROM airdrop_projects WHERE project_name='EigenLayer Season 2';

-- zkSync
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge ETH to zkSync Era via official bridge', true FROM airdrop_projects WHERE project_name='zkSync Era Airdrop'
UNION ALL SELECT id, 'defi', 'Swap tokens on SyncSwap or Mute.io', true FROM airdrop_projects WHERE project_name='zkSync Era Airdrop'
UNION ALL SELECT id, 'defi', 'Provide liquidity on a zkSync DEX', false FROM airdrop_projects WHERE project_name='zkSync Era Airdrop'
UNION ALL SELECT id, 'nft', 'Mint an NFT on zkSync Era', false FROM airdrop_projects WHERE project_name='zkSync Era Airdrop'
UNION ALL SELECT id, 'contract', 'Deploy a smart contract on zkSync', false FROM airdrop_projects WHERE project_name='zkSync Era Airdrop';

-- LayerZero
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge assets via Stargate Finance across 3+ chains', true FROM airdrop_projects WHERE project_name='LayerZero Season 2'
UNION ALL SELECT id, 'defi', 'Use LayerZero-powered dApps (Radiant, Angle, etc.)', true FROM airdrop_projects WHERE project_name='LayerZero Season 2'
UNION ALL SELECT id, 'messaging', 'Send cross-chain messages using LayerZero', false FROM airdrop_projects WHERE project_name='LayerZero Season 2';

-- Starknet
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge ETH to Starknet via StarkGate', true FROM airdrop_projects WHERE project_name='Starknet Provisions R2'
UNION ALL SELECT id, 'defi', 'Swap on JediSwap, mySwap, or Ekubo', true FROM airdrop_projects WHERE project_name='Starknet Provisions R2'
UNION ALL SELECT id, 'defi', 'Provide liquidity on a Starknet DEX', false FROM airdrop_projects WHERE project_name='Starknet Provisions R2'
UNION ALL SELECT id, 'identity', 'Create a Starknet ID (.stark domain)', false FROM airdrop_projects WHERE project_name='Starknet Provisions R2';

-- Scroll
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge ETH to Scroll via official bridge', true FROM airdrop_projects WHERE project_name='Scroll Airdrop'
UNION ALL SELECT id, 'defi', 'Provide liquidity on Ambient or Zebra DEX', true FROM airdrop_projects WHERE project_name='Scroll Airdrop'
UNION ALL SELECT id, 'contract', 'Deploy a smart contract on Scroll', false FROM airdrop_projects WHERE project_name='Scroll Airdrop'
UNION ALL SELECT id, 'nft', 'Mint Scroll Origins NFT', false FROM airdrop_projects WHERE project_name='Scroll Airdrop';

-- Blast
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge ETH or USDB to Blast L2', true FROM airdrop_projects WHERE project_name='Blast Gold & Points'
UNION ALL SELECT id, 'defi', 'Use Thruster DEX or Juice Finance on Blast', true FROM airdrop_projects WHERE project_name='Blast Gold & Points'
UNION ALL SELECT id, 'referral', 'Invite 3+ friends via Blast invite code', false FROM airdrop_projects WHERE project_name='Blast Gold & Points';

-- Jupiter
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Execute 10+ swaps on Jupiter aggregator', true FROM airdrop_projects WHERE project_name='Jupiter Season 2'
UNION ALL SELECT id, 'defi', 'Use Jupiter DCA or limit order features', true FROM airdrop_projects WHERE project_name='Jupiter Season 2'
UNION ALL SELECT id, 'governance', 'Vote in Jupiter DAO governance proposals', false FROM airdrop_projects WHERE project_name='Jupiter Season 2'
UNION ALL SELECT id, 'staking', 'Stake JUP tokens in governance vault', false FROM airdrop_projects WHERE project_name='Jupiter Season 2';

-- Hyperliquid
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Trade perpetual contracts on Hyperliquid L1', true FROM airdrop_projects WHERE project_name='Hyperliquid Points'
UNION ALL SELECT id, 'defi', 'Provide liquidity to HLP vault', true FROM airdrop_projects WHERE project_name='Hyperliquid Points'
UNION ALL SELECT id, 'referral', 'Refer new traders via referral link', false FROM airdrop_projects WHERE project_name='Hyperliquid Points';

-- Linea
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge ETH to Linea via MetaMask or official bridge', true FROM airdrop_projects WHERE project_name='Linea Voyage'
UNION ALL SELECT id, 'quest', 'Complete Linea Voyage weekly missions', true FROM airdrop_projects WHERE project_name='Linea Voyage'
UNION ALL SELECT id, 'defi', 'Use Linea DeFi apps (SyncSwap, Horizon)', false FROM airdrop_projects WHERE project_name='Linea Voyage';

-- Berachain
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Provide liquidity on Berachain testnet DEX', true FROM airdrop_projects WHERE project_name='Berachain Boyco'
UNION ALL SELECT id, 'staking', 'Delegate BGT to validators (proof-of-liquidity)', true FROM airdrop_projects WHERE project_name='Berachain Boyco'
UNION ALL SELECT id, 'social', 'Join Berachain Discord and complete social quests', false FROM airdrop_projects WHERE project_name='Berachain Boyco';

-- Monad
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'testnet', 'Participate in Monad testnet transactions', true FROM airdrop_projects WHERE project_name='Monad Testnet'
UNION ALL SELECT id, 'social', 'Join Monad Discord and engage in community', true FROM airdrop_projects WHERE project_name='Monad Testnet'
UNION ALL SELECT id, 'quest', 'Complete Monad ecosystem quests on Galxe/Zealy', false FROM airdrop_projects WHERE project_name='Monad Testnet';

-- Ethena
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Mint USDe stablecoin on Ethena', true FROM airdrop_projects WHERE project_name='Ethena Sats Campaign'
UNION ALL SELECT id, 'staking', 'Stake sUSDe for yield and Sats points', true FROM airdrop_projects WHERE project_name='Ethena Sats Campaign'
UNION ALL SELECT id, 'defi', 'Provide USDe LP on Curve or Uniswap', false FROM airdrop_projects WHERE project_name='Ethena Sats Campaign';

-- Pendle
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Provide liquidity in Pendle yield pools', true FROM airdrop_projects WHERE project_name='Pendle Points Market'
UNION ALL SELECT id, 'defi', 'Trade yield tokens (PT/YT) on Pendle', true FROM airdrop_projects WHERE project_name='Pendle Points Market'
UNION ALL SELECT id, 'staking', 'Lock PENDLE for vePENDLE voting power', false FROM airdrop_projects WHERE project_name='Pendle Points Market';

-- dYdX
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Trade perpetuals on dYdX v4 chain', true FROM airdrop_projects WHERE project_name='dYdX Season Rewards'
UNION ALL SELECT id, 'staking', 'Stake DYDX tokens on dYdX Chain', false FROM airdrop_projects WHERE project_name='dYdX Season Rewards'
UNION ALL SELECT id, 'governance', 'Vote on dYdX governance proposals', false FROM airdrop_projects WHERE project_name='dYdX Season Rewards';

-- Manta
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge assets to Manta Pacific', true FROM airdrop_projects WHERE project_name='Manta Pacific Points'
UNION ALL SELECT id, 'staking', 'Stake on Manta Pacific for New Paradigm points', true FROM airdrop_projects WHERE project_name='Manta Pacific Points'
UNION ALL SELECT id, 'defi', 'Use zkDeFi applications on Manta', false FROM airdrop_projects WHERE project_name='Manta Pacific Points';

-- Drift
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Trade perpetuals on Drift Protocol', true FROM airdrop_projects WHERE project_name='Drift Protocol'
UNION ALL SELECT id, 'defi', 'Deposit into Drift insurance fund', false FROM airdrop_projects WHERE project_name='Drift Protocol'
UNION ALL SELECT id, 'defi', 'Use Drift BET prediction markets', false FROM airdrop_projects WHERE project_name='Drift Protocol';

-- Kamino
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Provide liquidity in Kamino vaults', true FROM airdrop_projects WHERE project_name='Kamino Finance S2'
UNION ALL SELECT id, 'defi', 'Use Kamino Multiply or Borrow/Lend', true FROM airdrop_projects WHERE project_name='Kamino Finance S2'
UNION ALL SELECT id, 'staking', 'Stake KMNO tokens', false FROM airdrop_projects WHERE project_name='Kamino Finance S2';

-- OKX Jumpstart
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'staking', 'Hold minimum OKB balance for Jumpstart eligibility', true FROM airdrop_projects WHERE project_name='OKX Jumpstart - Orderly Network'
UNION ALL SELECT id, 'kyc', 'Complete KYC on OKX', true FROM airdrop_projects WHERE project_name='OKX Jumpstart - Orderly Network';

-- Bybit Launchpool
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'staking', 'Stake USDT or MNT in active Launchpool', true FROM airdrop_projects WHERE project_name='Bybit Launchpool'
UNION ALL SELECT id, 'kyc', 'Complete identity verification on Bybit', true FROM airdrop_projects WHERE project_name='Bybit Launchpool';

-- Gate.io
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'staking', 'Hold GT tokens for Startup participation rights', true FROM airdrop_projects WHERE project_name='Gate.io Startup'
UNION ALL SELECT id, 'kyc', 'Complete KYC on Gate.io', true FROM airdrop_projects WHERE project_name='Gate.io Startup';

-- Bitget
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'staking', 'Stake BGB or USDT in PoolX campaigns', true FROM airdrop_projects WHERE project_name='Bitget PoolX'
UNION ALL SELECT id, 'kyc', 'Complete verification on Bitget', true FROM airdrop_projects WHERE project_name='Bitget PoolX';

-- Optimism
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'governance', 'Delegate OP tokens and vote on proposals', true FROM airdrop_projects WHERE project_name='Optimism RetroPGF'
UNION ALL SELECT id, 'contribution', 'Contribute to Optimism public goods projects', true FROM airdrop_projects WHERE project_name='Optimism RetroPGF'
UNION ALL SELECT id, 'defi', 'Use OP Mainnet dApps regularly', false FROM airdrop_projects WHERE project_name='Optimism RetroPGF';

-- Arbitrum
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Use STIP-funded Arbitrum dApps (GMX, Camelot, etc.)', true FROM airdrop_projects WHERE project_name='Arbitrum STIP Bridge'
UNION ALL SELECT id, 'bridge', 'Bridge assets to Arbitrum One', true FROM airdrop_projects WHERE project_name='Arbitrum STIP Bridge';

-- Sei
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'bridge', 'Bridge assets to Sei V2', true FROM airdrop_projects WHERE project_name='Sei V2 Airdrop'
UNION ALL SELECT id, 'defi', 'Use DragonSwap or Yei Finance on Sei', true FROM airdrop_projects WHERE project_name='Sei V2 Airdrop';

-- Parcl
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Trade real estate price indexes on Parcl', true FROM airdrop_projects WHERE project_name='Parcl Points'
UNION ALL SELECT id, 'defi', 'Provide liquidity to Parcl pools', false FROM airdrop_projects WHERE project_name='Parcl Points';

-- Celestia
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'node', 'Run a Celestia light node', true FROM airdrop_projects WHERE project_name='Celestia Modular Fellows'
UNION ALL SELECT id, 'contribution', 'Contribute to Celestia open-source repos', false FROM airdrop_projects WHERE project_name='Celestia Modular Fellows';

-- Base
INSERT INTO airdrop_tasks (project_id, task_type, description, required)
SELECT id, 'defi', 'Swap on Aerodrome or Uniswap on Base', true FROM airdrop_projects WHERE project_name='Base Onchain Summer'
UNION ALL SELECT id, 'nft', 'Mint NFTs during Onchain Summer campaign', false FROM airdrop_projects WHERE project_name='Base Onchain Summer';
