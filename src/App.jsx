import React, { useEffect, useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const STORAGE_KEY = "flip-house-offer-calculator:deals:v2";

const defaultRenoItems = [
  { id: 1, name: "Plumbing", amount: 8000 },
  { id: 2, name: "Electrical", amount: 12000 },
  { id: 3, name: "Roof", amount: 15000 },
  { id: 4, name: "Framing", amount: 10000 },
  { id: 5, name: "Kitchen", amount: 18000 },
  { id: 6, name: "Bathrooms", amount: 14000 },
  { id: 7, name: "Flooring", amount: 9000 },
  { id: 8, name: "Paint", amount: 6000 },
  { id: 9, name: "Windows / Doors", amount: 7000 },
  { id: 10, name: "HVAC", amount: 10000 },
];

const defaultOtherCosts = [
  { id: 1, name: "Buying Closing Costs", type: "percent_purchase", value: 2 },
  { id: 2, name: "Selling Closing Costs", type: "percent_arv", value: 1.5 },
  { id: 3, name: "Financing Costs", type: "fixed", value: 12000 },
  { id: 4, name: "Holding Costs", type: "fixed", value: 8000 },
  { id: 5, name: "Real Estate Commissions", type: "percent_arv", value: 5 },
  { id: 6, name: "Insurance / Utilities / Misc.", type: "fixed", value: 5000 },
];

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cloneData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultDeal() {
  return {
    id: uid("deal"),
    name: "New Deal",
    address: "",
    arv: 350000,
    targetProfit: 40000,
    desiredMargin: 15,
    contingencyRate: 10,
    renovationItems: cloneData(defaultRenoItems),
    otherCosts: cloneData(defaultOtherCosts),
  };
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

function calculateOtherCostAmount(item, arv, offer) {
  const numericValue = toNumber(item.value ?? item.amount);
  if (item.type === "percent_purchase") return offer * (numericValue / 100);
  if (item.type === "percent_arv") return arv * (numericValue / 100);
  return numericValue;
}

function summarizeDeal(deal) {
  const arv = toNumber(deal.arv);
  const targetProfit = toNumber(deal.targetProfit);
  const desiredMargin = toNumber(deal.desiredMargin);
  const contingencyRate = toNumber(deal.contingencyRate);
  const renovationTotal = deal.renovationItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const contingencyAmount = renovationTotal * (contingencyRate / 100);
  const totalRenoWithContingency = renovationTotal + contingencyAmount;

  const otherCostsUsingZeroOffer = deal.otherCosts.reduce((sum, item) => sum + calculateOtherCostAmount(item, arv, 0), 0);
  const preliminaryMaxOfferByProfit = Math.max(0, arv - totalRenoWithContingency - otherCostsUsingZeroOffer - targetProfit);
  const preliminaryMaxOfferByMargin = Math.max(0, arv * (1 - desiredMargin / 100) - totalRenoWithContingency - otherCostsUsingZeroOffer);
  const preliminaryRecommendedOffer = Math.min(preliminaryMaxOfferByProfit, preliminaryMaxOfferByMargin);

  const otherCostsTotal = deal.otherCosts.reduce(
    (sum, item) => sum + calculateOtherCostAmount(item, arv, preliminaryRecommendedOffer),
    0
  );

  const maxOfferByProfit = Math.max(0, arv - totalRenoWithContingency - otherCostsTotal - targetProfit);
  const maxOfferByMargin = Math.max(0, arv * (1 - desiredMargin / 100) - totalRenoWithContingency - otherCostsTotal);
  const recommendedOffer = Math.min(maxOfferByProfit, maxOfferByMargin);
  const totalProjectCost = recommendedOffer + totalRenoWithContingency + otherCostsTotal;
  const projectedProfit = arv - totalProjectCost;
  const projectedMargin = arv > 0 ? projectedProfit / arv : 0;

  return {
    arv,
    renovationTotal,
    contingencyAmount,
    totalRenoWithContingency,
    otherCostsTotal,
    recommendedOffer,
    totalProjectCost,
    projectedProfit,
    projectedMargin,
  };
}

function buildPrintableReport(data) {
  const renoRows = data.renovationItems
    .map(
      (item) => `
        <tr>
          <td>${item.name || "Unnamed item"}</td>
          <td class="num">${currency.format(toNumber(item.amount))}</td>
        </tr>`
    )
    .join("");

  const costRows = data.otherCosts
    .map(
      (item) => `
        <tr>
          <td>${item.name || "Unnamed cost"}</td>
          <td>${item.type === "fixed" ? "Fixed $" : item.type === "percent_purchase" ? "% of Offer" : "% of ARV"}</td>
          <td class="num">${item.type === "fixed" ? currency.format(toNumber(item.value)) : `${toNumber(item.value)}%`}</td>
          <td class="num">${currency.format(item.calculated)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
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
        .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:14px; }
        .card { border:1px solid #e2e8f0; border-radius:16px; padding:16px; }
        .label { font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#64748b; }
        .value { font-size:24px; font-weight:700; margin-top:6px; }
        table { width:100%; border-collapse:collapse; margin-top:8px; }
        th, td { border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:left; font-size:14px; vertical-align:top; }
        th { background:#f8fafc; color:#475569; }
        .num { text-align:right; white-space:nowrap; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">Peaceful Haven Homes</div>
          <h1>Flip Deal Report</h1>
        </div>
        <div>Generated ${new Date().toLocaleString()}</div>
      </div>

      <h2>Deal Summary</h2>
      <div class="grid">
        <div class="card"><div class="label">ARV</div><div class="value">${currency.format(data.arv)}</div></div>
        <div class="card"><div class="label">Recommended Offer</div><div class="value">${currency.format(data.recommendedOffer)}</div></div>
        <div class="card"><div class="label">Projected Profit</div><div class="value">${currency.format(data.projectedProfit)}</div></div>
        <div class="card"><div class="label">Projected Margin</div><div class="value">${percent.format(data.projectedMargin)}</div></div>
        <div class="card"><div class="label">Reno + Contingency</div><div class="value">${currency.format(data.totalRenoWithContingency)}</div></div>
        <div class="card"><div class="label">Other Costs</div><div class="value">${currency.format(data.otherCostsTotal)}</div></div>
      </div>

      <h2>Renovation Budget</h2>
      <table>
        <tr><th>Line Item</th><th class="num">Amount</th></tr>
        ${renoRows}
        <tr><td><strong>Base Reno</strong></td><td class="num"><strong>${currency.format(data.renovationTotal)}</strong></td></tr>
        <tr><td><strong>Contingency</strong></td><td class="num"><strong>${currency.format(data.contingencyAmount)}</strong></td></tr>
        <tr><td><strong>Total Reno</strong></td><td class="num"><strong>${currency.format(data.totalRenoWithContingency)}</strong></td></tr>
      </table>

      <h2>Other Costs</h2>
      <table>
        <tr><th>Line Item</th><th>Mode</th><th class="num">Input</th><th class="num">Calculated</th></tr>
        ${costRows}
        <tr><td colspan="3"><strong>Total Other Costs</strong></td><td class="num"><strong>${currency.format(data.otherCostsTotal)}</strong></td></tr>
      </table>
    </body>
  </html>`;
}

function OfferMetric({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {subtitle ? <p className="mt-2 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function LineItemTable({ title, items, setItems, addLabel = "Add Item" }) {
  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: field === "amount" ? toNumber(value) : value } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: Date.now(), name: "", amount: 0 }]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const total = items.reduce((sum, item) => sum + toNumber(item.amount), 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700" onClick={addItem}>
          {addLabel}
        </button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 text-left">Line Item</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="p-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, "name", e.target.value)}
                    placeholder="Enter line item"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={item.amount}
                    onChange={(e) => updateItem(item.id, "amount", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </td>
                <td className="p-2 text-right">
                  <button className="rounded-xl px-3 py-2 text-sm text-red-600" onClick={() => removeItem(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="p-3">Total</td>
              <td className="p-3">{currency.format(total)}</td>
              <td className="p-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OtherCostsTable({ items, setItems, arv, recommendedOffer }) {
  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "value") return { ...item, value: toNumber(value) };
        return { ...item, [field]: value };
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: Date.now(), name: "", type: "fixed", value: 0 }]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const total = items.reduce((sum, item) => sum + calculateOtherCostAmount(item, arv, recommendedOffer), 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Closing, Holding, and Selling Costs</h3>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700" onClick={addItem}>
          Add Cost Item
        </button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 text-left">Line Item</th>
              <th className="p-3 text-left">Mode</th>
              <th className="p-3 text-left">Value</th>
              <th className="p-3 text-left">Calculated</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const calculated = calculateOtherCostAmount(item, arv, recommendedOffer);
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="p-2">
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(item.id, "name", e.target.value)}
                      placeholder="Enter cost item"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(item.id, "type", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="fixed">Fixed $</option>
                      <option value="percent_purchase">% of Offer</option>
                      <option value="percent_arv">% of ARV</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.1"
                      value={item.value}
                      onChange={(e) => updateItem(item.id, "value", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </td>
                  <td className="p-3 font-medium text-slate-700">{currency.format(calculated)}</td>
                  <td className="p-2 text-right">
                    <button className="rounded-xl px-3 py-2 text-sm text-red-600" onClick={() => removeItem(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="p-3">Total</td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3">{currency.format(total)}</td>
              <td className="p-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FlipHouseOfferCalculator() {
  const [deals, setDeals] = useState([createDefaultDeal()]);
  const [selectedId, setSelectedId] = useState(null);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedDeal = params.get("deal");
    if (sharedDeal) {
      const parsed = decodeDealFromUrl(sharedDeal);
      if (parsed) {
        const shared = { ...createDefaultDeal(), ...parsed, id: parsed.id || uid("deal") };
        setDeals([shared]);
        setSelectedId(shared.id);
        return;
      }
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = createDefaultDeal();
        setDeals([initial]);
        setSelectedId(initial.id);
        return;
      }
      const savedDeals = JSON.parse(raw);
      const safeDeals = Array.isArray(savedDeals) && savedDeals.length ? savedDeals : [createDefaultDeal()];
      setDeals(safeDeals);
      setSelectedId(safeDeals[0].id);
    } catch {
      const initial = createDefaultDeal();
      setDeals([initial]);
      setSelectedId(initial.id);
    }
  }, []);

  useEffect(() => {
    if (deals.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
    }
  }, [deals]);

  const selectedDeal = deals.find((deal) => deal.id === selectedId) || deals[0] || createDefaultDeal();
  const summary = useMemo(() => summarizeDeal(selectedDeal), [selectedDeal]);

  const patchDeal = (patch) => {
    setDeals((prev) => prev.map((deal) => (deal.id === selectedDeal.id ? { ...deal, ...patch } : deal)));
  };

  const setRenovationItems = (updater) => {
    const nextItems = typeof updater === "function" ? updater(selectedDeal.renovationItems) : updater;
    patchDeal({ renovationItems: nextItems });
  };

  const setOtherCosts = (updater) => {
    const nextItems = typeof updater === "function" ? updater(selectedDeal.otherCosts) : updater;
    patchDeal({ otherCosts: nextItems });
  };

  const createDeal = () => {
    const next = createDefaultDeal();
    setDeals((prev) => [next, ...prev]);
    setSelectedId(next.id);
    setShareUrl("");
  };

  const deleteDeal = () => {
    if (deals.length === 1) {
      const resetDeal = createDefaultDeal();
      setDeals([resetDeal]);
      setSelectedId(resetDeal.id);
      setShareUrl("");
      return;
    }
    const remaining = deals.filter((deal) => deal.id !== selectedDeal.id);
    setDeals(remaining);
    setSelectedId(remaining[0].id);
    setShareUrl("");
  };

  const duplicateDeal = () => {
    const copy = {
      ...cloneData(selectedDeal),
      id: uid("deal"),
      name: `${selectedDeal.name || "Deal"} Copy`,
    };
    setDeals((prev) => [copy, ...prev]);
    setSelectedId(copy.id);
    setShareUrl("");
  };

  const exportPDF = () => {
    const reportWindow = window.open("", "_blank", "width=1100,height=900");
    if (!reportWindow) {
      alert("Please allow popups for this site to export PDF.");
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(
      buildPrintableReport({
        ...summary,
        renovationItems: selectedDeal.renovationItems,
        otherCosts: selectedDeal.otherCosts.map((item) => ({
          ...item,
          calculated: calculateOtherCostAmount(item, summary.arv, summary.recommendedOffer),
        })),
      })
    );
    reportWindow.document.close();
    reportWindow.focus();
    setTimeout(() => reportWindow.print(), 300);
  };

  const copyShareLink = async () => {
    const payload = encodeDealForUrl(selectedDeal);
    if (!payload) {
      alert("Could not create share link.");
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?deal=${payload}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied.");
    } catch {}
  };

  const resetSelectedDeal = () => {
    const reset = { ...createDefaultDeal(), id: selectedDeal.id };
    setDeals((prev) => prev.map((deal) => (deal.id === selectedDeal.id ? reset : deal)));
    setShareUrl("");
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-[28px] bg-slate-900 p-5 text-slate-100 shadow-xl">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Deal Workspace</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Flip House Deal Analyzer</h1>
            <p className="mt-2 text-sm text-slate-400">Simple calculator layout with a dark sidebar and saved deals.</p>
          </div>

          <div className="mt-5 grid gap-3">
            <button className="rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white" onClick={createDeal}>New Deal</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={duplicateDeal}>Duplicate</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={deleteDeal}>Delete</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={exportPDF}>Export PDF</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={copyShareLink}>Copy Share Link</button>
            <button className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-medium" onClick={resetSelectedDeal}>Reset Deal</button>
          </div>

          {shareUrl ? (
            <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
              <div className="mb-2 text-slate-400">Share this link</div>
              <div className="break-all">{shareUrl}</div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {deals.map((deal) => {
              const dealSummary = summarizeDeal(deal);
              return (
                <button
                  key={deal.id}
                  className={`grid gap-1 rounded-2xl border p-4 text-left ${deal.id === selectedDeal.id ? "border-blue-400 bg-slate-800" : "border-slate-800 bg-slate-950"}`}
                  onClick={() => {
                    setSelectedId(deal.id);
                    setShareUrl("");
                  }}
                >
                  <strong className="text-white">{deal.name || "Untitled Deal"}</strong>
                  <span className="text-sm text-slate-400">{deal.address || "No address yet"}</span>
                  <span className="text-sm text-slate-300">Offer {currency.format(dealSummary.recommendedOffer)}</span>
                  <span className="text-sm text-slate-300">Profit {currency.format(dealSummary.projectedProfit)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-slate-600">
                Flip House Deal Analyzer
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Offer Calculator for Fix & Flip Projects
              </h2>
              <p className="mt-2 max-w-3xl text-slate-600">
                Enter your after repair value, renovation budget by line item, and all transactional or holding costs to estimate the maximum offer you should make.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-lg font-semibold text-slate-900">Deal Assumptions</h2>
              <div className="mt-5 space-y-5">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">Deal Name</span>
                  <input value={selectedDeal.name} onChange={(e) => patchDeal({ name: e.target.value })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">Property Address</span>
                  <input value={selectedDeal.address} onChange={(e) => patchDeal({ address: e.target.value })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">After Repair Value (ARV)</span>
                  <input type="number" value={selectedDeal.arv} min="0" step="1000" onChange={(e) => patchDeal({ arv: toNumber(e.target.value) })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">Target Profit ($)</span>
                  <input type="number" value={selectedDeal.targetProfit} min="0" step="1000" onChange={(e) => patchDeal({ targetProfit: toNumber(e.target.value) })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">Desired Margin on ARV (%)</span>
                  <input type="number" value={selectedDeal.desiredMargin} min="0" max="100" step="0.5" onChange={(e) => patchDeal({ desiredMargin: toNumber(e.target.value) })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-600">Contingency on Reno (%)</span>
                  <input type="number" value={selectedDeal.contingencyRate} min="0" max="100" step="0.5" onChange={(e) => patchDeal({ contingencyRate: toNumber(e.target.value) })} className="rounded-xl border border-slate-200 px-4 py-3" />
                </label>
                <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                  <p>1. Contingency = Reno × Contingency %</p>
                  <p>2. Offer by profit = ARV − (Reno + Contingency) − Other Costs − Target Profit</p>
                  <p>3. Offer by margin = ARV × (1 − Desired Margin) − (Reno + Contingency) − Other Costs</p>
                  <p>4. Recommended offer = lower of the two</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-2">
              <OfferMetric title="Recommended Offer" value={currency.format(summary.recommendedOffer)} subtitle="Uses both your target profit and desired margin" />
              <OfferMetric title="Projected Profit" value={currency.format(summary.projectedProfit)} subtitle={summary.projectedMargin >= 0 ? `${percent.format(summary.projectedMargin)} of ARV` : "Negative margin"} />
              <OfferMetric title="Reno Budget" value={currency.format(summary.totalRenoWithContingency)} subtitle={`${selectedDeal.renovationItems.length} line items + ${Math.round(selectedDeal.contingencyRate)}% contingency`} />
              <OfferMetric title="Other Costs" value={currency.format(summary.otherCostsTotal)} subtitle={`${selectedDeal.otherCosts.length} line items`} />
            </div>
          </div>

          <LineItemTable
            title="Renovation Budget by Line Item"
            items={selectedDeal.renovationItems}
            setItems={setRenovationItems}
            addLabel="Add Reno Item"
          />

          <OtherCostsTable items={selectedDeal.otherCosts} setItems={setOtherCosts} arv={summary.arv} recommendedOffer={summary.recommendedOffer} />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Deal Summary</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-slate-500">ARV</p>
                <p className="mt-1 text-xl font-semibold">{currency.format(summary.arv)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Offer + Reno + Contingency + Costs</p>
                <p className="mt-1 text-xl font-semibold">{currency.format(summary.totalProjectCost)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Contingency</p>
                <p className="mt-1 text-xl font-semibold">{currency.format(summary.contingencyAmount)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Projected Profit</p>
                <p className="mt-1 text-xl font-semibold">{currency.format(summary.projectedProfit)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Projected Margin</p>
                <p className="mt-1 text-xl font-semibold">{percent.format(summary.projectedMargin)}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
