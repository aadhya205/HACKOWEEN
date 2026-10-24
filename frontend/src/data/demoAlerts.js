/**
 * Demo alert data following the shared data contract.
 * Field names: ring_id, accounts, edges, from, to, amount, total_amount, risk, explanation
 * DO NOT rename these fields — they are shared with the backend team.
 */

const demoAlerts = [
  {
    ring_id: "RING-001",
    accounts: ["C1001", "C1002", "C1003", "C1004", "C1005"],
    edges: [
      { from: "C1001", to: "C1005", amount: 9500 },
      { from: "C1002", to: "C1005", amount: 9400 },
      { from: "C1003", to: "C1005", amount: 9600 },
      { from: "C1004", to: "C1005", amount: 9500 },
      { from: "C1001", to: "C1002", amount: 2000 },
      { from: "C1003", to: "C1004", amount: 1800 },
    ],
    total_amount: 41800,
    risk: 94,
    explanation:
      "Four accounts (C1001–C1004) each transferred nearly identical amounts (~$9,500) to a single destination account C1005 within a 48-hour window. The amounts appear calibrated to stay below the $10,000 reporting threshold. Accounts C1001↔C1002 and C1003↔C1004 also show lateral transfers suggesting coordination.",
    score_breakdown: [
      { feature: "Linked accounts", raw: 5, normalized: 0.8, weight: 25.0, contribution: 20.0, note: "5 clustered accounts" },
      { feature: "Time window (seconds)", raw: 180.0, normalized: 0.9, weight: 25.0, contribution: 22.5, note: "Under 3 minutes" },
      { feature: "Amount similarity", raw: 0.98, normalized: 0.98, weight: 20.0, contribution: 19.6, note: "Near identical $9,500" },
      { feature: "Total amount moved", raw: 41800.0, normalized: 0.85, weight: 15.0, contribution: 12.75, note: null },
      { feature: "Account newness", raw: 0.95, normalized: 0.95, weight: 15.0, contribution: 14.25, note: "First-time transfers" },
    ],
    explanation_source: "template",
  },
  {
    ring_id: "RING-002",
    accounts: ["C2010", "C2011", "C2012", "C2013", "C2014", "C2015"],
    edges: [
      { from: "C2010", to: "C2011", amount: 25000 },
      { from: "C2011", to: "C2012", amount: 24200 },
      { from: "C2012", to: "C2013", amount: 23500 },
      { from: "C2013", to: "C2014", amount: 22800 },
      { from: "C2014", to: "C2015", amount: 22000 },
    ],
    total_amount: 117500,
    risk: 87,
    explanation:
      "Funds moved through a chain of six accounts (C2010 → C2015) in rapid succession. Each hop reduced the transfer amount by a small margin, consistent with layering — a technique used to obscure the origin of funds. The entire chain executed within 72 hours with no apparent business relationship between accounts.",
    score_breakdown: [
      { feature: "Linked accounts", raw: 6, normalized: 0.85, weight: 25.0, contribution: 21.25, note: "6 daisy chain accounts" },
      { feature: "Time window (seconds)", raw: 420.0, normalized: 0.75, weight: 25.0, contribution: 18.75, note: "Rapid pass-through" },
      { feature: "Amount similarity", raw: 0.88, normalized: 0.88, weight: 20.0, contribution: 17.6, note: "Gradual $500 fee deduction" },
      { feature: "Total amount moved", raw: 117500.0, normalized: 1.0, weight: 15.0, contribution: 15.0, note: null },
      { feature: "Account newness", raw: 0.9, normalized: 0.9, weight: 15.0, contribution: 13.5, note: null },
    ],
    explanation_source: "template",
  },
  {
    ring_id: "RING-003",
    accounts: ["C3020", "C3021", "C3022", "C3023"],
    edges: [
      { from: "C3020", to: "C3021", amount: 5000 },
      { from: "C3021", to: "C3022", amount: 5000 },
      { from: "C3022", to: "C3023", amount: 5000 },
      { from: "C3023", to: "C3020", amount: 5000 },
      { from: "C3020", to: "C3022", amount: 5000 },
      { from: "C3021", to: "C3023", amount: 5000 },
    ],
    total_amount: 30000,
    risk: 72,
    explanation:
      "A tightly connected group of four accounts exchanged identical $5,000 transfers in a circular pattern. Every account both sent and received funds from at least two others, forming a dense mesh. This pattern is consistent with round-tripping — artificially inflating transaction volume to simulate legitimate business activity.",
    score_breakdown: [
      { feature: "Linked accounts", raw: 4, normalized: 0.65, weight: 25.0, contribution: 16.25, note: "4 circular nodes" },
      { feature: "Time window (seconds)", raw: 600.0, normalized: 0.65, weight: 25.0, contribution: 16.25, note: "Continuous loop" },
      { feature: "Amount similarity", raw: 1.0, normalized: 1.0, weight: 20.0, contribution: 20.0, note: "Identical $5,000 round-trip" },
      { feature: "Total amount moved", raw: 30000.0, normalized: 0.6, weight: 15.0, contribution: 9.0, note: null },
      { feature: "Account newness", raw: 0.7, normalized: 0.7, weight: 15.0, contribution: 10.5, note: null },
    ],
    explanation_source: "template",
  },
];

export const accountMetadata = {
  C1001: { name: "Shell Corp Alpha LLC", type: "Business", opened: "2025-03-12", region: "US-East" },
  C1002: { name: "NovaTrade Holdings", type: "Business", opened: "2025-04-01", region: "US-East" },
  C1003: { name: "Vertex Capital Inc", type: "Business", opened: "2025-02-18", region: "US-South" },
  C1004: { name: "Pinnacle Assets Group", type: "Business", opened: "2025-05-09", region: "US-West" },
  C1005: { name: "Oceanic Ventures Ltd", type: "Business", opened: "2024-11-22", region: "Offshore" },
  C2010: { name: "J. Nakamura", type: "Personal", opened: "2024-08-15", region: "US-West" },
  C2011: { name: "FreshStart Trading Co", type: "Business", opened: "2025-01-03", region: "US-Central" },
  C2012: { name: "MarketBridge LLC", type: "Business", opened: "2025-01-10", region: "US-East" },
  C2013: { name: "Cascade Financial Svcs", type: "Business", opened: "2025-02-01", region: "EU-West" },
  C2014: { name: "DriftNet Payments AG", type: "Business", opened: "2025-02-28", region: "EU-Central" },
  C2015: { name: "Horizon Settle Ltd", type: "Business", opened: "2024-12-12", region: "Offshore" },
  C3020: { name: "QuickLedger Corp", type: "Business", opened: "2025-06-01", region: "US-East" },
  C3021: { name: "CycleFlow Ltd", type: "Business", opened: "2025-06-05", region: "US-East" },
  C3022: { name: "LoopBack Inc", type: "Business", opened: "2025-06-08", region: "US-East" },
  C3023: { name: "RoundTrip Holdings", type: "Business", opened: "2025-06-10", region: "US-East" },
  ACC7001: { name: "Apex Origin Hub", type: "Business", opened: "2024-09-01", region: "US-East" },
  ACC7002: { name: "Offshore Sink Co", type: "Business", opened: "2024-10-15", region: "Offshore" },
  MULE001: { name: "FastMule 01", type: "Personal", opened: "2025-10-01", region: "EU-West" },
  MULE002: { name: "FastMule 02", type: "Personal", opened: "2025-10-01", region: "EU-West" },
  MULE003: { name: "FastMule 03", type: "Personal", opened: "2025-10-01", region: "EU-West" },
  MULE004: { name: "FastMule 04", type: "Personal", opened: "2025-10-01", region: "EU-West" },
  MULE005: { name: "FastMule 05", type: "Personal", opened: "2025-10-01", region: "EU-West" },
  MULE006: { name: "FastMule 06", type: "Personal", opened: "2025-10-01", region: "EU-West" },
};

export const normalAccounts = ["N001", "N002", "N003", "N004", "N005", "N006", "N007", "N008"];

export const normalEdges = [
  { from: "N001", to: "N002", amount: 1200 },
  { from: "N002", to: "N003", amount: 800 },
  { from: "N003", to: "N004", amount: 3500 },
  { from: "N005", to: "N006", amount: 2100 },
  { from: "N006", to: "N001", amount: 950 },
  { from: "N007", to: "N008", amount: 4200 },
  { from: "N008", to: "N005", amount: 1750 },
  { from: "N004", to: "N007", amount: 600 },
  { from: "N001", to: "C1001", amount: 500 },
  { from: "N003", to: "C2010", amount: 300 },
  { from: "N006", to: "C3020", amount: 150 },
];

export const normalAccountMetadata = {
  N001: { name: "Greenfield Supplies", type: "Business", opened: "2023-01-15", region: "US-East" },
  N002: { name: "Metro Logistics", type: "Business", opened: "2022-09-20", region: "US-Central" },
  N003: { name: "A. Patel", type: "Personal", opened: "2021-06-10", region: "US-West" },
  N004: { name: "Summit Electronics", type: "Business", opened: "2023-05-01", region: "US-South" },
  N005: { name: "R. Johansson", type: "Personal", opened: "2022-03-14", region: "EU-North" },
  N006: { name: "Pacific Trade Corp", type: "Business", opened: "2023-08-22", region: "US-West" },
  N007: { name: "BlueLine Retail", type: "Business", opened: "2024-01-05", region: "US-East" },
  N008: { name: "Delta Services LLC", type: "Business", opened: "2023-11-18", region: "US-Central" },
};

export default demoAlerts;
