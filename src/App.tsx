import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { TreeGraph } from "./TreeGraph";
import { MonitorView } from "./MonitorView";

interface StatusData {
  version?: string;
  npub?: string | null;
  state?: string;
  peer_count?: number;
  session_count?: number;
  link_count?: number;
  transport_count?: number;
  connection_count?: number;
  tun_state?: string;
  tun_name?: string;
  effective_ipv6_mtu?: number;
  ipv6_addr?: string | null;
  node_addr?: string | null;
  is_leaf_only?: boolean;
  uptime_secs?: number;
  estimated_mesh_size?: number;
  forwarding?: {
    delivered_packets: number;
    delivered_bytes: number;
    forwarded_packets: number;
    forwarded_bytes: number;
    originated_packets: number;
    originated_bytes: number;
    received_packets: number;
    received_bytes: number;
    drop_no_route_packets: number;
    drop_no_route_bytes: number;
    drop_mtu_exceeded_packets: number;
    drop_mtu_exceeded_bytes: number;
    drop_send_error_packets: number;
    drop_send_error_bytes: number;
    decode_error_packets: number;
    decode_error_bytes: number;
    ttl_exhausted_packets: number;
    ttl_exhausted_bytes: number;
  };
}

interface Peer {
  display_name?: string | null;
  npub?: string | null;
  is_parent?: boolean;
  is_child?: boolean;
  direction?: string | null;
  transport_type?: string | null;
  transport_addr?: string | null;
  mmp?: {
    srtt_ms?: number | null;
    loss_rate?: number | null;
    smoothed_loss?: number | null;
    lqi?: number | null;
    goodput_bps?: number | null;
    etx?: number | null;
  };
  stats?: {
    packets_sent?: number;
    packets_recv?: number;
    bytes_sent?: number;
    bytes_recv?: number;
  };
}

interface Link {
  link_id?: number | null;
  transport_id?: number | null;
  direction?: string | null;
  state?: string | null;
  remote_addr?: string | null;
  last_recv_ms?: number | null;
}

interface TreeData {
  root?: string | null;
  is_root: boolean;
  depth?: number | null;
  declaration_sequence?: number | null;
  declaration_signed: boolean;
  peer_tree_count: number;
  my_coords?: string[];
  parent?: string | null;
  parent_display_name?: string | null;
  peers: Array<{
    display_name?: string | null;
    npub?: string | null;
    depth?: number | null;
    distance_to_us?: number | null;
    coords?: string[];
  }>;
  stats: {
    accepted: number;
    parent_switches: number;
    parent_losses: number;
    loop_detected: number;
    flap_dampened: number;
    ancestry_changed: number;
    addr_mismatch: number;
    decode_error: number;
    rate_limited: number;
    received: number;
    sent: number;
    send_failed: number;
    sig_failed: number;
    stale: number;
    unknown_peer: number;
  };
}

interface Session {
  display_name?: string | null;
  npub?: string | null;
  state?: string | null;
  is_initiator: boolean;
  last_activity_ms?: number | null;
  srtt_ms?: number | null;
  loss_rate?: number | null;
  goodput_bps?: number | null;
  path_mtu?: number | null;
  etx?: number | null;
  smoothed_etx?: number | null;
  smoothed_loss?: number | null;
  sqi?: number | null;
  delivery_ratio_forward?: number | null;
  delivery_ratio_reverse?: number | null;
  mmp_mode?: string | null;
  packets_sent: number;
  packets_recv: number;
  bytes_sent: number;
  bytes_recv: number;
}

interface Transport {
  transport_id?: number | null;
  type?: string | null;
  state?: string | null;
  name?: string | null;
  tor_mode?: string | null;
  stats?: {
    packets_sent?: number;
    packets_recv?: number;
    bytes_sent?: number;
    bytes_recv?: number;
    frames_sent?: number;
    frames_recv?: number;
    send_errors?: number;
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
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

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatFloat(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "N/A";
  return value.toFixed(decimals);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!navigator.clipboard) return null;
  function handleClick() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleClick}
      title="Copy"
      className="ml-1 rounded px-1 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-neutral-950 px-2 py-1.5">
      <div className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm sm:text-lg font-semibold text-white truncate">
        {value}
      </div>
    </div>
  );
}

function App() {
  const [exploring, setExploring] = useState(false);
  const [viewMode, setViewMode] = useState<"dashboard" | "monitor">(
    "dashboard",
  );

  // Check if we're on a mobile device
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const { data: allData, isLoading } = useQuery({
    queryKey: ["fipsInfo"],
    queryFn: () => invoke<any>("get_info"),
    refetchInterval: 5000,
  });

  const status: StatusData | null = allData?.status || null;
  const peers: Peer[] = Array.isArray(allData?.peers) ? allData.peers : [];
  const links: Link[] = Array.isArray(allData?.links) ? allData.links : [];
  const tree: TreeData | null = allData?.tree || null;
  const sessions: Session[] = Array.isArray(allData?.sessions)
    ? allData.sessions
    : [];
  const transports: Transport[] = Array.isArray(allData?.transports)
    ? allData.transports
    : [];

  const handleExplore = async () => {
    setExploring(true);
    try {
      await invoke("explore_mesh");
    } catch (err) {
      console.error("Failed to explore mesh:", err);
    } finally {
      setExploring(false);
    }
  };

  if (isLoading && !status)
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-neutral-400">
        Loading FIPS...
      </div>
    );

  if (viewMode === "monitor" && !isMobile) {
    return (
      <MonitorView data={allData} onClose={() => setViewMode("dashboard")} />
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-200 pb-12 overflow-x-hidden">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:py-6 overflow-hidden">
        {/* Header */}
        <div className="border-b border-neutral-900 pb-4 flex flex-col lg:flex-row justify-between items-start gap-4">
          <div className="w-full lg:w-auto min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              FIPS
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-neutral-500">
                {status?.version || "0.0.0"}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${status?.state === "running" ? "bg-green-500 animate-pulse" : "bg-neutral-600"}`}
              ></span>
              <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-widest">
                {status?.state || "stopped"}
              </span>
            </div>
            {status?.npub && (
              <div className="mt-3 bg-neutral-900/50 rounded-lg p-2 border border-neutral-800/50 overflow-hidden">
                <p className="flex items-center gap-2 font-mono text-[10px] sm:text-xs text-neutral-400">
                  <span className="truncate flex-1 min-w-0">{status.npub}</span>
                  <CopyButton text={status.npub} />
                </p>
                {status?.ipv6_addr && (
                  <p className="mt-1 flex items-center gap-2 font-mono text-[10px] sm:text-xs text-neutral-500">
                    <span className="truncate flex-1 min-w-0">
                      {status.ipv6_addr}
                    </span>
                    <CopyButton text={status.ipv6_addr} />
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            {!isMobile && (
              <button
                onClick={() => setViewMode("monitor")}
                className="px-4 py-2 bg-neutral-800 text-white hover:bg-neutral-700 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 border border-neutral-700 whitespace-nowrap"
              >
                Monitor View
              </button>
            )}
            {/*
            <button
              onClick={handleExplore}
              disabled={exploring}
              className="px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {exploring ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Exploring...
                </>
              ) : (
                "Explore Mesh"
              )}
            </button>
            */}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-neutral-900/50 border border-neutral-800 p-3 sm:p-4 rounded-xl">
            <h3 className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Uptime
            </h3>
            <p className="text-xl sm:text-2xl font-bold text-white">
              {formatUptime(status?.uptime_secs)}
            </p>
          </div>
          <div className="bg-neutral-900/50 border border-neutral-800 p-3 sm:p-4 rounded-xl">
            <h3 className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Peers
            </h3>
            <p className="text-xl sm:text-2xl font-bold text-white">
              {status?.peer_count ?? peers.length}
            </p>
          </div>
          <div className="bg-neutral-900/50 border border-neutral-800 p-3 sm:p-4 rounded-xl">
            <h3 className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Links
            </h3>
            <p className="text-xl sm:text-2xl font-bold text-white">
              {status?.link_count ?? links.length}
            </p>
          </div>
          <div className="bg-neutral-900/50 border border-neutral-800 p-3 sm:p-4 rounded-xl">
            <h3 className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Sessions
            </h3>
            <p className="text-xl sm:text-2xl font-bold text-white">
              {status?.session_count ?? sessions.length}
            </p>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {status?.forwarding && (
            <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
              <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Forwarding
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <StatChip
                  label="Originated"
                  value={`${formatCount(status.forwarding.originated_packets)} pkts`}
                />
                <StatChip
                  label="Received"
                  value={`${formatCount(status.forwarding.received_packets)} pkts`}
                />
                <StatChip
                  label="Delivered"
                  value={`${formatCount(status.forwarding.delivered_packets)} pkts`}
                />
                <StatChip
                  label="Forwarded"
                  value={`${formatCount(status.forwarding.forwarded_packets)} pkts`}
                />
                <div className="col-span-2 grid grid-cols-3 gap-2 mt-2">
                  <div className="text-center">
                    <div className="text-[9px] text-neutral-500 uppercase">
                      No Route
                    </div>
                    <div className="text-xs font-semibold text-red-400">
                      {formatCount(status.forwarding.drop_no_route_packets)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-neutral-500 uppercase">
                      MTU Drop
                    </div>
                    <div className="text-xs font-semibold text-red-400">
                      {formatCount(status.forwarding.drop_mtu_exceeded_packets)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-neutral-500 uppercase">
                      TTL Exp
                    </div>
                    <div className="text-xs font-semibold text-orange-400">
                      {formatCount(status.forwarding.ttl_exhausted_packets)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
            <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              Network
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">
                  TUN Interface
                </h4>
                <p className="text-sm font-mono text-white bg-black/50 p-2 rounded border border-neutral-800">
                  {status?.tun_name || "fips0"}
                </p>
              </div>
              <div>
                <h4 className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">
                  IPv6 MTU
                </h4>
                <p className="text-sm font-mono text-white bg-black/50 p-2 rounded border border-neutral-800">
                  {status?.effective_ipv6_mtu || "1280"}
                </p>
              </div>
              <div className="col-span-2">
                <h4 className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">
                  Est. Mesh Size
                </h4>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-bold text-white">
                    {status?.estimated_mesh_size != null
                      ? formatCount(status.estimated_mesh_size)
                      : "N/A"}
                  </p>
                  <span className="text-xs text-neutral-500 mb-1">nodes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tree Graph */}
        {tree && (
          <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
              <h2 className="text-xl font-bold text-white">Spanning Tree</h2>
              {tree.parent_display_name && (
                <div className="flex items-center gap-2 text-xs bg-black/50 px-3 py-1.5 rounded-full border border-neutral-800">
                  <span className="text-neutral-500">Parent:</span>
                  <span className="text-green-400 font-mono font-bold">
                    {tree.parent_display_name}
                  </span>
                  {tree.is_root && (
                    <span className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">
                      ROOT
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="w-full">
              <TreeGraph tree={tree} peers={peers} />
            </div>
          </div>
        )}

        {/* Tables Section */}
        <div className="space-y-6">
          {/* Peers Table */}
          {peers.length > 0 && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Active Peers</h2>
                <span className="bg-neutral-800 text-neutral-400 px-2 py-1 rounded text-xs font-mono">
                  {peers.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="text-neutral-500 border-b border-neutral-800 bg-black/20">
                      <th className="py-3 px-4 font-semibold">Node</th>
                      <th className="py-3 px-4 font-semibold">Role</th>
                      <th className="py-3 px-4 font-semibold text-right">
                        RTT
                      </th>
                      <th className="py-3 px-4 font-semibold text-right">
                        Throughput
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {peers.map((peer, i) => {
                      const mmp = peer.mmp || {};
                      const isParent = peer.is_parent;
                      const isChild = peer.is_child;
                      const relationship = isParent
                        ? "parent"
                        : isChild
                          ? "child"
                          : "peer";

                      return (
                        <tr
                          key={i}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">
                              {peer.display_name || "Unknown"}
                            </div>
                            <div className="text-[10px] font-mono text-neutral-500 truncate max-w-[120px]">
                              {peer.npub || "No NPUB"}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                isParent
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : isChild
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                    : "bg-neutral-800 text-neutral-400"
                              }`}
                            >
                              {relationship}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            <div
                              className={
                                mmp.srtt_ms != null
                                  ? mmp.srtt_ms < 100
                                    ? "text-green-400"
                                    : mmp.srtt_ms < 300
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-neutral-500"
                              }
                            >
                              {mmp.srtt_ms != null
                                ? `${Math.round(mmp.srtt_ms)}ms`
                                : "—"}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {formatPercent(
                                mmp.smoothed_loss ?? mmp.loss_rate,
                              )}{" "}
                              loss
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="text-white font-mono">
                              {mmp.goodput_bps != null
                                ? formatThroughput(mmp.goodput_bps)
                                : "—"}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              ETX: {formatFloat(mmp.etx)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Links Table */}
          {links.length > 0 && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Active Links</h2>
                <span className="bg-neutral-800 text-neutral-400 px-2 py-1 rounded text-xs font-mono">
                  {links.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="text-neutral-500 border-b border-neutral-800 bg-black/20">
                      <th className="py-3 px-4 font-semibold">Link ID</th>
                      <th className="py-3 px-4 font-semibold">State</th>
                      <th className="py-3 px-4 font-semibold text-right">
                        Last Seen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {links.map((link, i) => (
                      <tr
                        key={i}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-white">
                          #{link.link_id}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-bold uppercase tracking-widest">
                            {link.state}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-neutral-400 font-mono text-xs">
                          {formatRelativeTime(link.last_recv_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sessions Table */}
          {sessions.length > 0 && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800">
                <h2 className="text-lg font-bold text-white">Sessions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="text-neutral-500 border-b border-neutral-800 bg-black/20">
                      <th className="py-3 px-4 font-semibold">Session</th>
                      <th className="py-3 px-4 font-semibold">State</th>
                      <th className="py-3 px-4 font-semibold text-right">
                        Usage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {sessions.map((session, i) => (
                      <tr
                        key={i}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">
                            {session.display_name || "Unnamed"}
                          </div>
                          {session.is_initiator && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded uppercase font-bold">
                              Initiator
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">
                          {session.state}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="text-white font-mono">
                            {formatBytes(
                              session.bytes_sent + session.bytes_recv,
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {formatCount(
                              session.packets_sent + session.packets_recv,
                            )}{" "}
                            pkts
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transports */}
          {transports.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white px-1">Transports</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {transports.map((transport, i) => {
                  const stats = transport.stats || {};
                  const sendErrors = stats.send_errors || 0;
                  const label = transport.name
                    ? `${transport.type} ${transport.name}`
                    : transport.type === "tor"
                      ? `tor(${transport.tor_mode || "socks5"})`
                      : `${transport.type} #${transport.transport_id}`;

                  return (
                    <div
                      key={i}
                      className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-black uppercase bg-white text-black px-2 py-0.5 rounded mr-2 whitespace-nowrap">
                            {transport.type}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500 truncate block sm:inline mt-1 sm:mt-0">
                            {label}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ml-2 ${transport.state === "up" || transport.state === "running" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                        >
                          {transport.state}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[9px] text-neutral-500 uppercase">
                            Throughput
                          </div>
                          <div className="text-xs font-mono">
                            {formatBytes(
                              (stats.bytes_sent || 0) + (stats.bytes_recv || 0),
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-neutral-500 uppercase">
                            Packets
                          </div>
                          <div className="text-xs font-mono">
                            {formatCount(
                              (stats.packets_sent || stats.frames_sent || 0) +
                                (stats.packets_recv || stats.frames_recv || 0),
                            )}
                          </div>
                        </div>
                        {sendErrors > 0 && (
                          <div className="col-span-2 text-[10px] text-red-400 bg-red-400/5 p-1 rounded">
                            ⚠️ {sendErrors} send errors detected
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {!isLoading &&
          peers.length === 0 &&
          links.length === 0 &&
          sessions.length === 0 &&
          transports.length === 0 &&
          !tree && (
            <div className="text-center py-20 bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl">
              <div className="text-4xl mb-4">🕸️</div>
              <h3 className="text-lg font-bold text-white">
                No Network Activity
              </h3>
              <p className="text-neutral-500 text-sm mt-1">
                Make sure the FIPS service is running and connected.
              </p>
              <button
                onClick={handleExplore}
                className="mt-6 text-sm font-bold text-blue-400 hover:text-blue-300"
              >
                Try Exploring Mesh →
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

export default App;
