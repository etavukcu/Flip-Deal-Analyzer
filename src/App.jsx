import React, { useEffect, useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percent1 = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const STORAGE_KEY = "flip-deal-analyzer:deals:v1";

const blankRenoItems = [
  ["Plumbing", 8000],
  ["Electrical", 12000],
  ["Roof", 15000],
  ["Framing", 10000],
  ["Kitchen", 18000],
  ["Bathrooms", 14000],
  ["Flooring", 9000],
  ["Paint", 6000],
  ["Windows / Doors", 7000],
  ["HVAC", 10000],
].map(([name, amount], i) => ({ id: `reno-${i + 1}`, name, amount }));

const blankOtherCosts = [
  ["Buying Closing Costs", "percent_offer", 2],
  ["Selling Closing Costs", "percent_arv", 1.5],
  ["Real Estate Commissions", "percent_arv", 5],
  ["Financing Costs", "fixed", 12000],
  ["Holding Costs", "fixed", 8000],
  ["Insurance / Utilities / Misc.", "fixed", 5000],
].map(([name, mode, value], i) => ({ id: `cost-${i + 1}`, name, mode, value }));

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultDeal() {
  return {
    id: uid("deal"),
    name: "New Flip Deal",
    address: "",
    arv: 350000,
    sqft: 0,
    purchasePrice: 0,
    targetProfit: 40000,
    desiredMargin: 15,
    contingencyRate: 10,
    monthsHeld: 6,
    annualInterestRate: 12,
    lenderPoints: 2,
    financedPercentOfPurchase: 90,
    financedPercentOfReno: 100,
    use70Rule: false,
    rule70Percent: 70,
    notes: "",
    renovationItems: structuredClone(blankRenoItems),
    otherCosts: structuredClone(blankOtherCosts),
    updatedAt: new Date().toISOString(),
  };
}

function calculateCost(item, { arv, offer }) {
  const value = toNumber(item.value);
  if (item.mode === "percent_offer") return (offer * value) / 100;
  if (item.mode === "percent_arv") return (arv * value) / 100;
  return value;
}

function encodeDealForUrl(deal) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(deal))));
  } catch {
    return "";
  }
}

function decodeDealFromUrl(value) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}

function summarizeDeal(deal) {
  const arv = toNumber(deal.arv);
  const marginRate = toNumber(deal.desiredMargin) / 100;
  const contingencyRate = toNumber(deal.contingencyRate) / 100;
  const targetProfit = toNumber(deal.targetProfit);
  const renoBase = deal.renovationItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const contingency = renoBase * contingencyRate;
  const renoTotal = renoBase + contingency;

  const fixedAndArvCosts = deal.otherCosts.reduce((sum, item) => {
    if (item.mode === "fixed") return sum + toNumber(item.value);
    if (item.mode === "percent_arv") return sum + (arv * toNumber(item.value)) / 100;
    return sum;
  }, 0);

  const offerPctRate = deal.otherCosts.reduce((sum, item) => {
    if (item.mode === "percent_offer") return sum + toNumber(item.value) / 100;
    return sum;
  }, 0);

  const offerByProfit = (arv - renoTotal - fixedAndArvCosts - targetProfit) / (1 + offerPctRate);
  const offerByMargin = (arv * (1 - marginRate) - renoTotal - fixedAndArvCosts) / (1 + offerPctRate);
  const offerBy70 = arv * (toNumber(deal.rule70Percent) / 100) - renoBase;

  let recommendedOffer = Math.max(0, Math.min(offerByProfit, offerByMargin));
  if (deal.use70Rule) recommendedOffer = Math.max(0, Math.min(recommendedOffer, offerBy70));

  const otherCostsDetailed = deal.otherCosts.map((item) => ({
    ...item,
    calculated: calculateCost(item, { arv, offer: recommendedOffer }),
  }));

  const otherCostsTotal = otherCostsDetailed.reduce((sum, item) => sum + item.calculated, 0);
  const totalProjectCost = recommendedOffer + renoTotal + otherCostsTotal;
  const projectedProfit = arv - totalProjectCost;
  const projectedMargin = arv ? projectedProfit / arv : 0;

  const financedPurchase = recommendedOffer * (toNumber(deal.financedPercentOfPurchase) / 100);
  const financedReno = renoBase * (toNumber(deal.financedPercentOfReno) / 100);
  const totalLoanBasis = financedPurchase + financedReno;
  const estimatedPointsCost = totalLoanBasis * (toNumber(deal.lenderPoints) / 100);
  const estimatedInterestCarry =
    totalLoanBasis * (toNumber(deal.annualInterestRate) / 100) * (toNumber(deal.monthsHeld) / 12);
  const cashNeededBeforeReserves = totalProjectCost - totalLoanBasis;

  return {
    arv,
    renoBase,
    contingency,
    renoTotal,
    offerByProfit: Math.max(0, offerByProfit),
    offerByMargin: Math.max(0, offerByMargin),
    offerBy70: Math.max(0, offerBy70),
    recommendedOffer,
    otherCostsDetailed,
    otherCostsTotal,
    totalProjectCost,
    projectedProfit,
    projectedMargin,
    totalLoanBasis,
    estimatedPointsCost,
    estimatedInterestCarry,
    cashNeededBeforeReserves,
  };
}

function downloadFile(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildPrintableReport(deal, summary) {
  const renoRows = deal.renovationItems
    .map(
      (item) => `
        <tr>
          <td>${item.name || "Unnamed item"}</td>
          <td class="num">${currency.format(toNumber(item.amount))}</td>
        </tr>`
    )
    .join("");

  const costRows = summary.otherCostsDetailed
    .map(
      (item) => `
        <tr>
          <td>${item.name || "Unnamed cost"}</td>
          <td>${item.mode === "fixed" ? "Fixed $" : item.mode === "percent_offer" ? "% of Offer" : "% of ARV"}</td>
          <td class="num">${item.mode === "fixed" ? currency.format(toNumber(item.value)) : `${toNumber(item.value)}%`}</td>
          <td class="num">${currency.format(item.calculated)}</td>
        </tr>`
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Flip Deal Report</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 32px; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; border-bottom:2px solid #e2e8f0; padding-bottom:18px; margin-bottom:24px; }
          .brand { font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#64748b; }
          h1 { margin:8px 0 4px; font-size:30px; }
          h2 { margin:28px 0 12px; font-size:18px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; }
          .muted { color:#64748b; }
          .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:14px; }
          .card { border:1px solid #e2e8f0; border-radius:16px; padding:16px; }
          .label { font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#64748b; }
          .value { font-size:24px; font-weight:700; margin-top:6px; }
          table { width:100%; border-collapse:collapse; margin-top:8px; }
          th, td { border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:left; font-size:14px; vertical-align:top; }
          th { background:#f8fafc; color:#475569; }
          .num { text-align:right; white-space:nowrap; }
          .two-col { display:grid; grid-template-columns: 1fr 1fr; gap:20px; }
          .notes { white-space:pre-wrap; border:1px solid #e2e8f0; border-radius:16px; padding:16px; min-height:100px; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">Peaceful Haven Homes</div>
            <h1>Flip Deal Report</h1>
            <div class="muted">Professional Flip Deal Analyzer</div>
          </div>
          <div class="muted">Generated ${new Date().toLocaleString()}</div>
        </div>

        <h2>Deal Summary</h2>
        <div class="grid">
          <div class="card"><div class="label">Deal Name</div><div class="value" style="font-size:20px;">${deal.name || "Untitled Deal"}</div></div>
          <div class="card"><div class="label">Property Address</div><div class="value" style="font-size:20px;">${deal.address || "Not provided"}</div></div>
          <div class="card"><div class="label">ARV</div><div class="value">${currency.format(summary.arv)}</div></div>
          <div class="card"><div class="label">Recommended Offer</div><div class="value">${currency.format(summary.recommendedOffer)}</div></div>
          <div class="card"><div class="label">Projected Profit</div><div class="value">${currency.format(summary.projectedProfit)}</div></div>
          <div class="card"><div class="label">Projected Margin</div><div class="value">${percent1.format(summary.projectedMargin)}</div></div>
        </div>

        <h2>Key Assumptions</h2>
        <div class="two-col">
          <table>
            <tr><th>Input</th><th class="num">Value</th></tr>
            <tr><td>Target Profit</td><td class="num">${currency.format(toNumber(deal.targetProfit))}</td></tr>
            <tr><td>Desired Margin</td><td class="num">${toNumber(deal.desiredMargin)}%</td></tr>
            <tr><td>Contingency</td><td class="num">${toNumber(deal.contingencyRate)}%</td></tr>
            <tr><td>Use 70% Rule</td><td class="num">${deal.use70Rule ? "Yes" : "No"}</td></tr>
            <tr><td>70% Rule %</td><td class="num">${toNumber(deal.rule70Percent)}%</td></tr>
            <tr><td>Months Held</td><td class="num">${toNumber(deal.monthsHeld)}</td></tr>
          </table>
          <table>
            <tr><th>Financing</th><th class="num">Value</th></tr>
            <tr><td>Annual Interest</td><td class="num">${toNumber(deal.annualInterestRate)}%</td></tr>
            <tr><td>Lender Points</td><td class="num">${toNumber(deal.lenderPoints)}%</td></tr>
            <tr><td>Finance % of Purchase</td><td class="num">${toNumber(deal.financedPercentOfPurchase)}%</td></tr>
            <tr><td>Finance % of Reno</td><td class="num">${toNumber(deal.financedPercentOfReno)}%</td></tr>
            <tr><td>Estimated Loan Basis</td><td class="num">${currency.format(summary.totalLoanBasis)}</td></tr>
            <tr><td>Estimated Cash Needed</td><td class="num">${currency.format(summary.cashNeededBeforeReserves)}</td></tr>
          </table>
        </div>

        <h2>Rehab Budget</h2>
        <table>
          <tr><th>Line Item</th><th class="num">Amount</th></tr>
          ${renoRows}
          <tr><td><strong>Total Hard Costs</strong></td><td class="num"><strong>${currency.format(summary.renoBase)}</strong></td></tr>
          <tr><td><strong>Contingency</strong></td><td class="num"><strong>${currency.format(summary.contingency)}</strong></td></tr>
          <tr><td><strong>Reno Total</strong></td><td class="num"><strong>${currency.format(summary.renoTotal)}</strong></td></tr>
        </table>

        <h2>Other Costs</h2>
        <table>
          <tr><th>Line Item</th><th>Mode</th><th class="num">Input</th><th class="num">Calculated</th></tr>
          ${costRows}
          <tr><td colspan="3"><strong>Total Other Costs</strong></td><td class="num"><strong>${currency.format(summary.otherCostsTotal)}</strong></td></tr>
        </table>

        <h2>Offer Calculation</h2>
        <div class="grid">
          <div class="card"><div class="label">Offer by Profit Target</div><div class="value">${currency.format(summary.offerByProfit)}</div></div>
          <div class="card"><div class="label">Offer by Margin Target</div><div class="value">${currency.format(summary.offerByMargin)}</div></div>
          <div class="card"><div class="label">Offer by 70% Rule</div><div class="value">${currency.format(summary.offerBy70)}</div></div>
          <div class="card"><div class="label">Total Project Cost</div><div class="value">${currency.format(summary.totalProjectCost)}</div></div>
          <div class="card"><div class="label">Estimated Points Cost</div><div class="value">${currency.format(summary.estimatedPointsCost)}</div></div>
          <div class="card"><div class="label">Estimated Interest Carry</div><div class="value">${currency.format(summary.estimatedInterestCarry)}</div></div>
        </div>

        <h2>Notes</h2>
        <div class="notes">${deal.notes || "No notes added."}</div>
      </body>
    </html>`;
}

function exportReportPDF(deal, summary) {
  const reportWindow = window.open("", "_blank", "width=1100,height=900");
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(buildPrintableReport(deal, summary));
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 300);
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-2 text-sm text-slate-500">{hint}</div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = "1000" }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <input
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-400"
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(toNumber(e.target.value))}
      />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <input
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-400"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function LineItemsTable({ title, items, onChange }) {
  const update = (id, field, value) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: field === "amount" ? toNumber(value) : value } : item)));
  };

  const add = () => onChange([...items, { id: uid("reno"), name: "", amount: 0 }]);
  const remove = (id) => onChange(items.filter((item) => item.id !== id));
  const total = items.reduce((sum, item) => sum + toNumber(item.amount), 0);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700" onClick={add}>
          Add Reno Item
        </button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 text-left">Line Item</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="p-2">
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={item.name}
                    onChange={(e) => update(item.id, "name", e.target.value)}
                    placeholder="Line item"
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                    type="number"
                    value={item.amount}
                    step="100"
                    onChange={(e) => update(item.id, "amount", e.target.value)}
                  />
                </td>
                <td className="p-2 text-right">
                  <button className="rounded-2xl px-3 py-2 text-sm text-red-600" onClick={() => remove(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="p-3">Total Hard Costs</td>
              <td className="p-3">{currency.format(total)}</td>
              <td className="p-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OtherCostsTable({ items, onChange, summary }) {
  const update = (id, field, value) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: field === "value" ? toNumber(value) : value } : item)));
  };
  const add = () => onChange([...items, { id: uid("cost"), name: "", mode: "fixed", value: 0 }]);
  const remove = (id) => onChange(items.filter((item) => item.id !== id));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Closing, Selling, Financing, and Holding Costs</h3>
        <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700" onClick={add}>
          Add Cost Item
        </button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 text-left">Line Item</th>
              <th className="p-3 text-left">Mode</th>
              <th className="p-3 text-left">Input</th>
              <th className="p-3 text-left">Calculated</th>
              <th className="p-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const calc = calculateCost(item, { arv: summary.arv, offer: summary.recommendedOffer });
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="p-2">
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={item.name}
                      onChange={(e) => update(item.id, "name", e.target.value)}
                      placeholder="Cost item"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={item.mode}
                      onChange={(e) => update(item.id, "mode", e.target.value)}
                    >
                      <option value="fixed">Fixed $</option>
                      <option value="percent_offer">% of Offer</option>
                      <option value="percent_arv">% of ARV</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      type="number"
                      step="0.1"
                      value={item.value}
                      onChange={(e) => update(item.id, "value", e.target.value)}
                    />
                  </td>
                  <td className="p-3 font-medium text-slate-700">{currency.format(calc)}</td>
                  <td className="p-2 text-right">
                    <button className="rounded-2xl px-3 py-2 text-sm text-red-600" onClick={() => remove(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="p-3">Total Other Costs</td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3">{currency.format(summary.otherCostsTotal)}</td>
              <td className="p-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [deals, setDeals] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedDeal = params.get("deal");

    if (sharedDeal) {
      const parsedSharedDeal = decodeDealFromUrl(sharedDeal);
      if (parsedSharedDeal) {
        const hydratedSharedDeal = {
          ...createDefaultDeal(),
          ...parsedSharedDeal,
          id: parsedSharedDeal.id || uid("deal"),
        };
        setDeals([hydratedSharedDeal]);
        setSelectedId(hydratedSharedDeal.id);
        return;
      }
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = [createDefaultDeal()];
        setDeals(initial);
        setSelectedId(initial[0].id);
        return;
      }
      const parsed = JSON.parse(raw);
      const hydrated = Array.isArray(parsed) && parsed.length ? parsed : [createDefaultDeal()];
      setDeals(hydrated);
      setSelectedId(hydrated[0].id);
    } catch {
      const initial = [createDefaultDeal()];
      setDeals(initial);
      setSelectedId(initial[0].id);
    }
  }, []);

  const selectedDeal = deals.find((d) => d.id === selectedId) || deals[0] || createDefaultDeal();
  const summary = useMemo(() => summarizeDeal(selectedDeal), [selectedDeal]);

  useEffect(() => {
    if (deals.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
    }
  }, [deals]);

  const patchDeal = (patch) => {
    setDeals((current) =>
      current.map((deal) => (deal.id === selectedDeal.id ? { ...deal, ...patch, updatedAt: new Date().toISOString() } : deal))
    );
  };

  const createDeal = () => {
    const deal = createDefaultDeal();
    setDeals((current) => [deal, ...current]);
    setSelectedId(deal.id);
  };

  const duplicateDeal = () => {
    const clone = {
      ...structuredClone(selectedDeal),
      id: uid("deal"),
      name: `${selectedDeal.name} Copy`,
      updatedAt: new Date().toISOString(),
    };
    setDeals((current) => [clone, ...current]);
    setSelectedId(clone.id);
  };

  const deleteDeal = () => {
    if (deals.length === 1) return;
    const nextDeals = deals.filter((d) => d.id !== selectedDeal.id);
    setDeals(nextDeals);
    setSelectedId(nextDeals[0].id);
  };

  const exportSelected = () => {
    downloadFile(
      `${selectedDeal.name.replace(/\s+/g, "-").toLowerCase() || "flip-deal"}.json`,
      JSON.stringify(selectedDeal, null, 2),
      "application/json"
    );
  };

  const exportAll = () => {
    downloadFile("flip-deals-library.json", JSON.stringify(deals, null, 2), "application/json");
  };

  const exportPDF = () => {
    exportReportPDF(selectedDeal, summary);
  };

  const copyShareLink = async () => {
    const payload = encodeDealForUrl(selectedDeal);
    if (!payload) {
      alert("Could not create share link.");
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?deal=${payload}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied.");
    } catch {
      window.prompt("Copy this share link:", url);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-[28px] bg-slate-900 p-5 text-slate-100 shadow-xl">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Web App</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Professional Flip Deal Analyzer</h1>
            <p className="mt-2 text-sm text-slate-400">Analyze offers, save multiple deals, export budgets, and use it from any browser.</p>
          </div>

          <div className="mt-5 grid gap-3">
            <button className="rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white" onClick={createDeal}>New Deal</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={duplicateDeal}>Duplicate</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium disabled:opacity-50" onClick={deleteDeal} disabled={deals.length === 1}>Delete</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={exportPDF}>Export PDF</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={copyShareLink}>Copy Share Link</button>
          </div>

          <div className="mt-5 grid gap-3">
            {deals.map((deal) => {
              const s = summarizeDeal(deal);
              return (
                <button
                  key={deal.id}
                  className={`grid gap-1 rounded-2xl border p-4 text-left ${deal.id === selectedDeal.id ? "border-blue-400 bg-slate-800" : "border-slate-800 bg-slate-950"}`}
                  onClick={() => setSelectedId(deal.id)}
                >
                  <strong className="text-white">{deal.name}</strong>
                  <span className="text-sm text-slate-400">{deal.address || "No address yet"}</span>
                  <span className="text-sm text-slate-300">Offer {currency.format(s.recommendedOffer)}</span>
                  <span className="text-sm text-slate-300">Profit {currency.format(s.projectedProfit)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="grid gap-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Web Deal Overview</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">{selectedDeal.name}</h2>
                <p className="mt-2 text-slate-500">Price flips with hard costs, contingency, sales costs, and finance assumptions.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TextField label="Deal Name" value={selectedDeal.name} onChange={(value) => patchDeal({ name: value })} placeholder="123 Oak Street" />
              <TextField label="Property Address" value={selectedDeal.address} onChange={(value) => patchDeal({ address: value })} placeholder="123 Oak Street, Tampa FL" />
              <NumberField label="After Repair Value (ARV)" value={selectedDeal.arv} onChange={(value) => patchDeal({ arv: value })} />
              <NumberField label="Square Feet" value={selectedDeal.sqft} onChange={(value) => patchDeal({ sqft: value })} step="100" />
              <NumberField label="Target Profit" value={selectedDeal.targetProfit} onChange={(value) => patchDeal({ targetProfit: value })} />
              <NumberField label="Desired Margin %" value={selectedDeal.desiredMargin} onChange={(value) => patchDeal({ desiredMargin: value })} step="0.5" />
              <NumberField label="Contingency %" value={selectedDeal.contingencyRate} onChange={(value) => patchDeal({ contingencyRate: value })} step="0.5" />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-600">Use 70% Rule Cap</span>
                <div className="flex h-[50px] items-center rounded-2xl border border-slate-200 bg-white px-4">
                  <input type="checkbox" checked={selectedDeal.use70Rule} onChange={(e) => patchDeal({ use70Rule: e.target.checked })} />
                </div>
              </label>
              <NumberField label="70% Rule %" value={selectedDeal.rule70Percent} onChange={(value) => patchDeal({ rule70Percent: value })} step="1" />
              <NumberField label="Months Held" value={selectedDeal.monthsHeld} onChange={(value) => patchDeal({ monthsHeld: value })} step="1" />
              <NumberField label="Annual Interest %" value={selectedDeal.annualInterestRate} onChange={(value) => patchDeal({ annualInterestRate: value })} step="0.25" />
              <NumberField label="Lender Points %" value={selectedDeal.lenderPoints} onChange={(value) => patchDeal({ lenderPoints: value })} step="0.25" />
              <NumberField label="Finance % of Purchase" value={selectedDeal.financedPercentOfPurchase} onChange={(value) => patchDeal({ financedPercentOfPurchase: value })} step="1" />
              <NumberField label="Finance % of Reno" value={selectedDeal.financedPercentOfReno} onChange={(value) => patchDeal({ financedPercentOfReno: value })} step="1" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Recommended Offer" value={currency.format(summary.recommendedOffer)} hint="Lower of profit target, margin target, and optional 70% cap" />
            <MetricCard label="Projected Profit" value={currency.format(summary.projectedProfit)} hint={`${percent1.format(summary.projectedMargin)} of ARV`} />
            <MetricCard label="Reno + Contingency" value={currency.format(summary.renoTotal)} hint={`${currency.format(summary.renoBase)} hard costs + ${currency.format(summary.contingency)} contingency`} />
            <MetricCard label="Other Costs" value={currency.format(summary.otherCostsTotal)} hint="Selling, financing, closing, insurance, utilities, misc" />
            <MetricCard label="Cash Needed" value={currency.format(summary.cashNeededBeforeReserves)} hint="Project cost minus estimated financed amount" />
            <MetricCard label="Estimated Loan Basis" value={currency.format(summary.totalLoanBasis)} hint={`${currency.format(summary.estimatedPointsCost)} points + ${currency.format(summary.estimatedInterestCarry)} carry`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <LineItemsTable title="Renovation Budget" items={selectedDeal.renovationItems} onChange={(value) => patchDeal({ renovationItems: value })} />
            <OtherCostsTable items={selectedDeal.otherCosts} onChange={(value) => patchDeal({ otherCosts: value })} summary={summary} />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Offer Logic</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm text-slate-500">Offer by Profit Target</div><div className="mt-2 text-2xl font-semibold">{currency.format(summary.offerByProfit)}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm text-slate-500">Offer by Margin Target</div><div className="mt-2 text-2xl font-semibold">{currency.format(summary.offerByMargin)}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm text-slate-500">Offer by 70% Rule</div><div className="mt-2 text-2xl font-semibold">{currency.format(summary.offerBy70)}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm text-slate-500">Total Project Cost</div><div className="mt-2 text-2xl font-semibold">{currency.format(summary.totalProjectCost)}</div></div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Deal Notes</h3>
              <textarea
                value={selectedDeal.notes}
                onChange={(e) => patchDeal({ notes: e.target.value })}
                placeholder="Scope notes, contractor comments, neighborhood notes, buyer feedback..."
                rows="12"
                className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
