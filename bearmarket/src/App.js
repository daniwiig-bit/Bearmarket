import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

const STORAGE_KEY = 'bearmarket_portfolio_v1';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --bg2: #111111;
    --bg3: #181818;
    --border: rgba(255,255,255,0.07);
    --border2: rgba(255,255,255,0.13);
    --text: #f0ede8;
    --muted: #666;
    --muted2: #444;
    --red: #ff3b30;
    --red-dim: rgba(255,59,48,0.12);
    --green: #30d158;
    --green-dim: rgba(48,209,88,0.12);
    --accent: #ff3b30;
    --mono: 'DM Mono', monospace;
    --display: 'Syne', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--mono); min-height: 100vh; }

  ::selection { background: var(--red); color: #fff; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--muted2); border-radius: 2px; }

  input, select, button { font-family: var(--mono); }

  input, select {
    background: var(--bg3);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    width: 100%;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus { border-color: var(--accent); }
  select option { background: var(--bg3); }

  button { cursor: pointer; border: none; outline: none; }

  .btn-primary {
    background: var(--accent);
    color: #fff;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    transition: opacity 0.15s, transform 0.1s;
    white-space: nowrap;
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:active { transform: scale(0.97); }

  .btn-ghost {
    background: transparent;
    color: var(--muted);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    transition: color 0.15s, background 0.15s;
  }
  .btn-ghost:hover { color: var(--red); background: var(--red-dim); }

  .tag {
    display: inline-block;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 3px;
    letter-spacing: 0.06em;
    font-weight: 500;
    text-transform: uppercase;
  }
  .tag-bear { background: var(--red-dim); color: var(--red); border: 1px solid rgba(255,59,48,0.2); }
  .tag-bull { background: var(--green-dim); color: var(--green); border: 1px solid rgba(48,209,88,0.2); }
`;

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : { bear: [], bull: [] };
  } catch { return { bear: [], bull: [] }; }
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

async function fetchPrice(ticker, exchange) {
  const suffix = exchange === 'OSL' ? '.OL' : '';
  const symbol = encodeURIComponent(ticker.toUpperCase() + suffix);
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!r.ok) throw new Error();
    const d = await r.json();
    return d.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

function calcPnl(pos, side) {
  const change = pos.currentPrice - pos.entryPrice;
  const pct = (change / pos.entryPrice) * 100;
  const pnl = change * pos.qty;
  return side === 'bear'
    ? { pct: -pct, pnl: -pnl }
    : { pct, pnl };
}

function fmt(v, decimals = 2) {
  return (v >= 0 ? '+' : '') + v.toFixed(decimals);
}
function fmtMoney(v) {
  return (v >= 0 ? '+' : '') + Math.round(v).toLocaleString('nb-NO');
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ view, setView }) {
  return (
    <header style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 32, height: 56 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--red)' }}>↓</span> BEARMARKET
      </div>
      <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
        {['oversikt', 'short', 'long'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: view === v ? 'var(--bg3)' : 'transparent',
            color: view === v ? 'var(--text)' : 'var(--muted)',
            border: view === v ? '1px solid var(--border2)' : '1px solid transparent',
            padding: '6px 14px', borderRadius: 6, fontSize: 12, letterSpacing: '0.05em',
            textTransform: 'uppercase', fontFamily: 'var(--mono)', fontWeight: 500,
            transition: 'all 0.15s', cursor: 'pointer'
          }}>
            {v}
          </button>
        ))}
      </nav>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.04em' }}>
        {new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </header>
  );
}

// ─── Add Form ─────────────────────────────────────────────────────────────────
function AddForm({ side, onAdd }) {
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('NASDAQ');
  const [qty, setQty] = useState(100);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleAdd() {
    if (!ticker.trim()) return;
    setLoading(true); setErr('');
    const price = await fetchPrice(ticker.trim(), exchange);
    if (!price) {
      setErr(`Fant ikke kurs for ${ticker.toUpperCase()}. Sjekk ticker og børs.`);
      setLoading(false); return;
    }
    onAdd({ id: Date.now(), ticker: ticker.trim().toUpperCase(), exchange, qty: Number(qty), entryPrice: price, currentPrice: price, addedAt: new Date().toISOString() });
    setTicker(''); setLoading(false);
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Legg til {side === 'bear' ? 'short' : 'long'}-posisjon
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px auto', gap: 10, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Ticker</div>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={side === 'bear' ? 'f.eks. NEL' : 'f.eks. EQNR'}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Børs</div>
          <select value={exchange} onChange={e => setExchange(e.target.value)}>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
            <option value="OSL">Oslo Børs</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Antall</div>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} min={1} />
        </div>
        <button className="btn-primary" onClick={handleAdd} disabled={loading}>
          {loading ? '...' : '+ Legg til'}
        </button>
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{err}</div>}
    </div>
  );
}

// ─── Position Table ────────────────────────────────────────────────────────────
function PositionTable({ positions, side, onRemove, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  const totPnl = positions.reduce((s, p) => s + calcPnl(p, side).pnl, 0);

  if (!positions.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
      Ingen posisjoner enda — legg til en ticker ovenfor
    </div>
  );

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {positions.length} posisjon{positions.length !== 1 ? 'er' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: totPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            Total: {fmtMoney(totPnl)}
          </span>
          <button className="btn-ghost" onClick={handleRefresh} style={{ fontSize: 11 }}>
            {refreshing ? 'oppdaterer…' : '↻ oppdater priser'}
          </button>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Ticker', 'Børs', 'Antall', 'Inngang', 'Nå', 'Endring %', 'P&L', ''].map(h => (
              <th key={h} style={{ padding: '10px 20px', textAlign: h === '' || h === 'P&L' || h === 'Endring %' ? 'right' : 'left', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const { pct, pnl } = calcPnl(p, side);
            const pos = pct >= 0;
            return (
              <tr key={p.id} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 20px', fontWeight: 500, fontSize: 14 }}>{p.ticker}</td>
                <td style={{ padding: '12px 20px', fontSize: 11, color: 'var(--muted)' }}>{p.exchange}</td>
                <td style={{ padding: '12px 20px', fontSize: 13 }}>{p.qty.toLocaleString()}</td>
                <td style={{ padding: '12px 20px', fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>{p.entryPrice.toFixed(2)}</td>
                <td style={{ padding: '12px 20px', fontSize: 13 }}>{p.currentPrice.toFixed(2)}</td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: pos ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {fmt(pct)}%
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: pos ? 'var(--green)' : 'var(--red)' }}>
                  {fmtMoney(pnl)}
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                  <button className="btn-ghost" onClick={() => onRemove(p.id)} style={{ fontSize: 14, padding: '4px 8px' }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ state }) {
  const bearPnl = state.bear.reduce((s, p) => s + calcPnl(p, 'bear').pnl, 0);
  const bullPnl = state.bull.reduce((s, p) => s + calcPnl(p, 'bull').pnl, 0);
  const bearPct = state.bear.length ? state.bear.reduce((s, p) => s + calcPnl(p, 'bear').pct, 0) / state.bear.length : 0;
  const bullPct = state.bull.length ? state.bull.reduce((s, p) => s + calcPnl(p, 'bull').pct, 0) / state.bull.length : 0;

  const chartData = [
    { name: 'Short ↓', value: parseFloat(bearPct.toFixed(2)), side: 'bear' },
    { name: 'Long ↑', value: parseFloat(bullPct.toFixed(2)), side: 'bull' },
  ];

  const allPositions = [
    ...state.bear.map(p => ({ ...p, ...calcPnl(p, 'bear'), side: 'bear' })),
    ...state.bull.map(p => ({ ...p, ...calcPnl(p, 'bull'), side: 'bull' })),
  ].sort((a, b) => b.pct - a.pct);

  const metrics = [
    { label: 'Short P&L', value: fmtMoney(bearPnl), pos: bearPnl >= 0 },
    { label: 'Short snitt', value: fmt(bearPct) + '%', pos: bearPct >= 0 },
    { label: 'Long P&L', value: fmtMoney(bullPnl), pos: bullPnl >= 0 },
    { label: 'Long snitt', value: fmt(bullPct) + '%', pos: bullPct >= 0 },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: m.pos ? 'var(--green)' : 'var(--red)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>Ytelse sammenligning</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={48}>
              <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 12, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
              <Tooltip
                contentStyle={{ background: '#181818', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontFamily: 'DM Mono', fontSize: 12 }}
                formatter={v => [(v >= 0 ? '+' : '') + v.toFixed(2) + '%']}
                labelStyle={{ color: '#666' }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.value >= 0 ? 'rgba(48,209,88,0.8)' : 'rgba(255,59,48,0.8)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Alle posisjoner</div>
          {allPositions.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 12 }}>Ingen posisjoner enda</div>
          )}
          {allPositions.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < allPositions.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{p.ticker}</span>
                <span className={`tag tag-${p.side}`}>{p.side === 'bear' ? 'short' : 'long'}</span>
              </div>
              <span style={{ fontSize: 13, color: p.pct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                {fmt(p.pct)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {state.bear.length === 0 && state.bull.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
          Gå til "short" eller "long" for å legge til dine første posisjoner
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('oversikt');
  const [portfolio, setPortfolio] = useState(loadState);

  useEffect(() => { saveState(portfolio); }, [portfolio]);

  const addPosition = useCallback((side, pos) => {
    setPortfolio(prev => ({ ...prev, [side]: [...prev[side], pos] }));
  }, []);

  const removePosition = useCallback((side, id) => {
    setPortfolio(prev => ({ ...prev, [side]: prev[side].filter(p => p.id !== id) }));
  }, []);

  const refreshPrices = useCallback(async (side) => {
    const positions = portfolio[side];
    const updated = await Promise.all(positions.map(async p => {
      const price = await fetchPrice(p.ticker, p.exchange);
      return price ? { ...p, currentPrice: price } : p;
    }));
    setPortfolio(prev => ({ ...prev, [side]: updated }));
  }, [portfolio]);

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header view={view} setView={setView} />
        <main style={{ flex: 1, padding: '32px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          {view === 'oversikt' && <Overview state={portfolio} />}

          {view === 'short' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Short-portefølje</h1>
                <span className="tag tag-bear">Bear</span>
              </div>
              <AddForm side="bear" onAdd={pos => addPosition('bear', pos)} />
              <PositionTable
                positions={portfolio.bear}
                side="bear"
                onRemove={id => removePosition('bear', id)}
                onRefresh={() => refreshPrices('bear')}
              />
            </>
          )}

          {view === 'long' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Long-portefølje</h1>
                <span className="tag tag-bull">Bull</span>
              </div>
              <AddForm side="bull" onAdd={pos => addPosition('bull', pos)} />
              <PositionTable
                positions={portfolio.bull}
                side="bull"
                onRemove={id => removePosition('bull', id)}
                onRefresh={() => refreshPrices('bull')}
              />
            </>
          )}
        </main>
      </div>
    </>
  );
}
