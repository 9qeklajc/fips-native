import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

interface MonitorViewProps {
  data: any;
  onClose: () => void;
}

type Tab =
  | "Node"
  | "Peers"
  | "Transports"
  | "Sessions"
  | "Tree"
  | "Filters"
  | "Performance"
  | "Routing";

function formatCount(value: any): string {
  const num = typeof value === "number" ? value : parseInt(value);
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
}

function formatBytes(value: any): string {
  const num = typeof value === "number" ? value : parseInt(value);
  if (isNaN(num) || num === 0) return "-";
  if (num < 1024) return `${num} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = num;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds?: number | null): string {
  if (seconds == null) return "N/A";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(" ");
}

function formatRelativeTime(timestampMs?: number | null): string {
  if (!timestampMs) return "N/A";
  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestampMs) / 1000),
  );
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${diffSeconds}s ago`;
}

export function MonitorView({ data: initialData, onClose }: MonitorViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Node");

  useEffect(() => {
    const activeEl = document.getElementById(`tab-${activeTab}`);
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

  const tabs: Tab[] = [
    "Node",
    "Peers",
    "Transports",
    "Sessions",
    "Tree",
    "Filters",
    "Performance",
    "Routing",
  ];

  const { data: monitorData, isFetching } = useQuery({
    queryKey: ["monitor", activeTab],
    queryFn: () => invoke<any>("get_monitor_data", { tab: activeTab }),
    refetchInterval: 2000,
  });

  // Merge initial data for fields not in the current tab's poll
  const data = { ...initialData, ...monitorData };

  const renderContent = () => {
    switch (activeTab) {
      case "Node":
        return <NodeTab data={data} />;
      case "Peers":
        return <PeersTab data={data} />;
      case "Transports":
        return <TransportsTab data={data} />;
      case "Sessions":
        return <SessionsTab data={data} />;
      case "Tree":
        return <TreeTab data={data} />;
      case "Filters":
        return <FiltersTab data={data} />;
      case "Performance":
        return <PerformanceTab data={data} />;
      case "Routing":
        return <RoutingTab data={data} />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:py-8">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Network Monitor
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-neutral-500">
              {data.status?.version || "0.0.0"}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${data.status?.state === "running" ? "bg-green-500 animate-pulse" : "bg-neutral-600"}`}
            ></span>
            <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-widest">
              {data.status?.state || "stopped"}
            </span>
            {isFetching && (
              <span className="flex items-center gap-1 text-blue-400 text-[10px] uppercase font-bold ml-2">
                <span className="w-1 h-1 bg-blue-400 rounded-full animate-ping"></span>
                Refreshing
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold transition-all border border-red-500/20 whitespace-nowrap"
        >
          Close Monitor
        </button>
      </div>

      {/* Tabs Area */}
      <div className="flex items-center gap-2 bg-neutral-900/50 p-2 rounded-xl border border-neutral-800">
        <button
          onClick={() => {
            const idx = tabs.indexOf(activeTab);
            if (idx > 0) setActiveTab(tabs[idx - 1]);
          }}
          disabled={tabs.indexOf(activeTab) === 0}
          className="p-1.5 rounded-lg bg-neutral-950 text-neutral-400 hover:text-white disabled:opacity-20 transition-all md:hidden border border-neutral-800"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            const idx = tabs.indexOf(activeTab);
            if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
          }}
          disabled={tabs.indexOf(activeTab) === tabs.length - 1}
          className="p-1.5 rounded-lg bg-neutral-950 text-neutral-400 hover:text-white disabled:opacity-20 transition-all md:hidden border border-neutral-800"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Content Area */}
      <div className="py-2">{renderContent()}</div>
    </div>
  );
}

function Card({
  title,
  children,
  iconColor = "bg-blue-500",
}: {
  title: string;
  children: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${iconColor}`}></span>
        <h3 className="font-bold text-white tracking-tight uppercase text-xs tracking-widest">
          {title}
        </h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatItem({
  label,
  value,
  subValue,
  color = "text-white",
}: {
  label: string;
  value: any;
  subValue?: any;
  color?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div className={`text-lg font-bold truncate ${color}`}>
          {value?.toString() ?? "-"}
        </div>
        {subValue && (
          <div className="text-[10px] font-mono text-neutral-500 truncate">
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeTab({ data }: { data: any }) {
  const status = data.status || {};
  const fwd = status.forwarding || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card title="Identity" iconColor="bg-blue-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatItem
            label="Display Name"
            value={status.display_name}
            color="text-blue-400"
          />
          <StatItem label="Node Address" value={status.node_addr} />
          <div className="sm:col-span-2">
            <StatItem
              label="Npub"
              value={status.npub}
              color="text-neutral-400 font-mono text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <StatItem
              label="IPv6 Address"
              value={status.ipv6_addr}
              color="text-neutral-400 font-mono text-sm"
            />
          </div>
        </div>
      </Card>

      <Card title="Operational State" iconColor="bg-green-500">
        <div className="grid grid-cols-2 gap-6">
          <StatItem
            label="Version"
            value={status.version}
            color="text-green-400"
          />
          <StatItem
            label="State"
            value={status.state}
            color={
              status.state === "running" ? "text-green-500" : "text-red-500"
            }
          />
          <div className="col-span-2">
            <StatItem label="Uptime" value={formatUptime(status.uptime_secs)} />
          </div>
          <StatItem
            label="Mesh Size (est)"
            value={formatCount(status.estimated_mesh_size)}
            subValue="nodes"
          />
          <StatItem
            label="IPv6 MTU"
            value={status.effective_ipv6_mtu}
            subValue="bytes"
          />
          <StatItem
            label="Leaf Only"
            value={status.is_leaf_only ? "YES" : "NO"}
            color={status.is_leaf_only ? "text-amber-400" : "text-neutral-500"}
          />
        </div>
      </Card>

      <Card title="Resources" iconColor="bg-purple-500">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          <StatItem label="Peers" value={status.peer_count} />
          <StatItem label="Links" value={status.link_count} />
          <StatItem label="Sessions" value={status.session_count} />
          <StatItem label="Transports" value={status.transport_count} />
          <StatItem label="Connections" value={status.connection_count} />
          <div className="col-span-1 lg:col-span-1">
            <StatItem
              label="TUN Interface"
              value={status.tun_name}
              color="text-purple-400"
            />
          </div>
          <StatItem label="TUN State" value={status.tun_state} />
        </div>
      </Card>

      <Card title="Forwarding Plane" iconColor="bg-blue-500">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-4">
            <h4 className="text-[9px] uppercase tracking-tighter text-neutral-600 font-black border-l-2 border-blue-500 pl-2">
              Traffic In
            </h4>
            <StatItem
              label="Received"
              value={formatCount(fwd.received_packets)}
              subValue={formatBytes(fwd.received_bytes)}
              color="text-blue-400"
            />
            <StatItem
              label="Delivered"
              value={formatCount(fwd.delivered_packets)}
              subValue={formatBytes(fwd.delivered_bytes)}
              color="text-green-400"
            />
          </div>
          <div className="space-y-4">
            <h4 className="text-[9px] uppercase tracking-tighter text-neutral-600 font-black border-l-2 border-purple-500 pl-2">
              Traffic Out
            </h4>
            <StatItem
              label="Originated"
              value={formatCount(fwd.originated_packets)}
              subValue={formatBytes(fwd.originated_bytes)}
            />
            <StatItem
              label="Forwarded"
              value={formatCount(fwd.forwarded_packets)}
              subValue={formatBytes(fwd.forwarded_bytes)}
              color="text-purple-400"
            />
          </div>
          <div className="col-span-2 pt-2 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatItem
              label="No Route"
              value={formatCount(fwd.drop_no_route_packets)}
              color="text-red-400"
            />
            <StatItem
              label="MTU Drop"
              value={formatCount(fwd.drop_mtu_exceeded_packets)}
              color="text-red-400"
            />
            <StatItem
              label="TTL Exp"
              value={formatCount(fwd.ttl_exhausted_packets)}
              color="text-orange-400"
            />
            <StatItem
              label="Decode Err"
              value={formatCount(fwd.decode_error_packets)}
              color="text-red-500"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

function formatThroughput(val: number): string {
  if (val < 0) return "0 B/s";
  if (val < 1000) return `${val.toFixed(0)} B/s`;
  if (val < 1000000)
    return `${(val / 1000).toFixed(val >= 100000 ? 0 : val >= 10000 ? 1 : 2)} KB/s`;
  if (val < 1000000000)
    return `${(val / 1000000).toFixed(val >= 100000000 ? 0 : val >= 10000000 ? 1 : 2)} MB/s`;
  return `${(val / 1000000000).toFixed(2)} GB/s`;
}

function PeersTab({ data }: { data: any }) {
  const peers = [...(data.peers || [])];

  // Sort by LQI ascending (best first) like fipstop
  peers.sort((a, b) => {
    const lqiA = a.mmp?.lqi ?? 999999;
    const lqiB = b.mmp?.lqi ?? 999999;
    return lqiA - lqiB;
  });

  return (
    <Card title={`Active Peers (${peers.length})`} iconColor="bg-yellow-500">
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800">
              <th className="pl-5 pr-4 py-3 font-bold">name</th>
              <th className="pr-4 py-3 font-bold">npub</th>
              <th className="pr-4 py-3 font-bold">transport</th>
              <th className="pr-4 py-3 font-bold">dir</th>
              <th className="pr-4 py-3 font-bold text-right">srtt</th>
              <th className="pr-4 py-3 font-bold text-right">loss</th>
              <th className="pr-4 py-3 font-bold text-right">lqi</th>
              <th className="pr-4 py-3 font-bold text-right">goodput</th>
              <th className="pr-4 py-3 font-bold text-right">pkts tx</th>
              <th className="pr-5 py-3 font-bold text-right">pkts rx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {peers.map((peer: any, i: number) => {
              const mmp = peer.mmp || {};
              const stats = peer.stats || {};
              const isParent = peer.is_parent;
              const isChild = peer.is_child;

              const rowColor = isParent
                ? "text-fuchsia-500"
                : isChild
                  ? "text-cyan-400"
                  : "text-neutral-300";
              const transport =
                peer.transport_type && peer.transport_addr
                  ? `${peer.transport_type}/${peer.transport_addr}`
                  : peer.transport_type || peer.transport_addr || "-";

              return (
                <tr
                  key={i}
                  className={`hover:bg-white/[0.02] transition-colors group font-mono text-[11px] ${rowColor}`}
                >
                  <td className="pl-5 pr-4 py-2 font-bold whitespace-nowrap">
                    {peer.display_name || "-"}
                  </td>
                  <td className="pr-4 py-2 opacity-70 truncate max-w-[200px]">
                    {peer.npub || "-"}
                  </td>
                  <td className="pr-4 py-2 whitespace-nowrap">{transport}</td>
                  <td className="pr-4 py-2">
                    {peer.direction === "inbound"
                      ? "in"
                      : peer.direction === "outbound"
                        ? "out"
                        : "-"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.srtt_ms != null ? mmp.srtt_ms.toFixed(1) : "-"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {(mmp.smoothed_loss ?? mmp.loss_rate ?? 0).toFixed(3)}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.lqi != null ? mmp.lqi.toFixed(2) : "-"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {formatThroughput(mmp.goodput_bps ?? 0)}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {stats.packets_sent ?? "-"}
                  </td>
                  <td className="pr-5 py-2 text-right">
                    {stats.packets_recv ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SessionsTab({ data }: { data: any }) {
  const sessions = data.sessions || [];
  return (
    <Card title={`Sessions (${sessions.length})`} iconColor="bg-yellow-500">
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
              <th className="pl-5 pr-4 py-3">name</th>
              <th className="pr-4 py-3">remote addr</th>
              <th className="pr-4 py-3">state</th>
              <th className="pr-4 py-3">role</th>
              <th className="pr-4 py-3 text-right">srtt</th>
              <th className="pr-4 py-3 text-right">loss</th>
              <th className="pr-4 py-3 text-right">sqi</th>
              <th className="pr-4 py-3 text-right">path mtu</th>
              <th className="pr-5 py-3 text-right">last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {sessions.map((s: any, i: number) => {
              const state = s.state || "-";
              const stateColor =
                state === "established"
                  ? "text-green-500"
                  : ["initiating", "awaiting_msg3"].includes(state)
                    ? "text-yellow-500"
                    : "text-red-500";
              const mmp = s.mmp || {};

              return (
                <tr
                  key={i}
                  className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-neutral-300"
                >
                  <td className="pl-5 pr-4 py-2 font-bold text-white whitespace-nowrap">
                    {s.display_name || "-"}
                  </td>
                  <td className="pr-4 py-2 opacity-70">
                    {s.remote_addr?.slice(0, 10) || "-"}
                  </td>
                  <td className={`pr-4 py-2 uppercase font-bold ${stateColor}`}>
                    {state}
                  </td>
                  <td className="pr-4 py-2">
                    {s.is_initiator ? "init" : "resp"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.srtt_ms?.toFixed(1) ?? "-"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {(mmp.smoothed_loss ?? mmp.loss_rate ?? 0).toFixed(3)}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.sqi?.toFixed(2) ?? "-"}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.path_mtu ?? "-"}
                  </td>
                  <td className="pr-5 py-2 text-right whitespace-nowrap text-neutral-500">
                    {formatRelativeTime(s.last_activity_ms)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TransportsTab({ data }: { data: any }) {
  const transports = data.transports || [];
  const links = data.links || [];

  const rows: any[] = [];
  transports.forEach((t: any) => {
    rows.push({ type: "transport", data: t });
    const tLinks = links.filter((l: any) => l.transport_id === t.transport_id);
    tLinks.forEach((l: any, idx: number) => {
      rows.push({ type: "link", data: l, isLast: idx === tLinks.length - 1 });
    });
  });

  return (
    <Card
      title={`Transports (${transports.length}) Links (${links.length})`}
      iconColor="bg-yellow-500"
    >
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
              <th className="pl-5 pr-4 py-3">transport / link</th>
              <th className="pr-4 py-3">state</th>
              <th className="pr-4 py-3">peer</th>
              <th className="pr-4 py-3 text-right">tx</th>
              <th className="pr-5 py-3 text-right">rx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {rows.map((row) => {
              if (row.type === "transport") {
                const t = row.data;
                const stats = t.stats || {};
                const label = t.name
                  ? `${t.type} ${t.name}`
                  : t.type === "tor"
                    ? `tor(${t.tor_mode || "socks5"})`
                    : `${t.type} #${t.transport_id}`;

                return (
                  <tr
                    key={`t-${t.transport_id}`}
                    className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-white"
                  >
                    <td className="pl-5 pr-4 py-2 font-bold whitespace-nowrap flex items-center gap-2">
                      <span className="text-neutral-600">▶</span> {label}
                    </td>
                    <td className="pr-4 py-2 uppercase font-bold text-green-500">
                      {t.state}
                    </td>
                    <td className="pr-4 py-2">-</td>
                    <td className="pr-4 py-2 text-right">
                      {stats.packets_sent ?? stats.frames_sent ?? "-"}
                    </td>
                    <td className="pr-5 py-2 text-right">
                      {stats.packets_recv ?? stats.frames_recv ?? "-"}
                    </td>
                  </tr>
                );
              } else {
                const l = row.data;
                const treeChar = row.isLast ? "└─" : "├─";
                const dirShort =
                  l.direction === "Outbound"
                    ? "Out"
                    : l.direction === "Inbound"
                      ? "In"
                      : l.direction;
                const addr = l.remote_addr?.slice(0, 16) || "-";
                const color =
                  l.direction === "Outbound"
                    ? "text-cyan-400"
                    : "text-green-500";

                return (
                  <tr
                    key={`l-${l.link_id}`}
                    className={`hover:bg-white/[0.02] transition-colors group font-mono text-[11px] ${color}`}
                  >
                    <td className="pl-8 pr-4 py-2 whitespace-nowrap">
                      <span className="text-neutral-600">{treeChar}</span>{" "}
                      {dirShort} {addr}
                    </td>
                    <td className="pr-4 py-2 uppercase opacity-80">
                      {l.state}
                    </td>
                    <td className="pr-4 py-2 whitespace-nowrap">
                      {data.peers?.find((p: any) => p.link_id === l.link_id)
                        ?.display_name || "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">-</td>
                    <td className="pr-5 py-2 text-right">-</td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TreeTab({ data }: { data: any }) {
  const tree = data.tree || {};
  const stats = tree.stats || {};
  const peers = tree.peers || [];
  const myRoot = tree.root || "";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Tree Position" iconColor="bg-yellow-500">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatItem
                label="Root"
                value={
                  tree.root?.slice(0, 16) + (tree.is_root ? " (self)" : "")
                }
                color="text-yellow-500 font-mono"
              />
              <StatItem label="Depth" value={tree.depth} />
              <StatItem
                label="Parent"
                value={
                  tree.is_root ? "self (root)" : tree.parent_display_name || "-"
                }
                color="text-green-500"
              />
              <StatItem
                label="Declaration"
                value={`seq ${tree.declaration_sequence}, ${tree.declaration_signed ? "signed" : "unsigned"}`}
              />
            </div>
            {tree.my_coords && (
              <div className="pt-2 border-t border-neutral-800">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-2">
                  Path
                </div>
                <div className="flex flex-wrap gap-1 font-mono text-[10px] items-center">
                  {tree.my_coords.length === 0 ? (
                    <span className="text-yellow-500">[root]</span>
                  ) : (
                    <>
                      {tree.my_coords
                        .slice()
                        .reverse()
                        .map((c: string, idx: number) => (
                          <span key={idx} className="flex items-center gap-1">
                            {idx > 0 && (
                              <span className="text-neutral-600">&gt;</span>
                            )}
                            <span
                              className={
                                idx === 0 ? "text-yellow-500" : "text-white"
                              }
                            >
                              {c.slice(0, 8)}
                            </span>
                          </span>
                        ))}
                      <span className="text-neutral-600">&gt;</span>
                      <span className="text-green-500 font-bold">[self]</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title="Tree Announce Stats" iconColor="bg-yellow-500">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-3">
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-yellow-500 pl-2">
                Inbound
              </h4>
              <StatItem label="Received" value={stats.received} />
              <StatItem label="Accepted" value={stats.accepted} />
              <StatItem label="Decode Err" value={stats.decode_error} />
              <StatItem label="Sig Failed" value={stats.sig_failed} />
              <StatItem
                label="Parent Switched"
                value={stats.parent_switched}
                color="text-orange-400"
              />
            </div>
            <div className="space-y-3">
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-orange-500 pl-2">
                Outbound
              </h4>
              <StatItem label="Sent" value={stats.sent} />
              <StatItem label="Rate Limited" value={stats.rate_limited} />
              <StatItem label="Send Failed" value={stats.send_failed} />
              <div className="pt-2 mt-2 border-t border-neutral-800">
                <StatItem
                  label="Parent Losses"
                  value={stats.parent_losses}
                  color="text-red-400"
                />
                <StatItem label="Flap Dampened" value={stats.flap_dampened} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title={`Tree Peers (${peers.length})`} iconColor="bg-yellow-500">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
                <th className="pl-5 pr-4 py-3">name</th>
                <th className="pr-4 py-3 text-right">depth</th>
                <th className="pr-4 py-3 text-right">dist</th>
                <th className="pr-5 py-3 text-right">root status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {peers.map((p: any, i: number) => {
                const isSameRoot = p.root === myRoot;
                return (
                  <tr
                    key={i}
                    className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-neutral-300"
                  >
                    <td className="pl-5 pr-4 py-2 font-bold text-white">
                      {p.display_name || "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">{p.depth ?? "-"}</td>
                    <td className="pr-4 py-2 text-right">
                      {p.distance_to_us ?? "-"}
                    </td>
                    <td
                      className={`pr-5 py-2 text-right font-bold ${isSameRoot ? "text-green-500" : "text-red-500"}`}
                    >
                      {isSameRoot ? "same root" : "diff root"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FiltersTab({ data }: { data: any }) {
  const bloom = data.bloom || {};
  const stats = bloom.stats || {};
  const peerFilters = bloom.peer_filters || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Bloom Filter State" iconColor="bg-cyan-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem
              label="Node Addr"
              value={bloom.own_node_addr?.slice(0, 16)}
              color="text-cyan-400 font-mono"
            />
            <StatItem
              label="Leaf Only"
              value={bloom.is_leaf_only ? "yes" : "no"}
            />
            <StatItem label="Sequence" value={bloom.sequence} />
            <StatItem label="Leaf Deps" value={bloom.leaf_dependent_count} />
          </div>
        </Card>

        <Card title="Bloom Announce Stats" iconColor="bg-cyan-600">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-2">
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-cyan-500 pl-2">
                Inbound
              </h4>
              <StatItem label="Received" value={stats.received} />
              <StatItem label="Accepted" value={stats.accepted} />
              <StatItem label="Decode Err" value={stats.decode_error} />
              <StatItem label="Invalid" value={stats.invalid} />
              <StatItem label="Non-V1" value={stats.non_v1} />
              <StatItem label="Unkn Peer" value={stats.unknown_peer} />
              <StatItem label="Stale" value={stats.stale} />
            </div>
            <div className="space-y-2">
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-blue-500 pl-2">
                Outbound
              </h4>
              <StatItem label="Sent" value={stats.sent} />
              <StatItem
                label="Debounce Suppr"
                value={stats.debounce_suppressed}
              />
              <StatItem label="Send Failed" value={stats.send_failed} />
            </div>
          </div>
        </Card>
      </div>

      <Card
        title={`Peer Filters (${peerFilters.length})`}
        iconColor="bg-cyan-400"
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="text-cyan-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
                <th className="pl-5 pr-4 py-3">name</th>
                <th className="pr-4 py-3 text-right">seq</th>
                <th className="pr-4 py-3 text-right">fill</th>
                <th className="pr-4 py-3 text-right">est count</th>
                <th className="pr-5 py-3 text-right">status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {peerFilters.map((f: any, i: number) => {
                const has = f.has_filter;
                const fill =
                  f.fill_ratio != null
                    ? `${(f.fill_ratio * 100).toFixed(1)}%`
                    : "-";
                const est =
                  f.estimated_count != null
                    ? Math.round(f.estimated_count)
                    : "-";

                return (
                  <tr
                    key={i}
                    className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-neutral-300"
                  >
                    <td className="pl-5 pr-4 py-2 font-bold text-white">
                      {f.display_name || "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {f.filter_sequence ?? "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">{has ? fill : "-"}</td>
                    <td className="pr-4 py-2 text-right">{has ? est : "-"}</td>
                    <td
                      className={`pr-5 py-2 text-right font-bold ${has ? "text-green-500" : "text-red-500"}`}
                    >
                      {has ? "ok" : "none"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PerformanceTab({ data }: { data: any }) {
  const mmp = data.mmp || {};
  const linkPeers = mmp.peers || [];
  const sessionPeers = mmp.sessions || [];

  const TrendIcon = ({
    trend,
    badRising,
  }: {
    trend?: string;
    badRising: boolean;
  }) => {
    if (!trend || trend === "stable") return null;
    const isRising = trend === "rising";
    const color = isRising
      ? badRising
        ? "text-red-500"
        : "text-green-500"
      : badRising
        ? "text-green-500"
        : "text-red-500";
    return <span className={`${color} ml-1`}>{isRising ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-6">
      <Card
        title={`Link MMP (${linkPeers.length} peers)`}
        iconColor="bg-emerald-500"
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
                <th className="pl-5 pr-4 py-3">peer</th>
                <th className="pr-4 py-3 text-right">srtt</th>
                <th className="pr-4 py-3 text-right">loss</th>
                <th className="pr-4 py-3 text-right">etx</th>
                <th className="pr-4 py-3 text-right">lqi</th>
                <th className="pr-4 py-3 text-right">jitter</th>
                <th className="pr-5 py-3 text-right">goodput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {linkPeers.map((p: any, i: number) => {
                const ll = p.link_layer || {};
                return (
                  <tr
                    key={i}
                    className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-neutral-300"
                  >
                    <td className="pl-5 pr-4 py-2 font-bold text-white">
                      {p.display_name || "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {ll.srtt_ms?.toFixed(1) ?? "-"}ms
                      <TrendIcon trend={ll.rtt_trend} badRising={true} />
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {(ll.smoothed_loss ?? ll.loss_rate ?? 0).toFixed(4)}
                      <TrendIcon trend={ll.loss_trend} badRising={true} />
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {(ll.smoothed_etx ?? ll.etx ?? 0).toFixed(2)}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {ll.lqi?.toFixed(2) ?? "-"}
                    </td>
                    <td className="pr-4 py-2 text-right text-neutral-500">
                      {ll.jitter_trend ? (
                        <TrendIcon trend={ll.jitter_trend} badRising={true} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="pr-5 py-2 text-right text-blue-400">
                      {formatThroughput(ll.goodput_bps ?? 0)}
                      <TrendIcon trend={ll.goodput_trend} badRising={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`Session MMP (${sessionPeers.length} sessions)`}
        iconColor="bg-emerald-600"
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="text-yellow-500 text-[10px] uppercase tracking-widest border-b border-neutral-800 font-bold">
                <th className="pl-5 pr-4 py-3">session</th>
                <th className="pr-4 py-3 text-right">srtt</th>
                <th className="pr-4 py-3 text-right">loss</th>
                <th className="pr-4 py-3 text-right">etx</th>
                <th className="pr-4 py-3 text-right">sqi</th>
                <th className="pr-5 py-3 text-right">mtu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {sessionPeers.map((s: any, i: number) => {
                const sl = s.session_layer || {};
                return (
                  <tr
                    key={i}
                    className="hover:bg-white/[0.02] transition-colors group font-mono text-[11px] text-neutral-300"
                  >
                    <td className="pl-5 pr-4 py-2 font-bold text-white">
                      {s.display_name || "-"}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {sl.srtt_ms?.toFixed(1) ?? "-"}ms
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {(sl.smoothed_loss ?? sl.loss_rate ?? 0).toFixed(4)}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {(sl.smoothed_etx ?? sl.etx ?? 0).toFixed(2)}
                    </td>
                    <td className="pr-4 py-2 text-right">
                      {sl.sqi?.toFixed(2) ?? "-"}
                    </td>
                    <td className="pr-5 py-2 text-right">
                      {sl.path_mtu ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RoutingTab({ data }: { data: any }) {
  const routing = data.routing || {};
  const cache = data.cache || {};
  const fwd = routing.forwarding || {};
  const disc = routing.discovery || {};
  const err = routing.error_signals || {};
  const cong = routing.congestion || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Routing State" iconColor="bg-sky-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Coord Cache" value={routing.coord_cache_entries} />
            <StatItem
              label="Identity Cache"
              value={routing.identity_cache_entries}
            />
            <StatItem label="Pending Lookups" value={routing.pending_lookups} />
            <StatItem label="Recent Requests" value={routing.recent_requests} />
          </div>
        </Card>

        <Card title="Coordinate Cache" iconColor="bg-sky-600">
          <div className="grid grid-cols-2 gap-6">
            <StatItem
              label="Entries"
              value={`${cache.entries || 0} / ${cache.max_entries || 0}`}
            />
            <StatItem
              label="Fill Ratio"
              value={
                cache.fill_ratio
                  ? (cache.fill_ratio * 100).toFixed(1) + "%"
                  : "-"
              }
            />
            <StatItem
              label="Default TTL"
              value={
                cache.default_ttl_ms
                  ? (cache.default_ttl_ms / 1000).toFixed(0) + "s"
                  : "-"
              }
            />
            <StatItem label="Expired" value={cache.expired} />
            <StatItem
              label="Avg Age"
              value={
                cache.avg_age_ms
                  ? (cache.avg_age_ms / 1000).toFixed(1) + "s"
                  : "-"
              }
            />
          </div>
        </Card>
      </div>

      <Card title="Routing Statistics" iconColor="bg-blue-600">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
          <div className="space-y-6">
            <div>
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-blue-500 pl-2 mb-4">
                Forwarding
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatItem
                  label="Received"
                  value={formatCount(fwd.received_packets)}
                  subValue={formatBytes(fwd.received_bytes)}
                  color="text-blue-400"
                />
                <StatItem
                  label="Delivered"
                  value={formatCount(fwd.delivered_packets)}
                  subValue={formatBytes(fwd.delivered_bytes)}
                  color="text-green-400"
                />
                <StatItem
                  label="Forwarded"
                  value={formatCount(fwd.forwarded_packets)}
                  subValue={formatBytes(fwd.forwarded_bytes)}
                  color="text-purple-400"
                />
                <StatItem
                  label="Originated"
                  value={formatCount(fwd.originated_packets)}
                  subValue={formatBytes(fwd.originated_bytes)}
                />
                <StatItem
                  label="TTL Expired"
                  value={formatCount(fwd.ttl_exhausted_packets)}
                  subValue={formatBytes(fwd.ttl_exhausted_bytes)}
                  color="text-orange-400"
                />
                <StatItem
                  label="No Route"
                  value={formatCount(fwd.drop_no_route_packets)}
                  subValue={formatBytes(fwd.drop_no_route_bytes)}
                  color="text-red-400"
                />
                <StatItem
                  label="MTU Drop"
                  value={formatCount(fwd.drop_mtu_exceeded_packets)}
                  subValue={formatBytes(fwd.drop_mtu_exceeded_bytes)}
                  color="text-red-400"
                />
                <StatItem
                  label="Decode Err"
                  value={formatCount(fwd.decode_error_packets)}
                  subValue={formatBytes(fwd.decode_error_bytes)}
                  color="text-red-500"
                />
                <StatItem
                  label="Send Error"
                  value={formatCount(fwd.drop_send_error_packets)}
                  subValue={formatBytes(fwd.drop_send_error_bytes)}
                  color="text-red-500"
                />
              </div>
            </div>

            <div>
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-sky-500 pl-2 mb-4">
                Discovery Requests
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatItem label="Received" value={disc.req_received} />
                <StatItem label="Forwarded" value={disc.req_forwarded} />
                <StatItem label="Initiated" value={disc.req_initiated} />
                <StatItem label="Deduplicated" value={disc.req_deduplicated} />
                <StatItem label="Target Is Us" value={disc.req_target_is_us} />
                <StatItem label="Duplicate" value={disc.req_duplicate} />
                <StatItem label="Bloom Miss" value={disc.req_bloom_miss} />
                <StatItem
                  label="Backoff Supp"
                  value={disc.req_backoff_suppressed}
                />
                <StatItem
                  label="Rate Limit"
                  value={disc.req_forward_rate_limited}
                />
                <StatItem
                  label="TTL Expired"
                  value={disc.req_ttl_exhausted}
                  color="text-orange-400"
                />
                <StatItem
                  label="Decode Err"
                  value={disc.req_decode_error}
                  color="text-red-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-red-500 pl-2 mb-4">
                Error Signals & Congestion
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <StatItem label="Coords Req" value={err.coords_required} />
                <StatItem
                  label="Path Broken"
                  value={err.path_broken}
                  color="text-red-400"
                />
                <StatItem
                  label="MTU Exceeded"
                  value={err.mtu_exceeded}
                  color="text-orange-400"
                />
                <div className="col-span-2 pt-4 border-t border-neutral-800 grid grid-cols-2 gap-4">
                  <StatItem
                    label="CE Received"
                    value={cong.ce_received}
                    color="text-yellow-500"
                  />
                  <StatItem label="CE Forwarded" value={cong.ce_forwarded} />
                  <StatItem
                    label="Congestion"
                    value={cong.congestion_detected}
                    color="text-red-500"
                  />
                  <StatItem
                    label="Kernel Drops"
                    value={cong.kernel_drop_events}
                    color="text-red-600"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[9px] uppercase font-black text-neutral-600 border-l-2 border-indigo-500 pl-2 mb-4">
                Discovery Responses
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatItem label="Received" value={disc.resp_received} />
                <StatItem
                  label="Accepted"
                  value={disc.resp_accepted}
                  color="text-green-500"
                />
                <StatItem label="Forwarded" value={disc.resp_forwarded} />
                <StatItem
                  label="Timed Out"
                  value={disc.resp_timed_out}
                  color="text-orange-400"
                />
                <StatItem
                  label="Identity Miss"
                  value={disc.resp_identity_miss}
                  color="text-amber-500"
                />
                <StatItem
                  label="Proof Failed"
                  value={disc.resp_proof_failed}
                  color="text-red-500"
                />
                <StatItem
                  label="Decode Err"
                  value={disc.resp_decode_error}
                  color="text-red-500"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
