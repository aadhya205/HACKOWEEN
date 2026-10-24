/**
 * Shared Data Contract for Ledger of the Undead
 * 
 * Strict contract fields preserved:
 * - ring_id: string
 * - accounts: string[]
 * - edges: Array<{ from: string, to: string, amount: number }>
 * - total_amount: number
 * - risk: number (0 - 100)
 * - explanation: string
 */

export const SAMPLE_ALERTS = [
  {
    ring_id: "RING-001",
    accounts: ["ACC-9041", "ACC-1204", "ACC-3319", "ACC-5512", "ACC-7820", "ACC-8411"],
    edges: [
      { from: "ACC-1204", to: "ACC-9041", amount: 28500 },
      { from: "ACC-3319", to: "ACC-9041", amount: 28500 },
      { from: "ACC-5512", to: "ACC-9041", amount: 28500 },
      { from: "ACC-7820", to: "ACC-9041", amount: 28500 },
      { from: "ACC-8411", to: "ACC-9041", amount: 28500 }
    ],
    total_amount: 142500,
    risk: 94,
    explanation: "Multiple newly created mule accounts received simultaneous off-shore deposits and immediately funneled near-identical amounts ($28,500) into a single consolidation node within 9 minutes.",
    // Supplementary display metadata
    label: "Funnel / Mule Consolidation Ring",
    typology: "Fan-In Funnel",
    detection_time: "2026-10-24 07:18:22 UTC",
    severity: "Critical",
    status: "Open",
    patterns: [
      {
        title: "Fan-In Funneling",
        detail: "5 peripheral accounts routing 100% of incoming funds to single sink node ACC-9041.",
        confidence: "99.2%"
      },
      {
        title: "Identical Tranche Amounts",
        detail: "Zero variance across 5 independent transfers ($28,500.00 each), indicating automated orchestration.",
        confidence: "98.7%"
      },
      {
        title: "High Velocity Pass-Through",
        detail: "Mean holding duration across source nodes under 180 seconds before forward dispatch.",
        confidence: "94.5%"
      }
    ],
    timeline: [
      { id: "TX-9011-A", from: "ACC-1204", to: "ACC-9041", amount: 28500, time: "07:12:04", status: "Flagged" },
      { id: "TX-9011-B", from: "ACC-3319", to: "ACC-9041", amount: 28500, time: "07:13:31", status: "Flagged" },
      { id: "TX-9011-C", from: "ACC-5512", to: "ACC-9041", amount: 28500, time: "07:15:19", status: "Flagged" },
      { id: "TX-9011-D", from: "ACC-7820", to: "ACC-9041", amount: 28500, time: "07:17:02", status: "Flagged" },
      { id: "TX-9011-E", from: "ACC-8411", to: "ACC-9041", amount: 28500, time: "07:18:22", status: "Flagged" }
    ]
  },
  {
    ring_id: "RING-002",
    accounts: ["ACC-2091", "ACC-4102", "ACC-6173", "ACC-8834", "ACC-9921"],
    edges: [
      { from: "ACC-2091", to: "ACC-4102", amount: 87400 },
      { from: "ACC-4102", to: "ACC-6173", amount: 86900 },
      { from: "ACC-6173", to: "ACC-8834", amount: 86400 },
      { from: "ACC-8834", to: "ACC-9921", amount: 85900 }
    ],
    total_amount: 87400,
    risk: 83,
    explanation: "Sequential 4-hop chain layering designed to obfuscate source origin, displaying gradual fee-skimming ($500 per hop) across intermediary shell accounts.",
    label: "Chain Layering / Multi-Hop Pipeline",
    typology: "Daisy Chain Layering",
    detection_time: "2026-10-24 06:45:10 UTC",
    severity: "High",
    status: "Open",
    patterns: [
      {
        title: "Multi-Hop Rapid Pass-Through",
        detail: "Funds navigated 4 intermediary accounts across distinct jurisdictions in under 12 minutes.",
        confidence: "91.8%"
      },
      {
        title: "Layering Fee Attrition",
        detail: "Deterministic $500 fee deduction at each hop consistent with courier laundering cut.",
        confidence: "95.1%"
      },
      {
        title: "Shell Corporation Nodes",
        detail: "Accounts ACC-4102 and ACC-6173 registered with fictitious corporate business registration codes.",
        confidence: "88.4%"
      }
    ],
    timeline: [
      { id: "TX-8820-A", from: "ACC-2091", to: "ACC-4102", amount: 87400, time: "06:33:14", status: "Flagged" },
      { id: "TX-8820-B", from: "ACC-4102", to: "ACC-6173", amount: 86900, time: "06:37:05", status: "Flagged" },
      { id: "TX-8820-C", from: "ACC-6173", to: "ACC-8834", amount: 86400, time: "06:41:22", status: "Flagged" },
      { id: "TX-8820-D", from: "ACC-8834", to: "ACC-9921", amount: 85900, time: "06:45:10", status: "Flagged" }
    ]
  },
  {
    ring_id: "RING-003",
    accounts: ["ACC-3101", "ACC-4520", "ACC-7741", "ACC-8390"],
    edges: [
      { from: "ACC-3101", to: "ACC-4520", amount: 55000 },
      { from: "ACC-4520", to: "ACC-7741", amount: 53800 },
      { from: "ACC-7741", to: "ACC-8390", amount: 53200 },
      { from: "ACC-8390", to: "ACC-3101", amount: 53000 },
      { from: "ACC-3101", to: "ACC-7741", amount: 15000 }
    ],
    total_amount: 230000,
    risk: 76,
    explanation: "Closed circular transaction velocity with high turnover between interconnected entities, generating synthetic trade volume and round-trip capital flight.",
    label: "Cyclic Wash Trading Ring",
    typology: "Circular Round-Trip",
    detection_time: "2026-10-24 05:22:48 UTC",
    severity: "High",
    status: "Open",
    patterns: [
      {
        title: "Closed Loop Topology",
        detail: "Cycles completed 1.5 full rotations back to originating entity ACC-3101 within 2 hours.",
        confidence: "96.4%"
      },
      {
        title: "Synthetic Volume Generation",
        detail: "$230,000 total transferred with net delta of only $2,000 between cycle endpoints.",
        confidence: "92.0%"
      },
      {
        title: "Cross-Liaison Shortcut",
        detail: "Secondary bypass transfer ACC-3101 -> ACC-7741 confirms coordinated synchronization.",
        confidence: "87.3%"
      }
    ],
    timeline: [
      { id: "TX-7711-A", from: "ACC-3101", to: "ACC-4520", amount: 55000, time: "04:12:00", status: "Flagged" },
      { id: "TX-7711-B", from: "ACC-4520", to: "ACC-7741", amount: 53800, time: "04:35:12", status: "Flagged" },
      { id: "TX-7711-C", from: "ACC-7741", to: "ACC-8390", amount: 53200, time: "04:58:44", status: "Flagged" },
      { id: "TX-7711-D", from: "ACC-8390", to: "ACC-3101", amount: 53000, time: "05:15:30", status: "Flagged" },
      { id: "TX-7711-E", from: "ACC-3101", to: "ACC-7741", amount: 15000, time: "05:22:48", status: "Flagged" }
    ]
  }
];

// Benign background accounts to simulate real-world financial noise
export const BENIGN_ACCOUNTS = [
  { id: "ACC-1001", label: "Atlas Corp Payroll", risk: 8, balance: 412000, status: "Normal" },
  { id: "ACC-1002", label: "BlueStar Retail POS", risk: 12, balance: 89500, status: "Normal" },
  { id: "ACC-1003", label: "Starlight Merchant", risk: 15, balance: 134200, status: "Normal" },
  { id: "ACC-1004", label: "Apex Cloud Services", risk: 5, balance: 650000, status: "Normal" },
  { id: "ACC-1005", label: "Helios Energy LLC", risk: 18, balance: 245000, status: "Normal" },
  { id: "ACC-1006", label: "Nova Digital Escrow", risk: 22, balance: 98000, status: "Normal" }
];

export const BENIGN_EDGES = [
  { from: "ACC-1001", to: "ACC-1002", amount: 14200 },
  { from: "ACC-1002", to: "ACC-1003", amount: 8900 },
  { from: "ACC-1004", to: "ACC-1005", amount: 45000 },
  { from: "ACC-1005", to: "ACC-1006", amount: 12400 },
  { from: "ACC-1003", to: "ACC-1004", amount: 7300 }
];

// Account metadata lookup
export const ACCOUNT_METADATA = {
  "ACC-9041": {
    name: "Vortex Capital Hub",
    owner: "Oleg Vance (Nominee)",
    country: "CY (Cyprus)",
    opened: "12 days ago",
    balance: 142500,
    flaggedRings: ["RING-001"],
    inDegree: 5,
    outDegree: 0,
    type: "Aggregator / Sink"
  },
  "ACC-1204": {
    name: "QuickPay Courier 01",
    owner: "Dmitri S.",
    country: "LT (Lithuania)",
    opened: "4 days ago",
    balance: 240,
    flaggedRings: ["RING-001"],
    inDegree: 1,
    outDegree: 1,
    type: "Mule / Smurf"
  },
  "ACC-3319": {
    name: "QuickPay Courier 02",
    owner: "Elena B.",
    country: "LV (Latvia)",
    opened: "6 days ago",
    balance: 190,
    flaggedRings: ["RING-001"],
    inDegree: 1,
    outDegree: 1,
    type: "Mule / Smurf"
  },
  "ACC-5512": {
    name: "QuickPay Courier 03",
    owner: "Marek K.",
    country: "PL (Poland)",
    opened: "3 days ago",
    balance: 510,
    flaggedRings: ["RING-001"],
    inDegree: 1,
    outDegree: 1,
    type: "Mule / Smurf"
  },
  "ACC-7820": {
    name: "QuickPay Courier 04",
    owner: "Lukas P.",
    country: "EE (Estonia)",
    opened: "5 days ago",
    balance: 310,
    flaggedRings: ["RING-001"],
    inDegree: 1,
    outDegree: 1,
    type: "Mule / Smurf"
  },
  "ACC-8411": {
    name: "QuickPay Courier 05",
    owner: "Klara N.",
    country: "CZ (Czechia)",
    opened: "2 days ago",
    balance: 150,
    flaggedRings: ["RING-001"],
    inDegree: 1,
    outDegree: 1,
    type: "Mule / Smurf"
  },
  "ACC-2091": {
    name: "Nordic Seed Funding",
    owner: "Shell Holding ApS",
    country: "DK (Denmark)",
    opened: "45 days ago",
    balance: 3200,
    flaggedRings: ["RING-002"],
    inDegree: 0,
    outDegree: 1,
    type: "Origin Node"
  },
  "ACC-4102": {
    name: "Baltic Trade Logistics",
    owner: "Kestrel Services Ltd",
    country: "MT (Malta)",
    opened: "19 days ago",
    balance: 500,
    flaggedRings: ["RING-002"],
    inDegree: 1,
    outDegree: 1,
    type: "Intermediary Layer"
  },
  "ACC-6173": {
    name: "Helvetic Advisory Corp",
    owner: "Zeta Consulting GMBH",
    country: "CH (Switzerland)",
    opened: "28 days ago",
    balance: 500,
    flaggedRings: ["RING-002"],
    inDegree: 1,
    outDegree: 1,
    type: "Intermediary Layer"
  },
  "ACC-8834": {
    name: "Emirates Trade Clearing",
    owner: "Apex FZE",
    country: "AE (UAE)",
    opened: "14 days ago",
    balance: 500,
    flaggedRings: ["RING-002"],
    inDegree: 1,
    outDegree: 1,
    type: "Intermediary Layer"
  },
  "ACC-9921": {
    name: "Pacific Offshore Trust",
    owner: "Blackwood Nominees",
    country: "SC (Seychelles)",
    opened: "90 days ago",
    balance: 85900,
    flaggedRings: ["RING-002"],
    inDegree: 1,
    outDegree: 0,
    type: "Exit Terminal Node"
  },
  "ACC-3101": {
    name: "Krypton Global Holdings",
    owner: "Victor Vance",
    country: "VG (BVI)",
    opened: "180 days ago",
    balance: 78000,
    flaggedRings: ["RING-003"],
    inDegree: 1,
    outDegree: 2,
    type: "Origin / Re-entry Loop"
  },
  "ACC-4520": {
    name: "SilkRoad Freight Direct",
    owner: "H. Chen",
    country: "SG (Singapore)",
    opened: "60 days ago",
    balance: 1200,
    flaggedRings: ["RING-003"],
    inDegree: 1,
    outDegree: 1,
    type: "Loop Transit"
  },
  "ACC-7741": {
    name: "EuroBourse Settlements",
    owner: "G. Rossi",
    country: "IT (Italy)",
    opened: "75 days ago",
    balance: 2100,
    flaggedRings: ["RING-003"],
    inDegree: 2,
    outDegree: 1,
    type: "Loop Transit"
  },
  "ACC-8390": {
    name: "Cayman Trade Liquidity",
    owner: "T. Sterling",
    country: "KY (Cayman Islands)",
    opened: "110 days ago",
    balance: 200,
    flaggedRings: ["RING-003"],
    inDegree: 1,
    outDegree: 1,
    type: "Loop Transit"
  }
};

export const INITIAL_ACTIVITY_LOG = [
  {
    id: "LOG-101",
    timestamp: "2026-10-24 07:18:22",
    type: "ALERT_GENERATED",
    ring_id: "RING-001",
    title: "Critical Risk Detected",
    description: "Automated engine flagged high-velocity fan-in consolidation on ACC-9041.",
    badge: "CRITICAL"
  },
  {
    id: "LOG-102",
    timestamp: "2026-10-24 06:45:10",
    type: "ALERT_GENERATED",
    ring_id: "RING-002",
    title: "Chain Layering Alert",
    description: "4-hop rapid pass-through pattern matched with fee attrition signatures.",
    badge: "HIGH"
  },
  {
    id: "LOG-103",
    timestamp: "2026-10-24 05:22:48",
    type: "ALERT_GENERATED",
    ring_id: "RING-003",
    title: "Cyclic Volume Anomaly",
    description: "Round-trip transaction loop completed across 4 accounts.",
    badge: "HIGH"
  }
];
