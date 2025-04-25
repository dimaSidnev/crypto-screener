import React, { useEffect, useState, useRef } from "react";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "LTC/USDT", "BNB/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h"];

export default function App() {
  const [timeframe, setTimeframe] = useState("1m");
  const [filters, setFilters] = useState({ volume: 0, change: 0, trades: 0 });
  const [tradeCounts, setTradeCounts] = useState({});
  const [tickers, setTickers] = useState({});
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("https://api.gateio.ws/api/v4/spot/tickers")
      .then((res) => res.json())
      .then((data) => {
        const tickerMap = {};
        data.forEach((item) => {
          tickerMap[item.currency_pair.replace("_", "/")] = {
            volume: parseFloat(item.base_volume),
            change: parseFloat(item.change_percentage),
          };
        });
        setTickers(tickerMap);
      });
  }, []);

  useEffect(() => {
    if (paused) return;
    const tradeSockets = {};
    SYMBOLS.forEach((symbol) => {
      const gateSymbol = symbol.replace("/", "_");
      const ws = new WebSocket("wss://api.gateio.ws/ws/v4/");
      ws.onopen = () => {
        ws.send(JSON.stringify({ time: Date.now(), channel: "spot.trades", event: "subscribe", payload: [gateSymbol] }));
      };
      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.result) return;
        setTradeCounts((prev) => {
          const updated = { ...prev };
          updated[symbol] = (updated[symbol] || 0) + 1;
          return updated;
        });
      };
      tradeSockets[symbol] = ws;
    });
    const interval = setInterval(() => setTradeCounts({}), 5000);
    return () => {
      Object.values(tradeSockets).forEach((ws) => ws.close());
      clearInterval(interval);
    };
  }, [paused]);

  const filtered = SYMBOLS.filter((s) => {
    const t = tickers[s];
    return (
      (tradeCounts[s] || 0) >= filters.trades &&
      (!t || (t.volume >= filters.volume && t.change >= filters.change))
    );
  });

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {TIMEFRAMES.map(t => (
          <button key={t} onClick={() => setTimeframe(t)}>{t}</button>
        ))}
        <input placeholder="Min Volume 24h" type="number" onChange={(e) => setFilters({ ...filters, volume: Number(e.target.value) })} />
        <input placeholder="Min Change 24h %" type="number" onChange={(e) => setFilters({ ...filters, change: Number(e.target.value) })} />
        <input placeholder="Min Trades in 5s" type="number" onChange={(e) => setFilters({ ...filters, trades: Number(e.target.value) })} />
        <button onClick={() => setPaused(!paused)}>{paused ? "▶️ Resume" : "⏸ Pause"}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map(symbol => (
          <ChartCard key={symbol} symbol={symbol} timeframe={timeframe} trades={tradeCounts[symbol] || 0} paused={paused} />
        ))}
      </div>
    </div>
  );
}

function ChartCard({ symbol, timeframe, trades, paused }) {
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [highlight, setHighlight] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (paused) return;
    const gateSymbol = symbol.replace("/", "_");
    const ws = new WebSocket("wss://api.gateio.ws/ws/v4/");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ time: Date.now(), channel: "spot.order_book_update", event: "subscribe", payload: [gateSymbol, "100ms"] }));
    };
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.result || !data.update) return;
      const { asks, bids } = data.update;
      setOrderBook({ asks: asks.slice(0, 5), bids: bids.slice(0, 5) });
      setHighlight(true);
      setTimeout(() => setHighlight(false), 300);
    };
    return () => ws.close();
  }, [symbol, paused]);

  return (
    <div style={{ border: '1px solid #444', borderRadius: 8, padding: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>{symbol} — {timeframe} — Trades: {trades}</div>
      <iframe
        style={{ width: '100%', height: 200 }}
        src={`https://s.tradingview.com/embed-widget/mini-symbol-overview/?locale=en#%7B%22symbol%22%3A%22BINANCE%3A${symbol.replace("/", "")}%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22220%22%2C%22locale%22%3A%22en%22%2C%22dateRange%22%3A%221D%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Afalse%7D`}
        frameBorder="0"
        allowTransparency
        scrolling="no"
      ></iframe>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
        <div style={{ color: 'lime' }}>
          {orderBook.bids.map(([p, s], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, animation: highlight ? 'pulse 0.3s' : 'none' }}>
              <span>{parseFloat(p).toFixed(2)}</span>
              <span>{parseFloat(s).toFixed(3)}</span>
            </div>
          ))}
        </div>
        <div style={{ color: 'red' }}>
          {orderBook.asks.map(([p, s], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, animation: highlight ? 'pulse 0.3s' : 'none' }}>
              <span>{parseFloat(p).toFixed(2)}</span>
              <span>{parseFloat(s).toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
