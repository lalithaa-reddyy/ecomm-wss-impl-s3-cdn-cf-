import { useState, useEffect, useRef, memo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT;
const REFRESH_MS = 3000;

// Colors for event types
const EC = {
  page_view:    { bg:"#1e3a5f", border:"#2d6a9f", text:"#63b3ed" },
  product_view: { bg:"#1a3a2a", border:"#276749", text:"#68d391" },
  add_to_cart:  { bg:"#3d2b00", border:"#744210", text:"#f6ad55" },
  order:        { bg:"#3b1f3b", border:"#6b2d6b", text:"#d6bcfa" },
};
const CAT_PAL  = ["#63b3ed","#68d391","#f6ad55","#d6bcfa","#fc8181","#76e4f7","#fbb6ce","#b7f5d8"];
const CAMP_PAL = ["#4299e1","#48bb78","#ed8936","#9f7aea","#f56565"];
const AGE_PAL  = { "13-18":"#63b3ed", "19-25":"#68d391", "26-35":"#f6ad55", "36-45":"#d6bcfa", "46-55":"#fc8181", "55+":"#76e4f7" };
const ec = t => EC[t] || { bg:"#1e2232", border:"#374151", text:"#a0aec0" };

// Formatters
const fmt    = n => (n === undefined || n === null) ? "0" : Number(n).toLocaleString();
const fmtCur = n => "Rs " + fmt(n);
const pct    = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : "0.0";

// UI Components
function Card({ children, style = {} }) {
  return (
    <div style={{ background:"#1a1d2e", border:"1px solid #2d3748", borderRadius:14, padding:"22px 24px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize:12, fontWeight:700, color:"#718096", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16 }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, accent = "#63b3ed" }) {
  return (
    <Card>
      <div style={{ fontSize:12, color:"#718096", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:36, fontWeight:800, color:accent, lineHeight:1, marginBottom:6 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#4a5568" }}>{sub}</div>}
    </Card>
  );
}

function HBar({ label, value, maxVal, color = "#63b3ed", sub = null }) {
  const w = maxVal > 0 ? Math.max(2, (value / maxVal) * 100) : 0;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:13 }}>
        <span style={{ color:"#e2e8f0" }}>{label}</span>
        <span style={{ color, fontWeight:700 }}>
          {fmt(value)}
          {sub && <span style={{ color:"#4a5568", fontWeight:400, marginLeft:6 }}>{sub}</span>}
        </span>
      </div>
      <div style={{ height:6, background:"#2d3748", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${w}%`, background:color, borderRadius:4, transition:"width 0.7s ease" }} />
      </div>
    </div>
  );
}

function EmptyState({ msg = "No data yet - start the event stream" }) {
  return (
    <div style={{ textAlign:"center", padding:"40px 24px", color:"#4a5568" }}>
      <div style={{ fontSize:34, marginBottom:10 }}>[NO DATA]</div>
      <div style={{ fontSize:14, color:"#718096" }}>{msg}</div>
    </div>
  );
}

function Pulse({ active }) {
  return (
    <span style={{
      display:"inline-block", width:9, height:9, borderRadius:"50%",
      background: active ? "#48bb78" : "#4a5568",
      boxShadow: active ? "0 0 7px #48bb78" : "none",
      marginRight:7, transition:"all 0.4s"
    }} />
  );
}

// Dashboard Panels
const OverviewDashboard = memo(function OverviewDashboard({ metrics }) {
  const avgPerMin = metrics?.dataPoints > 0
    ? Math.round(metrics.totalEvents / metrics.dataPoints).toLocaleString() : "0";
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
        <StatBox label="Total Events"  value={fmt(metrics?.totalEvents)}                       sub={`${fmt(metrics?.dataPoints)} minutes tracked`}      accent="#63b3ed" />
        <StatBox label="Avg / Minute"  value={avgPerMin}                                        sub="events per minute"                                  accent="#68d391" />
        <StatBox label="Total Revenue" value={fmtCur(metrics?.revenueStats?.total_revenue)}    sub={`${fmt(metrics?.revenueStats?.order_count)} orders`} accent="#f6ad55" />
      </div>

      {metrics && Object.keys(metrics.eventsByType).length > 0 && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>Events by Type</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))", gap:12 }}>
            {["page_view","product_view","add_to_cart","order"].map(type => {
              const count = metrics.eventsByType[type] || 0;
              const c = ec(type);
              const p = pct(count, metrics.totalEvents);
              return (
                <div key={type} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:"15px 17px" }}>
                  <div style={{ fontSize:11, color:c.text, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>
                    {type.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize:26, fontWeight:800, color:"#e2e8f0", marginBottom:4 }}>{fmt(count)}</div>
                  <div style={{ height:4, background:"#2d3748", borderRadius:4, overflow:"hidden", marginBottom:4 }}>
                    <div style={{ height:"100%", width:`${p}%`, background:c.text, borderRadius:4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {metrics?.recentMinutes?.length > 0 && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>Events Timeline Chart</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metrics.recentMinutes.slice().reverse()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="id" tick={{ fontSize:11, fill:"#718096" }} />
              <YAxis tick={{ fontSize:11, fill:"#718096" }} />
              <Tooltip 
                contentStyle={{ background:"#1a1d2e", border:"1px solid #2d3748", borderRadius:8 }}
                labelStyle={{ color:"#e2e8f0" }}
              />
              <Legend wrapperStyle={{ color:"#a0aec0" }} />
              <Line type="monotone" dataKey="page_view" stroke="#63b3ed" strokeWidth={2} name="Page Views" />
              <Line type="monotone" dataKey="product_view" stroke="#68d391" strokeWidth={2} name="Product Views" />
              <Line type="monotone" dataKey="add_to_cart" stroke="#f6ad55" strokeWidth={2} name="Add to Cart" />
              <Line type="monotone" dataKey="order" stroke="#d6bcfa" strokeWidth={2} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {metrics?.recentMinutes?.length > 0 && (
        <Card>
          <SectionTitle>Recent Minutes Timeline</SectionTitle>
          <div style={{ maxHeight:300, overflowY:"auto" }}>
            {metrics.recentMinutes.map((item, i) => {
              const parts = Object.entries(item).filter(([k, v]) => k !== "id" && k !== "lastSeen" && k !== "total" && typeof v === "number");
              return (
                <div key={item.id || i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 0", borderBottom:"1px solid #1e2232", fontSize:12 }}>
                  <div style={{ minWidth:128, color:"#63b3ed", fontFamily:"monospace" }}>
                    {(item.id || "").replace("live#", "")} UTC
                  </div>
                  <div style={{ flex:1, display:"flex", flexWrap:"wrap", gap:5 }}>
                    <span style={{ background:"#1e3a5f", color:"#63b3ed", padding:"2px 8px", borderRadius:20 }}>total: {fmt(item.total)}</span>
                    {parts.map(([k, v]) => {
                      const c = ec(k);
                      return <span key={k} style={{ background:c.bg, color:c.text, padding:"2px 8px", borderRadius:20 }}>{k.replace(/_/g, " ")}: {fmt(v)}</span>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {metrics?.totalEvents === 0 && <EmptyState />}
    </div>
  );
});

const CampaignDashboard = memo(function CampaignDashboard({ metrics }) {
  const camps   = metrics?.campaignStats || {};
  const entries = Object.entries(camps).sort((a, b) => (b[1].revenue || 0) - (a[1].revenue || 0));
  const totRev  = entries.reduce((s, [, v]) => s + (v.revenue     || 0), 0);
  const totOrd  = entries.reduce((s, [, v]) => s + (v.order_count || 0), 0);
  const totTraf = entries.reduce((s, [, v]) => s + (v.total       || 0), 0);
  if (entries.length === 0) return <EmptyState msg="Start streaming to see campaign data" />;
  const cName = n => n.replace("cmp_", "").replace(/_/g, " ");

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
        <StatBox label="Campaigns"     value={entries.length}     sub="active campaigns"    accent="#4299e1" />
        <StatBox label="Total Orders"  value={fmt(totOrd)}        sub="across all campaigns" accent="#68d391" />
        <StatBox label="Total Revenue" value={fmtCur(totRev)}     sub="campaign attributed"  accent="#f6ad55" />
        <StatBox label="Top Campaign"  value={cName(entries[0]?.[0] || "-")} sub={`Rs ${fmt(entries[0]?.[1]?.revenue || 0)}`} accent="#d6bcfa" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <Card>
          <SectionTitle>Revenue by Campaign (% of Total)</SectionTitle>
          {entries.map(([name, data], i) =>
            <HBar key={name} label={cName(name)} value={data.revenue || 0} maxVal={totRev || 1} color={CAMP_PAL[i % CAMP_PAL.length]} sub={`${pct(data.revenue || 0, totRev)}% of revenue, ${fmt(data.order_count || 0)} orders`} />
          )}
        </Card>
        <Card>
          <SectionTitle>Traffic by Campaign (% of Total)</SectionTitle>
          {entries.map(([name, data], i) =>
            <HBar key={name} label={cName(name)} value={data.total || 0} maxVal={totTraf || 1} color={CAMP_PAL[i % CAMP_PAL.length]} sub={`${pct(data.total || 0, totTraf)}%`} />
          )}
        </Card>
      </div>
    </div>
  );
});

const GeoDashboard = memo(function GeoDashboard({ metrics }) {
  const geo     = metrics?.geoStats || {};
  const entries = Object.entries(geo).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  const totTraf = entries.reduce((s, [, v]) => s + (v.total   || 0), 0);
  const totRev  = entries.reduce((s, [, v]) => s + (v.revenue || 0), 0);
  if (entries.length === 0) return <EmptyState msg="Start streaming to see geographic data" />;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        <Card>
          <SectionTitle>Top Cities by Traffic (% of Total)</SectionTitle>
          {entries.map(([city, data], i) =>
            <HBar key={city} label={city} value={data.total || 0} maxVal={totTraf || 1} color={CAT_PAL[i % CAT_PAL.length]} sub={`${pct(data.total || 0, totTraf)}%, ${fmt(data.order_count || 0)} orders`} />
          )}
        </Card>
        <Card>
          <SectionTitle>Revenue by City (% of Total)</SectionTitle>
          {totRev === 0
            ? <EmptyState msg="No orders yet - revenue will appear after orders are placed" />
            : entries.map(([city, data], i) =>
                <HBar key={city} label={city} value={data.revenue || 0} maxVal={totRev || 1} color={CAT_PAL[i % CAT_PAL.length]} sub={`${pct(data.revenue || 0, totRev)}% of revenue, ${fmt(data.order_count || 0)} orders`} />
              )
          }
        </Card>
      </div>
      <Card>
        <SectionTitle>City Performance Table</SectionTitle>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr>
              {["City","Events","Orders","Revenue","Conv. Rate"].map(h => (
                <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"#718096", fontWeight:600, borderBottom:"1px solid #2d3748" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(([city, data], i) => {
              const cr = data.total > 0 ? ((data.order_count || 0) / data.total * 100).toFixed(2) : "0.00";
              return (
                <tr key={city} style={{ borderBottom:"1px solid #1e2232" }}>
                  <td style={{ padding:"9px 10px", color:CAT_PAL[i % CAT_PAL.length], fontWeight:600 }}>{city}</td>
                  <td style={{ padding:"9px 10px", color:"#a0aec0" }}>{fmt(data.total)}</td>
                  <td style={{ padding:"9px 10px", color:"#a0aec0" }}>{fmt(data.order_count || 0)}</td>
                  <td style={{ padding:"9px 10px", color:"#f6ad55" }}>{fmtCur(data.revenue || 0)}</td>
                  <td style={{ padding:"9px 10px", color: Number(cr) > 0 ? "#68d391" : "#4a5568", fontWeight:700 }}>{cr}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
});

const RevenueDashboard = memo(function RevenueDashboard({ metrics }) {
  const rev        = metrics?.revenueStats  || {};
  const cats       = metrics?.categoryStats || {};
  const geo        = metrics?.geoStats      || {};
  const catEntries = Object.entries(cats).filter(([, v]) => v.revenue > 0).sort((a, b) => (b[1].revenue || 0) - (a[1].revenue || 0));
  const geoEntries = Object.entries(geo).filter(([, v]) => v.revenue > 0).sort((a, b) => (b[1].revenue || 0) - (a[1].revenue || 0));
  const totCatRev  = catEntries.reduce((s, [, v]) => s + (v.revenue || 0), 0);
  const totGeoRev  = geoEntries.reduce((s, [, v]) => s + (v.revenue || 0), 0);
  const topCat     = catEntries[0];
  if (!rev.total_revenue) return <EmptyState msg="Start streaming to see revenue data" />;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
        <StatBox label="Total Revenue"   value={fmtCur(rev.total_revenue)}  sub="cumulative"        accent="#f6ad55" />
        <StatBox label="Total Orders"    value={fmt(rev.order_count)}        sub="completed orders"  accent="#68d391" />
        <StatBox label="Avg Order Value" value={fmtCur(rev.avg_order_value)} sub="per order"         accent="#d6bcfa" />
        <StatBox label="Top Category"    value={topCat ? topCat[0].replace(/_/g, " ") : "-"} sub={topCat ? `Rs ${fmt(topCat[1].revenue)}` : ""} accent="#63b3ed" />
      </div>

      {catEntries.length > 0 && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>Revenue by Category (Chart)</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={catEntries.map(([name, data], i) => ({ category: name.replace(/_/g, " "), revenue: data.revenue || 0, orders: data.order || 0, fill: CAT_PAL[i % CAT_PAL.length] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="category" tick={{ fontSize:11, fill:"#718096" }} />
              <YAxis tick={{ fontSize:11, fill:"#718096" }} />
              <Tooltip contentStyle={{ background:"#1a1d2e", border:"1px solid #2d3748", borderRadius:8 }} formatter={(val) => fmtCur(val)} />
              <Bar dataKey="revenue" fill="#f6ad55" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <Card>
          <SectionTitle>Revenue by Category (% of Total)</SectionTitle>
          {catEntries.length === 0
            ? <EmptyState msg="No category revenue yet" />
            : catEntries.map(([name, data], i) =>
                <HBar key={name} label={name.replace(/_/g, " ")} value={data.revenue || 0} maxVal={totCatRev || 1} color={CAT_PAL[i % CAT_PAL.length]} sub={`${pct(data.revenue || 0, totCatRev)}% of category revenue, ${fmt(data.order || 0)} orders`} />
              )
          }
        </Card>
        <Card>
          <SectionTitle>Revenue by City (% of Total)</SectionTitle>
          {totGeoRev === 0
            ? <EmptyState msg="No orders yet - city revenue will appear after orders are placed" />
            : geoEntries.map(([city, data], i) =>
                <HBar key={city} label={city} value={data.revenue || 0} maxVal={totGeoRev || 1} color={CAT_PAL[i % CAT_PAL.length]} sub={`${pct(data.revenue || 0, totGeoRev)}% of geo revenue, ${fmt(data.order_count || 0)} orders`} />
              )
          }
        </Card>
      </div>
    </div>
  );
});

const AgeSegmentationDashboard = memo(function AgeSegmentationDashboard({ metrics }) {
  const ages     = metrics?.ageStats || {};
  const entries  = Object.entries(ages).sort((a, b) => {
    const order = { "13-18":0, "19-25":1, "26-35":2, "36-45":3, "46-55":4, "55+":5 };
    return (order[a[0]] || 99) - (order[b[0]] || 99);
  });
  const totTraf  = entries.reduce((s, [, v]) => s + (v.total || 0), 0);
  const totRev   = entries.reduce((s, [, v]) => s + (v.revenue || 0), 0);
  const totOrd   = entries.reduce((s, [, v]) => s + (v.order_count || 0), 0);
  const topByTraffic = Object.entries(ages).reduce((max, [k, v]) => !max || v.total > max.total ? { age: k, ...v } : max, null);
  if (entries.length === 0) return <EmptyState msg="Start streaming to see age segment data" />;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
        <StatBox label="Age Groups" value={entries.length} sub="tracked segments" accent="#63b3ed" />
        <StatBox label="Total Orders (All Ages)" value={fmt(totOrd)} sub="across all age groups" accent="#68d391" />
        <StatBox label="Total Revenue (All Ages)" value={fmtCur(totRev)} sub="age-attributed revenue" accent="#f6ad55" />
        <StatBox label="Top Age Group" value={topByTraffic?.age || "-"} sub={topByTraffic ? `${fmt(topByTraffic.total)} events` : ""} accent="#d6bcfa" />
      </div>

      <Card style={{ marginBottom:20 }}>
        <SectionTitle>Age Group Traffic & Revenue Comparison</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={entries.map(([age, data]) => ({ age, traffic: (data.total || 0), revenue: (data.revenue || 0) / 1000 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis dataKey="age" tick={{ fontSize:11, fill:"#718096" }} />
            <YAxis yAxisId="left" tick={{ fontSize:11, fill:"#718096" }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11, fill:"#718096" }} />
            <Tooltip contentStyle={{ background:"#1a1d2e", border:"1px solid #2d3748", borderRadius:8 }} />
            <Legend wrapperStyle={{ color:"#a0aec0" }} />
            <Bar yAxisId="left" dataKey="traffic" fill="#63b3ed" name="Events" radius={[8, 8, 0, 0]} />
            <Bar yAxisId="right" dataKey="revenue" fill="#f6ad55" name="Revenue (Thousands)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        <Card>
          <SectionTitle>Traffic by Age Group (% of Total)</SectionTitle>
          {entries.map(([age, data], i) =>
            <HBar key={age} label={age} value={data.total || 0} maxVal={totTraf || 1} color={AGE_PAL[age] || CAT_PAL[i % CAT_PAL.length]} sub={`${pct(data.total || 0, totTraf)}% of traffic`} />
          )}
        </Card>
        <Card>
          <SectionTitle>Revenue by Age Group (% of Total)</SectionTitle>
          {entries.filter(([, v]) => (v.revenue || 0) > 0).length === 0
            ? <EmptyState msg="No orders yet" />
            : entries.map(([age, data]) =>
                data.revenue > 0 && (
                  <HBar key={age} label={age} value={data.revenue || 0} maxVal={totRev || 1} color={AGE_PAL[age] || CAT_PAL[0]} sub={`${pct(data.revenue || 0, totRev)}% of revenue, ${fmt(data.order_count || 0)} orders`} />
                )
              )
          }
        </Card>
      </div>
      <Card>
        <SectionTitle>Age Group Funnel Analysis</SectionTitle>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr>
                {["Age Group","Page Views","Product Views","Add to Cart","Orders","Conv. Rate"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"#718096", fontWeight:600, borderBottom:"1px solid #2d3748" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(([age, data]) => {
                const pv = data.page_view || 0;
                const o  = data.order || 0;
                const cr = pv > 0 ? ((o / pv) * 100).toFixed(2) : "0.00";
                return (
                  <tr key={age} style={{ borderBottom:"1px solid #1e2232" }}>
                    <td style={{ padding:"9px 10px", color:AGE_PAL[age] || "#a0aec0", fontWeight:600 }}>{age}</td>
                    {["page_view","product_view","add_to_cart","order"].map(t => (
                      <td key={t} style={{ padding:"9px 10px", color:"#a0aec0" }}>{fmt(data[t] || 0)}</td>
                    ))}
                    <td style={{ padding:"9px 10px", color: Number(cr) > 0 ? "#68d391" : "#4a5568", fontWeight:700 }}>{cr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
});

// Tab configuration
const TABS = [
  { id:"overview",  label:"Overview" },
  { id:"campaign",  label:"Campaigns" },
  { id:"geography", label:"Geography" },
  { id:"age",       label:"Age Groups" },
  { id:"revenue",   label:"Revenue" },
];

// Main App
export default function App() {
  const [metrics,       setMetrics]       = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error,         setError]         = useState(null);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const [activeTab,     setActiveTab]     = useState("overview");
  const [countdown,     setCountdown]     = useState(REFRESH_MS / 1000);

  const wsRef        = useRef(null);
  const intervalRef  = useRef(null);
  const reconnectRef = useRef(null);

  const requestMetrics = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "getMetrics" }));
    }
  };

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_ENDPOINT);
      wsRef.current = ws;

      ws.onopen = () => {
        setError(null);
        requestMetrics();
        intervalRef.current = setInterval(requestMetrics, REFRESH_MS);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMetrics(data);
          setLastUpdate(new Date().toLocaleTimeString());
          setError(null);
          setIsInitialLoad(false);
        } catch (err) {
          setError(err.message);
        }
      };

      ws.onerror = () => setError("WebSocket error - retrying...");

      ws.onclose = () => {
        clearInterval(intervalRef.current);
        reconnectRef.current = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  // Simple countdown timer
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_MS / 1000 : c - 1), 1000);
    return () => clearInterval(t);
  }, []);

  const isLive = (metrics?.totalEvents || 0) > 0;

  if (isInitialLoad) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#718096", flexDirection:"column", gap:10 }}>
        <div style={{ fontSize:22 }}>Connecting to dashboard...</div>
        <div style={{ fontSize:12 }}>Waiting for WebSocket connection...</div>
      </div>
    );
  }

  const renderPanel = () => {
    switch (activeTab) {
      case "overview":  return <OverviewDashboard  metrics={metrics} />;
      case "campaign":  return <CampaignDashboard  metrics={metrics} />;
      case "geography": return <GeoDashboard       metrics={metrics} />;
      case "age":       return <AgeSegmentationDashboard metrics={metrics} />;
      case "revenue":   return <RevenueDashboard   metrics={metrics} />;
      default:          return null;
    }
  };

  return (
    <div style={{ padding:"24px 28px", maxWidth:1320, margin:"0 auto", background:"#0f1419", minHeight:"100vh", color:"#e2e8f0", fontFamily:"'Segoe UI', sans-serif" }}>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, color:"#e2e8f0", margin:0 }}>Event Stream Analytics Dashboard</h1>
          <div style={{ fontSize:12, color:"#4a5568", marginTop:3 }}>Real-time DynamoDB aggregations - Auto-refresh every {REFRESH_MS / 1000}s</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", background:isLive?"#1a3a2a":"#1e2232", border:`1px solid ${isLive?"#276749":"#2d3748"}`, padding:"7px 14px", borderRadius:24, fontSize:12 }}>
            <Pulse active={isLive} />
            <span style={{ color:isLive?"#68d391":"#718096" }}>{isLive ? "LIVE" : "IDLE"}</span>
          </div>
          <div style={{ background:"#1e2232", border:"1px solid #2d3748", padding:"7px 14px", borderRadius:24, fontSize:12, color:"#718096" }}>
            Refresh in {countdown}s
          </div>
        </div>
      </div>


      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:22, borderBottom:"1px solid #2d3748" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            background:    activeTab === tab.id ? "#1e3a5f"     : "transparent",
            border:        activeTab === tab.id ? "1px solid #2d6a9f" : "1px solid transparent",
            color:         activeTab === tab.id ? "#63b3ed"     : "#718096",
            padding:       "8px 16px",
            borderRadius:  "8px 8px 0 0",
            cursor:        "pointer",
            fontSize:      13,
            fontWeight:    activeTab === tab.id ? 700 : 400,
            transition:    "all 0.2s",
            marginBottom:  -1,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {renderPanel()}

      <div style={{ marginTop:28, fontSize:11, color:"#2d3748", textAlign:"right" }}>
        Last updated: {lastUpdate || "-"} - WebSocket: {WS_ENDPOINT}
      </div>
    </div>
  );
}