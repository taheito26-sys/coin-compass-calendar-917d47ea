# Merchant Lending and Profit-Sharing System Logic for Taheito Pro X

## Executive Summary

The merchant module in Taheito Pro X should be designed as a **counterparty capital, settlement, and profit-sharing system**, not as a simple CRM page. The business reality described requires the system to track principal, inventory sales, profit-sharing, pooled capital, settlements, disputes, and communication separately.

The most important design principle is this:

> **Treat principal, inventory sale margin, and profit-share as three separate engines, then unify them through a shared settlement, messaging, and reporting layer.**

If the site treats all merchant interactions as one generic "deal", the numbers will become misleading and disputes will follow.

---

## 1. System Purpose

The merchant system must support merchants who work with each other in P2P OTC cash and USDT trading, especially in the following cases:

1. One merchant sends USDT or cash to another merchant temporarily, and receives the same principal back later.
2. One merchant sells USDT to another merchant at a lower price.
3. One merchant funds another merchant's trade and receives an agreed share of the net profit, for example 30 percent or 40 percent.
4. One merchant leaves capital with another merchant for a month or longer, and receives periodic profit.
5. Merchants need structured comments, corrections, and dispute handling on deals.
6. Merchants need a searchable public profile, directory presence, invitation requests, and an inbox.

---

## 2. The Four Merchant Economics That Must Stay Separate

The system must separate the following four economic relationships:

### A. Temporary Advance, Principal Only
A merchant sends capital, USDT or cash, to another merchant, and later receives the same amount back.

- This is **not a sale**
- This is **not revenue**
- This should be tracked as **merchant receivable / capital advance**

### B. Merchant Purchase
A merchant sends USDT to another merchant at an agreed lower price and that other merchant buys it.

- This is **not lending**
- This is an **inventory sale**
- Profit comes from **sale margin**

### C. Deal-Specific Profit Share
A merchant provides capital so another merchant can execute a specific deal, and the capital owner receives a defined share of the net profit.

- This is **not an ordinary sale**
- This is **capital deployment plus profit-sharing**

### D. Managed Monthly Capital Pool
A merchant leaves USDT or cash with another merchant to work with continuously, and receives profit at month-end or another cycle.

- This is **not one deal**
- This is a **managed capital pool**

If these four are mixed into one workflow, the system will report false profit and false balances.

---

## 3. Core Accounting Model

The merchant system should use an internal ledger that separates assets, liabilities, income, and expenses.

### Recommended Accounts

#### Assets
- USDT Wallet / Stock
- Cash on Hand
- Merchant Advance Receivable
- Merchant Trade Receivable
- Merchant Profit Share Receivable
- Merchant Pool Capital Receivable
- Merchant Fee Receivable
- Expected Loss Reserve

#### Liabilities
- Merchant Payable
- Unearned Settlement Adjustments
- User-to-user unsettled transfer liability

#### Income
- Inventory Sale Margin
- Merchant Profit Share Income
- Merchant Financing Fee Income
- Late Fee / Service Fee Income

#### Expenses
- Network Fees
- Transfer Fees
- Write-offs / Bad Debt
- Correction Adjustments
- Shared Loss Allocation Expense

### Accounting Rule
Do not net receivables against payables automatically. Do not mix principal, margin, and profit-share into one balance.

The system should show gross positions first, then support explicit settlement or netting only when both parties agree.

---

## 4. Currency and Data Capture Rules

Every merchant transaction should store:

- Entered amount
- Entered currency
- USDT quantity
- Unit rate, QAR per USDT
- Base amount in reporting currency
- Fee amount and fee currency
- Timestamp
- Transfer reference
- Creator
- Counterparty
- Confirmer
- Source wallet
- Destination wallet
- Related order ID, optional
- Deal class

A value without currency and quantity context is not enough. For example, "20,000" alone is meaningless.

---

## 5. Merchant Deal Classes and Logic

## 5.1 Merchant Advance, Principal Return Only

### Use Case
A merchant sends USDT or cash to another merchant and receives the same amount back later.

### Required Fields
- Merchant
- Advance ID
- Currency
- Principal amount
- Sent date
- Expected return date
- Transfer proof
- Optional service fee
- Status
- Notes

### Status Flow
Draft -> Sent -> Acknowledged -> Partially Returned / Returned / Overdue / Written Off

### Balance Formula
**Outstanding Principal = Principal Sent - Principal Returned - Approved Offsets**

### Profit Logic
Default profit is zero unless:
- A fee is charged
- A spread is charged
- A late fee is charged

### Dashboard
- Capital Out with Merchant
- Outstanding principal
- Days outstanding
- Overdue amount
- Collection risk

### Journal Logic
When sent:
- Dr Merchant Advance Receivable
- Cr USDT Wallet / Cash

When returned:
- Dr USDT Wallet / Cash
- Cr Merchant Advance Receivable

When fee is recognized:
- Dr Merchant Fee Receivable or Cash
- Cr Financing / Service Fee Income

---

## 5.2 Merchant Purchase, Sale of USDT to Merchant

### Use Case
A merchant sends USDT to another merchant at an agreed lower price and the merchant buys it.

### Required Fields
- Merchant
- Sale ID
- Qty in USDT
- Sale rate
- Cost basis snapshot
- Total sale value
- Due date
- Payment method
- Transfer proof
- Optional link to trade or order

### Profit Formula
**Sale Margin = Sale Proceeds - Cost Basis of USDT Sold - Fees**

### Key Rule
The sold quantity leaves your stock immediately. It must not remain under merchant advance balances.

### Dashboard
- Receivable if unpaid
- Realized sale margin
- Average merchant purchase rate
- Outstanding merchant trade receivable

---

## 5.3 Deal-Specific Profit Share

### Use Case
A merchant funds another merchant's trade and receives an agreed percentage of the net profit.

### Required Fields
- Funding merchant, capital owner
- Operating merchant, deal executor
- Deal ID
- Related order ID, optional
- Capital contributed
- Currency and USDT quantity
- Agreed owner ratio
- Agreed operator ratio
- Loss rule
- Fee rule
- Principal guarantee rule
- Open date
- Close date
- Final proceeds
- Final cost
- Final fees
- Approved corrections
- Settlement due date

### Three Result Layers
1. **Principal Layer**  
   How much capital was contributed and how much is still owed back?

2. **Deal Net Profit Layer**  
   What was the actual economic result of the deal?

3. **Profit Allocation Layer**  
   How should the net profit be split?

### Profit Formula
**Net Deal Profit = Gross Proceeds - Cost of USDT / Cash Used - Network Fees - Transfer Fees - Deal Expenses - Approved Corrections**

### Allocation Formulas
**Capital Owner Share = Net Deal Profit × Owner Ratio**  
**Operating Merchant Share = Net Deal Profit × Operator Ratio**

### Required Loss Policy
The relationship must define one of these policies:
1. Operator bears all loss
2. Loss shared by agreed ratio
3. Loss capped to capital owner's principal
4. No profit-sharing until prior losses are recovered

### Dashboard
When a funded deal is closed:
- Capital owner sees:
  - Principal outstanding
  - Realized net profit
  - Owner share due
  - Unpaid owner share
  - Comments or queries
- Operator sees:
  - Operator share
  - Due back to owner
  - Pending correction flags

### Journal Logic
When principal is sent:
- Dr Merchant Profit-Share Principal Receivable
- Cr USDT Wallet / Cash

When profit is confirmed:
- Dr Merchant Profit Share Receivable
- Cr Merchant Profit Share Income

When principal is returned:
- Dr USDT Wallet / Cash
- Cr Merchant Profit-Share Principal Receivable

When profit is paid:
- Dr USDT Wallet / Cash
- Cr Merchant Profit Share Receivable

---

## 5.4 Managed Monthly Capital Pool

### Use Case
A merchant leaves some USDT or cash with another merchant to work with continuously and receives profit at month-end.

### Required Fields
- Pool ID
- Merchant
- Start date
- Initial capital
- Top-ups
- Withdrawals
- Minimum reserve
- Profit split ratio
- Loss carry-forward rule
- Payout cycle
- Settlement cutoff day
- Statement lock date

### Monthly Logic
At period end:

**Pool Realized Profit = Sum of Closed Deal Profits in Period - Shared Expenses - Prior Approved Adjustments**

Recommended waterfall:
1. Recover prior carried losses
2. Deduct pool fees
3. Split remaining realized profit
4. Create payout due
5. Exclude open deals from realized monthly profit

### Strong Recommendation
Use a **loss carry-forward / high-water mark** rule by default.

### Dashboard
- Capital held by merchant
- Deployed capital
- Idle capital
- Month realized profit
- Unpaid prior month profit
- Carried loss
- Effective yield
- Concentration risk

---

## 6. Merchant Onboarding Flow

When a user opens the Merchant page for the first time, the system should guide them through setup.

### Step 1, Create Merchant Profile
Fields:
- Full name
- Nickname
- System-generated Merchant User ID
- Profile image, optional
- Country and city, optional
- Public profile toggle
- Searchable in directory toggle
- Preferred settlement currencies
- Default contact methods
- Terms acceptance

### Step 2, Operating Preferences
- Capital owner, operator, or both
- Accept funded deals
- Accept managed capital pools
- Default profit ratio template
- Default settlement cycle

### Step 3, Trust Layer
- Verification status
- Joined date
- Completed deals count
- Rating, future phase
- Dispute ratio, future phase

### Step 4, Merchant Network
Allow the user to:
- Search by Merchant User ID
- Browse public directory
- Send invite
- Create a private offline merchant record

The system should support both platform merchants and offline counterparties.

---

## 7. Directory and Connection Model

The directory should support both public discovery and direct search.

### Public Directory
Shows merchants who enabled public visibility.

### Direct Search
Search by Merchant User ID and send a connection request.

### Connection Workflow
Requested -> Accepted -> Active -> Suspended / Blocked

Once connected, merchants can:
- Create deals
- View shared deal history
- Open inbox
- Send correction requests
- Settle balances

---

## 8. Deal Workspace Structure

Each merchant relationship should have these tabs:

1. Overview
2. Advances
3. Sales
4. Profit-share Deals
5. Capital Pools
6. Comments / Inbox

### Overview KPIs
- Total capital sent
- Capital returned
- Outstanding principal
- Realized profit
- Unpaid profit
- Overdue items
- Open disputes
- Latest message
- Relationship status

---

## 9. Comments, Queries, and Corrections

The system should support comments and correction requests inside each deal, not only through generic chat.

### Deal Timeline Events
- Deal created
- Capital sent
- Acknowledged
- Supporting proof uploaded
- Final outcome entered
- Ratio calculated
- Counterparty accepted
- Correction requested
- Correction approved or rejected
- Settlement completed

### Correction Request Object
- Requester
- Field being challenged
- Old value
- Proposed new value
- Reason
- Evidence attachment
- Status
- Approver
- Approved adjustment value

### Rule
Once both parties accept a deal, the system must not overwrite the original values directly. Any change should be recorded through an adjustment or correction entry.

---

## 10. Merchant Inbox

The inbox should have two modes.

### A. Relationship Inbox
General communication between connected merchants.

### B. Deal-Linked Thread
Messages attached to a specific advance, sale, profit-share deal, or capital pool settlement.

### Message Types
- Normal
- Query
- Correction request
- Payment reminder
- Settlement confirmation
- Dispute

This keeps communication useful and auditable.

---

## 11. Settlement Engine

The system must separate deal recording from settlement.

### Supported Settlement Types
- USDT transfer
- Cash handoff
- Bank transfer
- Internal offset
- Monthly statement settlement

### Settlement Scope
A settlement can clear:
- Principal only
- Profit only
- Fees only
- Mixed batch

### Recommended Settlement Waterfall
1. Overdue fees
2. Overdue profit due
3. Oldest principal due
4. Current profit due
5. Current principal due

### Key Rule
Do not net balances automatically. First show gross balances, then allow a formal net settlement proposal if both parties agree.

---

## 12. Merchant Dashboard Metrics

The merchant dashboard should include:

- Total capital deployed with merchants
- Outstanding principal
- Overdue principal
- Realized merchant profit, MTD
- Unpaid profit due
- Profit by merchant
- Profit by deal type
- Average deal duration
- Average yield on deployed capital
- Managed capital currently held by merchants
- Pool utilization rate
- Loss carry-forward balance
- Dispute count
- Settlement turnaround days
- Top 5 merchant concentration share

### Merchant Card View
For each merchant, show:
- Current outstanding
- Unpaid profit
- This month realized profit
- Overdue flags
- Trust status
- Last interaction

---

## 13. Minimum Data Objects

The backend should at minimum contain:

- `user_profiles`
- `merchant_profiles`
- `merchant_connections`
- `merchant_relationship_terms`
- `merchant_deals`
- `merchant_deal_funding_lines`
- `merchant_profit_allocations`
- `merchant_pool_accounts`
- `merchant_pool_periods`
- `merchant_settlements`
- `merchant_comments`
- `merchant_messages`
- `merchant_attachments`
- `merchant_adjustments`
- `merchant_balance_snapshots`

### Important Table
`merchant_relationship_terms` should store:
- Default ratio
- Loss policy
- Settlement cycle
- Allowed currencies
- Allowed deal classes
- Whether advances, sales, funded deals, and pools are enabled

---

## 14. Rules Engine, What Should Be Automatic

The system should automatically:

- Generate merchant ID on profile creation
- Inherit default ratio from relationship terms
- Calculate owner share and operator share when deal closes
- Create outstanding principal when capital is sent
- Mark balances overdue after due date
- Generate month-end pool statement
- Notify both parties of correction requests
- Freeze accepted economics from direct editing
- Use adjustment entries instead of overwriting accepted numbers
- Support reserve or risk scoring for overdue receivables

---

## 15. What Should Not Be Built

The merchant module should **not** be designed as:

- One generic merchant transaction form
- One net balance number per merchant
- Editable accepted deals
- Profit calculation without fee lines
- Monthly profit-sharing without loss carry-forward logic
- Directory that only works with user ID search
- Inbox disconnected from deals

These shortcuts make the system easy to build but unreliable in real use.

---

## 16. Recommended Final Module Structure

Inside Taheito Pro X, the Merchant module should be structured as:

- My Merchant Profile
- Directory
- Connections
- Deals
  - Advances
  - Sales
  - Profit-share
- Capital Pools
- Settlements
- Inbox
- Reports

---

## 17. Final Design Principle

The right architecture is:

**Separate principal tracking, inventory sale margin, and profit-share logic into distinct engines, then connect them through shared settlements, messaging, reporting, and audit controls.**

That is the complete business logic foundation for the merchant lending and profit calculation system inside Taheito Pro X.
