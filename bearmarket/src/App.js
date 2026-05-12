import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

const STORAGE_KEY = 'bearmarket_portfolio_v2';
const STARTING_CAPITAL = 100_000;

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #0a0a0a;
    --bg2:      #111111;
    --bg3:      #181818;
    --border:   rgba(255,255,255,0.07);
    --border2:  rgba(255,255,255,0.13);
    --text:     #f0ede8;
    --muted:    #666;
    --muted2:   #444;
    --red:      #ff3b30;
    --red-dim:  rgba(255,59,48,0.12);
    --green:    #30d158;
    --green-dim:rgba(48,209,88,0.12);
    --accent:   #ff3b30;
    --mono:     'DM Mono', monospace;
    --display:  'Syne', sans-serif;
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
    background: var(--accent); color: #fff;
    padding: 10px 20px; border-radius: 6px;
    font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
    transition: opacity 0.15s, transform 0.1s; white-space: nowrap;
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:active { transform: scale(0.97); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-ghost {
    background: transparent; color: var(--muted);
    padding: 6px 10px; border-radius: 4px; font-size: 12px;
    transition: color 0.15s, background 0.15s;
  }
  .btn-ghost:hover { color: var(--red); background: var(--red-dim); }

  .btn-close {
    background: transparent; color: var(--muted);
    padding: 4px 10px; border-radius: 4px; font-size: 11px;
    border: 1px solid var(--border2); transition: all 0.15s;
    white-space: nowrap; letter-spacing: 0.04em;
  }
  .btn-close:hover { color: var(--red); border-color: var(--red); background: var(--red-dim); }

  .btn-outline {
    background: transparent; color: var(--muted);
    padding: 6px 14px; border-radius: 6px; font-size: 12px;
    border: 1px solid var(--border2); transition: all 0.15s;
    letter-spacing: 0.04em; cursor: pointer;
  }
  .btn-outline:hover { color: var(--text); border-color: var(--border2); background: var(--bg3); }

  .tag {
    display: inline-block; font-size: 10px; padding: 2px 7px;
    border-radius: 3px; letter-spacing: 0.06em; font-weight: 500; text-transform: uppercase;
  }
  .tag-bear   { background: var(--red-dim);   color: var(--red);   border: 1px solid rgba(255,59,48,0.2); }
  .tag-bull   { background: var(--green-dim); color: var(--green); border: 1px solid rgba(48,209,88,0.2); }
  .tag-closed { background: rgba(255,255,255,0.04); color: var(--muted); border: 1px solid var(--border2); }

  tr { transition: background 0.1s; }
  tr:hover td { background: var(--bg3); }
`;

// ── State helpers ─────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // Migrate old v1 format that lacked capital fields
      if (!('cash' in p)) {
        return { cash: STARTING_CAPITAL, realizedPnl: 0, bear: p.bear || [], bull: p.bull || [], history: [], usdNok: 9.2 };
      }
      return p;
    }
  } catch {}
  return { cash: STARTING_CAPITAL, realizedPnl: 0, bear: [], bull: [], history: [], usdNok: 9.2 };
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchPrice(ticker, exchange) {
  const suffix = exchange === 'OSL' ? '.OL' : '';
  const symbol = ticker.toUpperCase() + suffix;
  try {
    const r = await fetch(`/api/price?ticker=${encodeURIComponent(symbol)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.price) return null;
    return { price: d.price, currency: d.currency || (exchange === 'OSL' ? 'NOK' : 'USD') };
  } catch {
    return null;
  }
}

async function fetchUsdNok() {
  try {
    const r = await fetch('/api/price?ticker=USDNOK%3DX');
    if (!r.ok) return null;
    const d = await r.json();
    return d.price || null;
  } catch {
    return null;
  }
}

// ── Calculations ──────────────────────────────────────────────────────────────
function positionCurrency(p) {
  return p.currency || (p.exchange === 'OSL' ? 'NOK' : 'USD');
}

function positionNokCost(p, usdNok) {
  if (p.nokCost != null) return p.nokCost;
  const cur = positionCurrency(p);
  return p.entryPrice * p.qty * (cur === 'NOK' ? 1 : usdNok);
}

function calcPnl(pos, side) {
  const change = pos.currentPrice - pos.entryPrice;
  const pct = (change / pos.entryPrice) * 100;
  const pnlLocal = change * pos.qty;
  return side === 'bear'
    ? { pct: -pct, pnlLocal: -pnlLocal }
    : { pct, pnlLocal };
}

function toNok(amount, currency, usdNok) {
  return currency === 'NOK' ? amount : amount * usdNok;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

function fmtNok(v) {
  const abs = Math.abs(Math.round(v)).toLocaleString('nb-NO');
  return (v >= 0 ? '+' : '−') + abs + ' kr';
}

function fmtNokPlain(v) {
  return Math.round(v).toLocaleString('nb-NO') + ' kr';
}

function fmtPrice(v, currency) {
  if (currency === 'USD') return '$' + v.toFixed(2);
  return v.toFixed(2) + ' kr';
}

function fmtDate(s) {
  return new Date(s).toLocaleDateString('nb-NO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, valueColor, sub }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: valueColor || 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ view, setView, cash, usdNok }) {
  const freePct = Math.round((cash / STARTING_CAPITAL) * 100);
  return (
    <header style={{
      borderBottom: '1px solid var(--border)', padding: '0 32px',
      display: 'flex', alignItems: 'center', gap: 24, height: 56, flexShrink: 0,
    }}>
      <div style={{
        fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800,
        letterSpacing: '-0.02em', color: 'var(--text)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: 'var(--red)' }}>↓</span> BEARMARKET
      </div>

      <nav style={{ display: 'flex', gap: 4 }}>
        {['oversikt', 'short', 'long', 'historikk'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: view === v ? 'var(--bg3)' : 'transparent',
            color: view === v ? 'var(--text)' : 'var(--muted)',
            border: view === v ? '1px solid var(--border2)' : '1px solid transparent',
            padding: '6px 14px', borderRadius: 6, fontSize: 12,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            fontFamily: 'var(--mono)', fontWeight: 500,
            transition: 'all 0.15s', cursor: 'pointer',
          }}>
            {v}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 12 }}>
        {usdNok && (
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>
            USD/NOK <span style={{ color: 'var(--text)' }}>{usdNok.toFixed(2)}</span>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Ledig </span>
          <span style={{ color: cash < 5000 ? 'var(--red)' : 'var(--text)' }}>
            {Math.round(cash).toLocaleString('nb-NO')} kr
          </span>
          <span style={{ color: 'var(--muted2)', fontSize: 11 }}> ({freePct}%)</span>
        </div>
      </div>
    </header>
  );
}

// ── AddForm ───────────────────────────────────────────────────────────────────
function AddForm({ side, cash, usdNok, onAdd }) {
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('NASDAQ');
  const [qty, setQty] = useState(100);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleAdd() {
    const t = ticker.trim();
    if (!t) return;
    setLoading(true);
    setErr('');

    const result = await fetchPrice(t, exchange);
    if (!result) {
      setErr(`Fant ikke kurs for ${t.toUpperCase()}. Sjekk ticker og børs.`);
      setLoading(false);
      return;
    }

    const { price, currency } = result;
    const nokCost = toNok(price * Number(qty), currency, usdNok);

    if (nokCost > cash) {
      setErr(
        `Ikke nok kapital. Trenger ${Math.round(nokCost).toLocaleString('nb-NO')} kr, ` +
        `har ${Math.round(cash).toLocaleString('nb-NO')} kr ledig.`
      );
      setLoading(false);
      return;
    }

    onAdd({
      id: Date.now(),
      ticker: t.toUpperCase(),
      exchange,
      qty: Number(qty),
      entryPrice: price,
      currentPrice: price,
      currency,
      nokCost,
      entryUsdNok: usdNok,
      addedAt: new Date().toISOString(),
    });
    setTicker('');
    setLoading(false);
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Åpne {side === 'bear' ? 'short' : 'long'}-posisjon
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px auto', gap: 10, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Ticker</div>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={side === 'bear' ? 'f.eks. NEL, TSLA' : 'f.eks. EQNR, AAPL'}
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
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Antall aksjer</div>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} min={1} />
        </div>
        <button
          className="btn-primary"
          onClick={handleAdd}
          disabled={loading || !ticker.trim() || Number(qty) < 1}
        >
          {loading ? '…' : '+ Åpne'}
        </button>
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{err}</div>}
    </div>
  );
}

// ── PositionTable ─────────────────────────────────────────────────────────────
function PositionTable({ positions, side, usdNok, onClose, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  const totPnlNok = positions.reduce((s, p) => {
    const { pnlLocal } = calcPnl(p, side);
    return s + toNok(pnlLocal, positionCurrency(p), usdNok);
  }, 0);

  if (!positions.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
      Ingen åpne posisjoner — legg til en ticker ovenfor
    </div>
  );

  const cols = ['Ticker', 'Børs', 'Antall', 'Inngang', 'Nå', 'Endring', 'P&L (NOK)', 'Kostnad', ''];
  const rightAligned = new Set(['Endring', 'P&L (NOK)', 'Kostnad', '']);

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {positions.length} åpen{positions.length !== 1 ? 'e' : ''} posisjon{positions.length !== 1 ? 'er' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: totPnlNok >= 0 ? 'var(--green)' : 'var(--red)' }}>
            Urealisert: {fmtNok(totPnlNok)}
          </span>
          <button className="btn-ghost" onClick={handleRefresh} style={{ fontSize: 11 }}>
            {refreshing ? 'oppdaterer…' : '↻ oppdater'}
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map(h => (
              <th key={h} style={{
                padding: '10px 16px',
                textAlign: rightAligned.has(h) ? 'right' : 'left',
                fontSize: 10, color: 'var(--muted)',
                letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const cur = positionCurrency(p);
            const { pct, pnlLocal } = calcPnl(p, side);
            const pnlNokVal = toNok(pnlLocal, cur, usdNok);
            const win = pct >= 0;
            return (
              <tr key={p.id} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 14 }}>{p.ticker}</td>
                <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--muted)' }}>{p.exchange}</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{p.qty.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                  {fmtPrice(p.entryPrice, cur)}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>
                  {fmtPrice(p.currentPrice, cur)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: win ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {fmtPct(pct)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: win ? 'var(--green)' : 'var(--red)' }}>
                  {fmtNok(pnlNokVal)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>
                  {fmtNokPlain(positionNokCost(p, usdNok))}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button className="btn-close" onClick={() => onClose(p.id)}>Lukk</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── HistoryTable ──────────────────────────────────────────────────────────────
function HistoryTable({ history }) {
  if (!history.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
      Ingen lukkede posisjoner enda
    </div>
  );

  const totalRealized = history.reduce((s, h) => s + h.pnlNok, 0);
  const cols = ['Ticker', 'Side', 'Antall', 'Inngang', 'Utgang', 'Endring', 'Gevinst/Tap', 'Lukket'];
  const rightAligned = new Set(['Endring', 'Gevinst/Tap', 'Lukket']);

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {history.length} lukket{history.length !== 1 ? 'e' : ''} posisjon{history.length !== 1 ? 'er' : ''}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: totalRealized >= 0 ? 'var(--green)' : 'var(--red)' }}>
          Total realisert: {fmtNok(totalRealized)}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map(h => (
              <th key={h} style={{
                padding: '10px 16px',
                textAlign: rightAligned.has(h) ? 'right' : 'left',
                fontSize: 10, color: 'var(--muted)',
                letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => {
            const cur = positionCurrency(h);
            const win = h.pnlNok >= 0;
            const pct = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100 * (h.side === 'bear' ? -1 : 1);
            return (
              <tr key={h.id + '-' + h.closedAt} style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 14 }}>{h.ticker}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span className={`tag tag-${h.side}`}>{h.side === 'bear' ? 'short' : 'long'}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{h.qty.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>
                  {fmtPrice(h.entryPrice, cur)}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>
                  {fmtPrice(h.exitPrice, cur)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: win ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {fmtPct(pct)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: win ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {fmtNok(h.pnlNok)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>
                  {fmtDate(h.closedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ portfolio }) {
  const { cash, realizedPnl, bear, bull, history, usdNok } = portfolio;

  const bearUnrealized = bear.reduce((s, p) => {
    const { pnlLocal } = calcPnl(p, 'bear');
    return s + toNok(pnlLocal, positionCurrency(p), usdNok);
  }, 0);

  const bullUnrealized = bull.reduce((s, p) => {
    const { pnlLocal } = calcPnl(p, 'bull');
    return s + toNok(pnlLocal, positionCurrency(p), usdNok);
  }, 0);

  const totalUnrealized = bearUnrealized + bullUnrealized;
  const totalInPositions = [...bear, ...bull].reduce((s, p) => s + positionNokCost(p, usdNok), 0);
  const totalValue = cash + totalInPositions + totalUnrealized;
  const totalReturn = totalValue - STARTING_CAPITAL;
  const totalReturnPct = (totalReturn / STARTING_CAPITAL) * 100;

  const chartData = [];
  if (bear.length) {
    const avg = bear.reduce((s, p) => s + calcPnl(p, 'bear').pct, 0) / bear.length;
    chartData.push({ name: 'Short ↓', value: parseFloat(avg.toFixed(2)), side: 'bear' });
  }
  if (bull.length) {
    const avg = bull.reduce((s, p) => s + calcPnl(p, 'bull').pct, 0) / bull.length;
    chartData.push({ name: 'Long ↑', value: parseFloat(avg.toFixed(2)), side: 'bull' });
  }

  const allOpen = [
    ...bear.map(p => ({ ...p, ...calcPnl(p, 'bear'), side: 'bear' })),
    ...bull.map(p => ({ ...p, ...calcPnl(p, 'bull'), side: 'bull' })),
  ].sort((a, b) => b.pct - a.pct);

  return (
    <div>
      {/* Portfolio value banner */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '24px 28px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Total porteføljeverdi
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 38, fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-0.03em' }}>
            {Math.round(totalValue).toLocaleString('nb-NO')} kr
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: totalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmtNok(totalReturn)} ({fmtPct(totalReturnPct)})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 16, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>Start: <span style={{ color: 'var(--text)' }}>{STARTING_CAPITAL.toLocaleString('nb-NO')} kr</span></span>
          <span>Ledig: <span style={{ color: 'var(--text)' }}>{Math.round(cash).toLocaleString('nb-NO')} kr</span></span>
          <span>I posisjoner: <span style={{ color: 'var(--text)' }}>{Math.round(totalInPositions).toLocaleString('nb-NO')} kr</span></span>
          <span>Urealisert: <span style={{ color: totalUnrealized >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtNok(totalUnrealized)}</span></span>
          <span>Realisert: <span style={{ color: realizedPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtNok(realizedPnl)}</span></span>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard
          label="Short P&L"
          value={fmtNok(bearUnrealized)}
          valueColor={bearUnrealized >= 0 ? 'var(--green)' : 'var(--red)'}
          sub={`${bear.length} posisjon${bear.length !== 1 ? 'er' : ''} åpen`}
        />
        <StatCard
          label="Long P&L"
          value={fmtNok(bullUnrealized)}
          valueColor={bullUnrealized >= 0 ? 'var(--green)' : 'var(--red)'}
          sub={`${bull.length} posisjon${bull.length !== 1 ? 'er' : ''} åpen`}
        />
        <StatCard
          label="Realisert gevinst"
          value={fmtNok(realizedPnl)}
          valueColor={realizedPnl >= 0 ? 'var(--green)' : 'var(--red)'}
          sub={`${history.length} lukket`}
        />
        <StatCard
          label="Ledig kapital"
          value={fmtNokPlain(cash)}
          valueColor={cash < 5000 ? 'var(--red)' : 'var(--text)'}
          sub={`${Math.round((cash / STARTING_CAPITAL) * 100)}% av startkapital`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: chartData.length ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Chart */}
        {chartData.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
              Gjennomsnittsavkastning per side
            </div>
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
        )}

        {/* All open positions */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Åpne posisjoner
          </div>
          {allOpen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 8 }}>Ingen åpne posisjoner</div>
          ) : (
            allOpen.map((p, i) => {
              const pnlNokVal = toNok(p.pnlLocal, positionCurrency(p), usdNok);
              return (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: i < allOpen.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.ticker}</span>
                    <span className={`tag tag-${p.side}`}>{p.side === 'bear' ? 'short' : 'long'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: pnlNokVal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtNok(pnlNokVal)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: p.pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtPct(p.pct)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {bear.length === 0 && bull.length === 0 && history.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
          Gå til "short" eller "long" for å åpne dine første posisjoner
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('oversikt');
  const [portfolio, setPortfolio] = useState(loadState);

  useEffect(() => { saveState(portfolio); }, [portfolio]);

  // Fetch live USD/NOK rate on mount
  useEffect(() => {
    fetchUsdNok().then(rate => {
      if (rate) setPortfolio(prev => ({ ...prev, usdNok: rate }));
    });
  }, []);

  const addPosition = useCallback((side, pos) => {
    setPortfolio(prev => ({
      ...prev,
      cash: prev.cash - pos.nokCost,
      [side]: [...prev[side], pos],
    }));
  }, []);

  const closePosition = useCallback((side, posId) => {
    setPortfolio(prev => {
      const pos = prev[side].find(p => p.id === posId);
      if (!pos) return prev;

      const { pnlLocal } = calcPnl(pos, side);
      const cur = positionCurrency(pos);
      const pnlNokVal = toNok(pnlLocal, cur, prev.usdNok);
      const cost = positionNokCost(pos, prev.usdNok);

      const historyEntry = {
        ...pos,
        side,
        exitPrice: pos.currentPrice,
        pnlLocal,
        pnlNok: pnlNokVal,
        closedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        cash: prev.cash + cost + pnlNokVal,
        realizedPnl: prev.realizedPnl + pnlNokVal,
        [side]: prev[side].filter(p => p.id !== posId),
        history: [historyEntry, ...prev.history],
      };
    });
  }, []);

  const refreshPrices = useCallback(async (side) => {
    const positions = portfolio[side];
    const updated = await Promise.all(
      positions.map(async p => {
        const result = await fetchPrice(p.ticker, p.exchange);
        return result ? { ...p, currentPrice: result.price } : p;
      })
    );
    setPortfolio(prev => ({ ...prev, [side]: updated }));
  }, [portfolio]);

  const resetPortfolio = useCallback(() => {
    if (window.confirm('Nullstille hele porteføljen? All historikk og alle posisjoner slettes og du starter med 100 000 kr igjen.')) {
      setPortfolio(prev => ({
        cash: STARTING_CAPITAL,
        realizedPnl: 0,
        bear: [],
        bull: [],
        history: [],
        usdNok: prev.usdNok,
      }));
    }
  }, []);

  const pageStyle = { flex: 1, padding: '32px', maxWidth: 1200, width: '100%', margin: '0 auto' };

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header view={view} setView={setView} cash={portfolio.cash} usdNok={portfolio.usdNok} />

        <main style={pageStyle}>
          {view === 'oversikt' && <Overview portfolio={portfolio} />}

          {view === 'short' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  Short-portefølje
                </h1>
                <span className="tag tag-bear">Bear</span>
              </div>
              <AddForm
                side="bear"
                cash={portfolio.cash}
                usdNok={portfolio.usdNok}
                onAdd={pos => addPosition('bear', pos)}
              />
              <PositionTable
                positions={portfolio.bear}
                side="bear"
                usdNok={portfolio.usdNok}
                onClose={id => closePosition('bear', id)}
                onRefresh={() => refreshPrices('bear')}
              />
            </>
          )}

          {view === 'long' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  Long-portefølje
                </h1>
                <span className="tag tag-bull">Bull</span>
              </div>
              <AddForm
                side="bull"
                cash={portfolio.cash}
                usdNok={portfolio.usdNok}
                onAdd={pos => addPosition('bull', pos)}
              />
              <PositionTable
                positions={portfolio.bull}
                side="bull"
                usdNok={portfolio.usdNok}
                onClose={id => closePosition('bull', id)}
                onRefresh={() => refreshPrices('bull')}
              />
            </>
          )}

          {view === 'historikk' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  Historikk
                </h1>
                <button className="btn-outline" onClick={resetPortfolio}>
                  Nullstill portefølje
                </button>
              </div>
              <HistoryTable history={portfolio.history} />
            </>
          )}
        </main>
      </div>
    </>
  );
}
