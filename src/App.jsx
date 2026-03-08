import React, { useEffect, useMemo, useState } from 'react';
const importDeals = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const cleaned = list.map((deal) => ({ ...createDefaultDeal(), ...deal, id: deal.id || uid('deal') }));
      setDeals(cleaned);
      setSelectedId(cleaned[0].id);
      event.target.value = '';
    } catch {
      alert('That file could not be imported. Please use a JSON file exported from this app.');
    }
  };

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percent1 = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const STORAGE_KEY = 'flip-deal-analyzer:deals:v1';

const blankRenoItems = [
  ['Plumbing', 8000],
  ['Electrical', 12000],
  ['Roof', 15000],
  ['Framing', 10000],
  ['Kitchen', 18000],
  ['Bathrooms', 14000],
  ['Flooring', 9000],
  ['Paint', 6000],
  ['Windows / Doors', 7000],
  ['HVAC', 10000],
].map(([name, amount], i) => ({ id: `reno-${i + 1}`, name, amount }));

const blankOtherCosts = [
  ['Buying Closing Costs', 'percent_offer', 2],
  ['Selling Closing Costs', 'percent_arv', 1.5],
  ['Real Estate Commissions', 'percent_arv', 5],
  ['Financing Costs', 'fixed', 12000],
  ['Holding Costs', 'fixed', 8000],
  ['Insurance / Utilities / Misc.', 'fixed', 5000],
].map(([name, mode, value], i) => ({ id: `cost-${i + 1}`, name, mode, value }));

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultDeal() {
  return {
    id: uid('deal'),
    name: 'New Flip Deal',
    address: '',
    arv: 350000,
    sqft: 0,
    purchasePrice: 0,
    targetProfit: 40000,
    desiredMargin: 15,
    contingencyRate: 15,
    monthsHeld: 6,
    annualInterestRate: 12,
    lenderPoints: 2,
    financedPercentOfPurchase: 90,
    financedPercentOfReno: 100,
    use70Rule: false,
    rule70Percent: 70,
    notes: '',
    renovationItems: structuredClone(blankRenoItems),
    otherCosts: structuredClone(blankOtherCosts),
    updatedAt: new Date().toISOString(),
  };
}

function calculateCost(item, { arv, offer }) {
  const value = toNumber(item.value);
  if (item.mode === 'percent_offer') return offer * value / 100;
  if (item.mode === 'percent_arv') return arv * value / 100;
  return value;
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
    if (item.mode === 'fixed') return sum + toNumber(item.value);
    if (item.mode === 'percent_arv') return sum + arv * toNumber(item.value) / 100;
    return sum;
  }, 0);

  const offerPctRate = deal.otherCosts.reduce((sum, item) => {
    if (item.mode === 'percent_offer') return sum + toNumber(item.value) / 100;
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
  const estimatedInterestCarry = totalLoanBasis * (toNumber(deal.annualInterestRate) / 100) * (toNumber(deal.monthsHeld) / 12);
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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-hint">{hint}</div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = '1000' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} step={step} onChange={(e) => onChange(toNumber(e.target.value))} />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LineItemsTable({ title, items, onChange }) {
  const update = (id, field, value) => {
    onChange(items.map((item) => item.id === id ? { ...item, [field]: field === 'amount' ? toNumber(value) : value } : item));
  };

  const add = () => onChange([...items, { id: uid('reno'), name: '', amount: 0 }]);
  const remove = (id) => onChange(items.filter((item) => item.id !== id));
  const total = items.reduce((sum, item) => sum + toNumber(item.amount), 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <button className="secondary" onClick={add}>Add Reno Item</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line Item</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><input value={item.name} onChange={(e) => update(item.id, 'name', e.target.value)} placeholder="Line item" /></td>
                <td><input type="number" value={item.amount} step="100" onChange={(e) => update(item.id, 'amount', e.target.value)} /></td>
                <td><button className="ghost" onClick={() => remove(item.id)}>Delete</button></td>
              </tr>
            ))}
            <tr className="total-row">
              <td>Total Hard Costs</td>
              <td>{currency.format(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OtherCostsTable({ items, onChange, summary }) {
  const update = (id, field, value) => {
    onChange(items.map((item) => item.id === id ? { ...item, [field]: field === 'value' ? toNumber(value) : value } : item));
  };
  const add = () => onChange([...items, { id: uid('cost'), name: '', mode: 'fixed', value: 0 }]);
  const remove = (id) => onChange(items.filter((item) => item.id !== id));

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Closing, Selling, Financing, and Holding Costs</h3>
        <button className="secondary" onClick={add}>Add Cost Item</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line Item</th>
              <th>Mode</th>
              <th>Input</th>
              <th>Calculated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const calc = calculateCost(item, { arv: summary.arv, offer: summary.recommendedOffer });
              return (
                <tr key={item.id}>
                  <td><input value={item.name} onChange={(e) => update(item.id, 'name', e.target.value)} placeholder="Cost item" /></td>
                  <td>
                    <select value={item.mode} onChange={(e) => update(item.id, 'mode', e.target.value)}>
                      <option value="fixed">Fixed $</option>
                      <option value="percent_offer">% of Offer</option>
                      <option value="percent_arv">% of ARV</option>
                    </select>
                  </td>
                  <td><input type="number" step="0.1" value={item.value} onChange={(e) => update(item.id, 'value', e.target.value)} /></td>
                  <td>{currency.format(calc)}</td>
                  <td><button className="ghost" onClick={() => remove(item.id)}>Delete</button></td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>Total Other Costs</td>
              <td></td>
              <td></td>
              <td>{currency.format(summary.otherCostsTotal)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [deals, setDeals] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createDefaultDeal()];
    try {
      const parsed = JSON.parse(raw);
      return parsed.length ? parsed : [createDefaultDeal()];
    } catch {
      return [createDefaultDeal()];
    }
  });
  const [selectedId, setSelectedId] = useState(() => deals[0].id);

  const selectedDeal = deals.find((d) => d.id === selectedId) || deals[0];
  const summary = useMemo(() => summarizeDeal(selectedDeal), [selectedDeal]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }, [deals]);

  const patchDeal = (patch) => {
    setDeals((current) => current.map((deal) => deal.id === selectedDeal.id ? { ...deal, ...patch, updatedAt: new Date().toISOString() } : deal));
  };

  const createDeal = () => {
    const deal = createDefaultDeal();
    setDeals((current) => [deal, ...current]);
    setSelectedId(deal.id);
  };

  const duplicateDeal = () => {
    const clone = {
      ...structuredClone(selectedDeal),
      id: uid('deal'),
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
    downloadFile(`${selectedDeal.name.replace(/\s+/g, '-').toLowerCase() || 'flip-deal'}.json`, JSON.stringify(selectedDeal, null, 2), 'application/json');
  };

  const exportAll = () => {
    downloadFile('flip-deals-library.json', JSON.stringify(deals, null, 2), 'application/json');
  };

 

 
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="eyebrow">Desktop App</div>
          <h1>Professional Flip Deal Analyzer</h1>
          <p className="muted">Analyze offers, save multiple deals, and export your budgets.</p>
        </div>

        <div className="sidebar-actions">
          <button onClick={createDeal}>New Deal</button>
          <button className="secondary" onClick={duplicateDeal}>Duplicate</button>
          <button className="secondary" onClick={deleteDeal} disabled={deals.length === 1}>Delete</button>
        </div>

        <div className="import-export">
          <button className="secondary" onClick={exportSelected}>Export Current Deal</button>
          <button className="secondary" onClick={exportAll}>Export Deal Library</button>
          <label className="file-button secondary">
            Import JSON
            <input type="file" accept="application/json" onChange={importDeals} />
          </label>
        </div>

        <div className="deal-list">
          {deals.map((deal) => {
            const s = summarizeDeal(deal);
            return (
              <button key={deal.id} className={`deal-card ${deal.id === selectedDeal.id ? 'active' : ''}`} onClick={() => setSelectedId(deal.id)}>
                <strong>{deal.name}</strong>
                <span>{deal.address || 'No address yet'}</span>
                <span>Offer {currency.format(s.recommendedOffer)}</span>
                <span>Profit {currency.format(s.projectedProfit)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="main-content">
        <section className="hero panel">
          <div className="hero-top">
            <div>
              <div className="eyebrow">Deal Overview</div>
              <h2>{selectedDeal.name}</h2>
              <p className="muted">Use this to price flips with hard costs, contingency, sales costs, and finance assumptions.</p>
            </div>
          </div>

          <div className="hero-grid">
            <TextField label="Deal Name" value={selectedDeal.name} onChange={(value) => patchDeal({ name: value })} placeholder="123 Oak Street" />
            <TextField label="Property Address" value={selectedDeal.address} onChange={(value) => patchDeal({ address: value })} placeholder="123 Oak Street, Tampa FL" />
            <NumberField label="After Repair Value (ARV)" value={selectedDeal.arv} onChange={(value) => patchDeal({ arv: value })} />
            <NumberField label="Square Feet" value={selectedDeal.sqft} onChange={(value) => patchDeal({ sqft: value })} step="100" />
            <NumberField label="Target Profit" value={selectedDeal.targetProfit} onChange={(value) => patchDeal({ targetProfit: value })} />
            <NumberField label="Desired Margin %" value={selectedDeal.desiredMargin} onChange={(value) => patchDeal({ desiredMargin: value })} step="0.5" />
            <NumberField label="Contingency %" value={selectedDeal.contingencyRate} onChange={(value) => patchDeal({ contingencyRate: value })} step="0.5" />
            <label className="field checkbox-field">
              <span>Use 70% Rule Cap</span>
              <input type="checkbox" checked={selectedDeal.use70Rule} onChange={(e) => patchDeal({ use70Rule: e.target.checked })} />
            </label>
            <NumberField label="70% Rule %" value={selectedDeal.rule70Percent} onChange={(value) => patchDeal({ rule70Percent: value })} step="1" />
            <NumberField label="Months Held" value={selectedDeal.monthsHeld} onChange={(value) => patchDeal({ monthsHeld: value })} step="1" />
            <NumberField label="Annual Interest %" value={selectedDeal.annualInterestRate} onChange={(value) => patchDeal({ annualInterestRate: value })} step="0.25" />
            <NumberField label="Lender Points %" value={selectedDeal.lenderPoints} onChange={(value) => patchDeal({ lenderPoints: value })} step="0.25" />
            <NumberField label="Finance % of Purchase" value={selectedDeal.financedPercentOfPurchase} onChange={(value) => patchDeal({ financedPercentOfPurchase: value })} step="1" />
            <NumberField label="Finance % of Reno" value={selectedDeal.financedPercentOfReno} onChange={(value) => patchDeal({ financedPercentOfReno: value })} step="1" />
          </div>
        </section>

        <section className="metrics-grid">
          <MetricCard label="Recommended Offer" value={currency.format(summary.recommendedOffer)} hint="Lower of profit target, margin target, and optional 70% cap" />
          <MetricCard label="Projected Profit" value={currency.format(summary.projectedProfit)} hint={`${percent1.format(summary.projectedMargin)} of ARV`} />
          <MetricCard label="Reno + Contingency" value={currency.format(summary.renoTotal)} hint={`${currency.format(summary.renoBase)} hard costs + ${currency.format(summary.contingency)} contingency`} />
          <MetricCard label="Other Costs" value={currency.format(summary.otherCostsTotal)} hint="Selling, financing, closing, insurance, utilities, misc" />
          <MetricCard label="Cash Needed" value={currency.format(summary.cashNeededBeforeReserves)} hint="Project cost minus estimated financed amount" />
          <MetricCard label="Estimated Loan Basis" value={currency.format(summary.totalLoanBasis)} hint={`${currency.format(summary.estimatedPointsCost)} points + ${currency.format(summary.estimatedInterestCarry)} carry`} />
        </section>

        <section className="two-col">
          <LineItemsTable title="Renovation Budget" items={selectedDeal.renovationItems} onChange={(value) => patchDeal({ renovationItems: value })} />
          <OtherCostsTable items={selectedDeal.otherCosts} onChange={(value) => patchDeal({ otherCosts: value })} summary={summary} />
        </section>

        <section className="two-col">
          <div className="panel">
            <div className="panel-header"><h3>Offer Logic</h3></div>
            <div className="logic-grid">
              <div className="logic-item"><span>Offer by Profit Target</span><strong>{currency.format(summary.offerByProfit)}</strong></div>
              <div className="logic-item"><span>Offer by Margin Target</span><strong>{currency.format(summary.offerByMargin)}</strong></div>
              <div className="logic-item"><span>Offer by 70% Rule</span><strong>{currency.format(summary.offerBy70)}</strong></div>
              <div className="logic-item"><span>Total Project Cost</span><strong>{currency.format(summary.totalProjectCost)}</strong></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><h3>Deal Notes</h3></div>
            <textarea value={selectedDeal.notes} onChange={(e) => patchDeal({ notes: e.target.value })} placeholder="Scope notes, contractor comments, neighborhood notes, buyer feedback..." rows="10" />
          </div>
        </section>
      </main>
    </div>
  );
}
