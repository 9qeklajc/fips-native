import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'

interface MonitorViewProps {
  data: any
  onClose: () => void
}

type Tab = 'Node' | 'Peers' | 'Transports' | 'Sessions' | 'Tree' | 'Filters' | 'Performance' | 'Routing'

function formatCount(value: any): string {
  const num = typeof value === 'number' ? value : parseInt(value)
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
}

function formatBytes(value: any): string {
  const num = typeof value === 'number' ? value : parseInt(value)
  if (isNaN(num) || num === 0) return '-'
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
  if (seconds == null) return "N/A"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)

  return parts.join(" ")
}

function formatBps(value: any): string {
  const num = typeof value === 'number' ? value : parseInt(value)
  if (isNaN(num) || num === 0) return '-'
  if (num < 1000) return `${num.toFixed(0)} bps`;
  if (num < 1000000) return `${(num / 1000).toFixed(1)} Kbps`;
  return `${(num / 1000000).toFixed(1)} Mbps`;
}

export function MonitorView({ data: initialData, onClose }: MonitorViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Node')
  const tabs: Tab[] = ['Node', 'Peers', 'Transports', 'Sessions', 'Tree', 'Filters', 'Performance', 'Routing']

  const { data: monitorData, isFetching } = useQuery({
    queryKey: ['monitor', activeTab],
    queryFn: () => invoke<any>('get_monitor_data', { tab: activeTab }),
    refetchInterval: 2000,
  })

  // Merge initial data for fields not in the current tab's poll
  const data = { ...initialData, ...monitorData }

  const renderContent = () => {
    switch (activeTab) {
      case 'Node':
        return <NodeTab data={data} />
      case 'Peers':
        return <PeersTab data={data} />
      case 'Transports':
        return <TransportsTab data={data} />
      case 'Sessions':
        return <SessionsTab data={data} />
      case 'Tree':
        return <TreeTab data={data} />
      case 'Filters':
        return <FiltersTab data={data} />
      case 'Performance':
        return <PerformanceTab data={data} />
      case 'Routing':
        return <RoutingTab data={data} />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col text-neutral-200 overflow-hidden">
      {/* Header Area */}
      <div className="bg-neutral-950 border-b border-neutral-900 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white tracking-tight">Network Monitor</h2>
          <span className="px-2 py-0.5 bg-neutral-800 rounded text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Advanced Mode</span>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab 
                  ? 'bg-white text-black' 
                  : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button 
          onClick={onClose}
          className="px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold transition-all border border-red-500/20"
        >
          Close Monitor
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-black">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-neutral-950 border-t border-neutral-900 px-6 py-3 flex justify-between items-center text-xs text-neutral-500">
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${data.status?.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="font-semibold uppercase tracking-wider">{data.status?.state || 'offline'}</span>
          </div>
          <span className="hidden sm:inline opacity-30">|</span>
          <span>FIPS v{data.status?.version || '-'}</span>
          {isFetching && (
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-1 h-1 bg-blue-400 rounded-full animate-ping"></span>
              Refreshing...
            </span>
          )}
        </div>
        <div className="font-mono text-[10px]">
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children, iconColor = "bg-blue-500" }: { title: string, children: React.ReactNode, iconColor?: string }) {
  return (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${iconColor}`}></span>
        <h3 className="font-bold text-white tracking-tight uppercase text-xs tracking-widest">{title}</h3>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}

function StatItem({ label, value, subValue, color = "text-white" }: { label: string, value: any, subValue?: any, color?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className={`text-lg font-bold truncate ${color}`}>{value?.toString() ?? '-'}</div>
        {subValue && <div className="text-[10px] font-mono text-neutral-500 truncate">{subValue}</div>}
      </div>
    </div>
  )
}

function NodeTab({ data }: { data: any }) {
  const status = data.status || {}
  const fwd = status.forwarding || {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card title="Identity" iconColor="bg-blue-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatItem label="Display Name" value={status.display_name} color="text-blue-400" />
          <StatItem label="Node Address" value={status.node_addr} />
          <div className="sm:col-span-2">
            <StatItem label="Npub" value={status.npub} color="text-neutral-400 font-mono text-xs" />
          </div>
          <div className="sm:col-span-2">
            <StatItem label="IPv6 Address" value={status.ipv6_addr} color="text-neutral-400 font-mono text-sm" />
          </div>
        </div>
      </Card>

      <Card title="Operational State" iconColor="bg-green-500">
        <div className="grid grid-cols-2 gap-6">
          <StatItem label="Version" value={status.version} color="text-green-400" />
          <StatItem label="State" value={status.state} color={status.state === 'running' ? 'text-green-500' : 'text-red-500'} />
          <div className="col-span-2">
            <StatItem label="Uptime" value={formatUptime(status.uptime_secs)} />
          </div>
          <StatItem label="Mesh Size (est)" value={formatCount(status.estimated_mesh_size)} subValue="nodes" />
          <StatItem label="IPv6 MTU" value={status.effective_ipv6_mtu} subValue="bytes" />
          <StatItem label="Leaf Only" value={status.is_leaf_only ? 'YES' : 'NO'} color={status.is_leaf_only ? 'text-amber-400' : 'text-neutral-500'} />
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
            <StatItem label="TUN Interface" value={status.tun_name} color="text-purple-400" />
          </div>
          <StatItem label="TUN State" value={status.tun_state} />
        </div>
      </Card>

      <Card title="Forwarding Plane" iconColor="bg-blue-500">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-4">
            <h4 className="text-[9px] uppercase tracking-tighter text-neutral-600 font-black border-l-2 border-blue-500 pl-2">Traffic In</h4>
            <StatItem label="Received" value={formatCount(fwd.received_packets)} subValue={formatBytes(fwd.received_bytes)} color="text-blue-400" />
            <StatItem label="Delivered" value={formatCount(fwd.delivered_packets)} subValue={formatBytes(fwd.delivered_bytes)} color="text-green-400" />
          </div>
          <div className="space-y-4">
            <h4 className="text-[9px] uppercase tracking-tighter text-neutral-600 font-black border-l-2 border-purple-500 pl-2">Traffic Out</h4>
            <StatItem label="Originated" value={formatCount(fwd.originated_packets)} subValue={formatBytes(fwd.originated_bytes)} />
            <StatItem label="Forwarded" value={formatCount(fwd.forwarded_packets)} subValue={formatBytes(fwd.forwarded_bytes)} color="text-purple-400" />
          </div>
          <div className="col-span-2 pt-2 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatItem label="No Route" value={formatCount(fwd.drop_no_route_packets)} color="text-red-400" />
            <StatItem label="MTU Drop" value={formatCount(fwd.drop_mtu_exceeded_packets)} color="text-red-400" />
            <StatItem label="TTL Exp" value={formatCount(fwd.ttl_exhausted_packets)} color="text-orange-400" />
            <StatItem label="Decode Err" value={formatCount(fwd.decode_error_packets)} color="text-red-500" />
          </div>
        </div>
      </Card>
    </div>
  )
}

function formatThroughput(val: number): string {
  if (val < 0) return "0 B/s"
  if (val < 1000) return `${val.toFixed(0)} B/s`
  if (val < 1000000) return `${(val / 1000).toFixed(val >= 100000 ? 0 : (val >= 10000 ? 1 : 2))} KB/s`
  if (val < 1000000000) return `${(val / 1000000).toFixed(val >= 100000000 ? 0 : (val >= 10000000 ? 1 : 2))} MB/s`
  return `${(val / 1000000000).toFixed(2)} GB/s`
}

function PeersTab({ data }: { data: any }) {
  const peers = [...(data.peers || [])]
  
  // Sort by LQI ascending (best first) like fipstop
  peers.sort((a, b) => {
    const lqiA = a.mmp?.lqi ?? 999999
    const lqiB = b.mmp?.lqi ?? 999999
    return lqiA - lqiB
  })

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
              const mmp = peer.mmp || {}
              const stats = peer.stats || {}
              const isParent = peer.is_parent
              const isChild = peer.is_child
              
              const rowColor = isParent ? 'text-fuchsia-500' : isChild ? 'text-cyan-400' : 'text-neutral-300'
              const transport = peer.transport_type && peer.transport_addr 
                ? `${peer.transport_type}/${peer.transport_addr}`
                : peer.transport_type || peer.transport_addr || '-'

              return (
                <tr key={i} className={`hover:bg-white/[0.02] transition-colors group font-mono text-[11px] ${rowColor}`}>
                  <td className="pl-5 pr-4 py-2 font-bold whitespace-nowrap">
                    {peer.display_name || '-'}
                  </td>
                  <td className="pr-4 py-2 opacity-70 truncate max-w-[200px]">
                    {peer.npub || '-'}
                  </td>
                  <td className="pr-4 py-2 whitespace-nowrap">
                    {transport}
                  </td>
                  <td className="pr-4 py-2">
                    {peer.direction === 'inbound' ? 'in' : peer.direction === 'outbound' ? 'out' : '-'}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.srtt_ms != null ? mmp.srtt_ms.toFixed(1) : '-'}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {(mmp.smoothed_loss ?? mmp.loss_rate ?? 0).toFixed(3)}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {mmp.lqi != null ? mmp.lqi.toFixed(2) : '-'}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {formatThroughput(mmp.goodput_bps ?? 0)}
                  </td>
                  <td className="pr-4 py-2 text-right">
                    {stats.packets_sent ?? '-'}
                  </td>
                  <td className="pr-5 py-2 text-right">
                    {stats.packets_recv ?? '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SessionsTab({ data }: { data: any }) {
  const sessions = data.sessions || []
  return (
    <Card title={`Active Sessions (${sessions.length})`} iconColor="bg-indigo-500">
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-neutral-500 text-[10px] uppercase tracking-widest border-b border-neutral-800">
              <th className="pl-5 pr-4 py-3 font-bold">Session</th>
              <th className="pr-4 py-3 font-bold">State / Mode</th>
              <th className="pr-4 py-3 font-bold text-right">Metrics</th>
              <th className="pr-4 py-3 font-bold text-right">Traffic</th>
              <th className="pr-5 py-3 font-bold text-right">MTU / SQI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {sessions.map((s: any, i: number) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="pl-5 pr-4 py-3">
                  <div className="font-bold text-white flex items-center gap-2">
                    {s.display_name || 'Unnamed'}
                    {s.is_initiator && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded font-black uppercase tracking-tighter">Init</span>}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-500 truncate max-w-[150px]">{s.npub}</div>
                </td>
                <td className="pr-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-neutral-300 font-bold uppercase">{s.state}</span>
                    <span className="text-[9px] text-neutral-500 font-mono">Mode: {s.mmp_mode || 'Default'}</span>
                  </div>
                </td>
                <td className="pr-4 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-mono text-white">{s.srtt_ms?.toFixed(1) ?? '-'}ms</div>
                    <div className="text-[10px] font-mono text-neutral-500">Loss: {(s.loss_rate * 100).toFixed(1)}%</div>
                  </div>
                </td>
                <td className="pr-4 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-mono text-blue-400 font-bold">{formatBps(s.goodput_bps)}</div>
                    <div className="text-[10px] font-mono text-neutral-500">{formatCount(s.packets_sent + s.packets_recv)} pkts</div>
                  </div>
                </td>
                <td className="pr-5 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <div className="text-xs font-mono text-neutral-300">MTU: {s.path_mtu || '-'}</div>
                    <div className="text-[10px] font-mono text-neutral-500">SQI: {s.sqi?.toFixed(2) ?? '-'}</div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TransportsTab({ data }: { data: any }) {
  const transports = data.transports || []
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {transports.map((t: any, i: number) => (
        <Card key={i} title={`${t.type} Transport #${t.transport_id}`} iconColor={t.state === 'up' ? 'bg-green-500' : 'bg-red-500'}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <StatItem label="State" value={t.state} color={t.state === 'up' ? 'text-green-500' : 'text-red-500'} />
            <StatItem label="MTU" value={t.mtu} />
            <StatItem label="Name" value={t.name} color="text-blue-400" />
            <StatItem label="Local Port" value={t.local_port} />
            <StatItem label="TX Packets" value={formatCount(t.packets_sent)} />
            <StatItem label="RX Packets" value={formatCount(t.packets_recv)} />
          </div>
          
          <div className="border-t border-neutral-800 pt-4">
            <h4 className="text-[10px] uppercase font-black text-neutral-600 tracking-widest mb-3">Error & Flow Stats</h4>
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="TX Errs" value={t.send_errors} color={t.send_errors > 0 ? "text-red-400" : "text-neutral-500"} />
              <StatItem label="RX Errs" value={t.recv_errors} color={t.recv_errors > 0 ? "text-red-400" : "text-neutral-500"} />
              <StatItem label="MTU Drops" value={t.mtu_exceeded} color={t.mtu_exceeded > 0 ? "text-orange-400" : "text-neutral-500"} />
              <StatItem label="Refused" value={t.connect_refused} />
              <StatItem label="Timeouts" value={t.connect_timeouts} color={t.connect_timeouts > 0 ? "text-red-400" : "text-neutral-500"} />
              <StatItem label="Beacons" value={formatCount(t.beacons_sent)} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TreeTab({ data }: { data: any }) {
  const tree = data.tree || {}
  const treePeers = tree.peers || []
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Tree Geometry" iconColor="bg-amber-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Is Root" value={tree.is_root ? 'YES' : 'NO'} color={tree.is_root ? 'text-amber-400' : 'text-white'} />
            <StatItem label="Depth" value={tree.depth} />
            <div className="col-span-2">
              <StatItem label="Root" value={tree.root} color="text-neutral-400 font-mono text-[10px]" />
            </div>
            <StatItem label="Parent" value={tree.parent_display_name || 'None'} color="text-green-400" />
          </div>
        </Card>

        <Card title="Topology Stats" iconColor="bg-orange-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Accepted" value={tree.stats?.accepted} />
            <StatItem label="Received" value={tree.stats?.received} />
            <StatItem label="Switches" value={tree.stats?.parent_switches} color="text-orange-400" />
            <StatItem label="Losses" value={tree.stats?.parent_losses} color="text-red-400" />
          </div>
        </Card>
      </div>

      <Card title={`Spanning Tree Peers (${treePeers.length})`} iconColor="bg-yellow-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {treePeers.map((p: any, i: number) => (
            <div key={i} className="bg-black/40 border border-neutral-800 p-3 rounded-xl">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-yellow-400">{p.display_name || 'Unknown'}</span>
                <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-bold">Lvl {p.depth}</span>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                <span>Dist: {p.distance_to_us}</span>
                <span className="truncate ml-4">{p.coords?.join(',')}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function FiltersTab({ data }: { data: any }) {
  const bloom = data.bloom || {}
  const peerFilters = bloom.peer_filters || []
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Filter State" iconColor="bg-cyan-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Sequence" value={bloom.sequence} />
            <StatItem label="Leaf Only" value={bloom.is_leaf_only ? 'YES' : 'NO'} />
            <StatItem label="Leaf Deps" value={bloom.leaf_dependent_count} />
          </div>
        </Card>
        <Card title="Propagation Metrics" iconColor="bg-cyan-600">
          <div className="grid grid-cols-3 gap-4">
            <StatItem label="Recv" value={bloom.stats?.received} />
            <StatItem label="Accpt" value={bloom.stats?.accepted} />
            <StatItem label="Sent" value={bloom.stats?.sent} />
          </div>
        </Card>
      </div>

      <Card title={`Peer Filters (${peerFilters.length})`} iconColor="bg-cyan-400">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {peerFilters.map((f: any, i: number) => (
            <div key={i} className="bg-black/40 border border-neutral-800 p-3 rounded-xl flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-cyan-400">{f.display_name}</span>
                <span className={f.has_filter ? 'text-green-500 text-[10px] font-black' : 'text-red-500 text-[10px] font-black'}>
                  {f.has_filter ? 'ACTIVE' : 'NONE'}
                </span>
              </div>
              <div className="grid grid-cols-2 text-[10px] text-neutral-500 font-mono">
                <div>Seq: {f.filter_sequence}</div>
                <div>Fill: {(f.fill_ratio * 100).toFixed(1)}%</div>
                <div className="col-span-2">Est. Items: {Math.round(f.estimated_count)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function PerformanceTab({ data }: { data: any }) {
  const mmp = data.mmp || {}
  const mmpPeers = mmp.peers || []
  return (
    <Card title={`Link MMP Metrics (${mmpPeers.length} peers)`} iconColor="bg-emerald-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {mmpPeers.map((p: any, i: number) => (
          <div key={i} className="bg-black/40 border border-neutral-800 p-4 rounded-xl space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
              <span className="font-bold text-emerald-400">{p.display_name}</span>
              <span className="text-[10px] text-neutral-500 font-mono">{p.npub?.slice(0, 16)}...</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="SRTT" value={p.link_layer?.srtt_ms?.toFixed(1)} subValue="ms" />
              <StatItem label="Loss" value={p.link_layer?.smoothed_loss?.toFixed(4)} />
              <StatItem label="ETX" value={p.link_layer?.smoothed_etx?.toFixed(2)} />
              <StatItem label="LQI" value={p.link_layer?.lqi?.toFixed(2)} />
              <StatItem label="Goodput" value={(p.link_layer?.goodput_bps / 1000).toFixed(1)} subValue="Kbps" color="text-blue-400" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function RoutingTab({ data }: { data: any }) {
  const routing = data.routing || {}
  const cache = data.cache || {}
  const fwd = routing.forwarding || {}
  const disc = routing.discovery || {}

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Cache State" iconColor="bg-sky-500">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Coord Entries" value={routing.coord_cache_entries} />
            <StatItem label="Identity Entries" value={routing.identity_cache_entries} />
            <StatItem label="Cache Fill" value={cache.fill_ratio ? (cache.fill_ratio * 100).toFixed(1) + '%' : '-'} />
            <StatItem label="Avg Age" value={cache.avg_age_ms ? (cache.avg_age_ms / 1000).toFixed(1) + 's' : '-'} />
          </div>
        </Card>
        
        <Card title="Discovery Engine" iconColor="bg-sky-600">
          <div className="grid grid-cols-2 gap-6">
            <StatItem label="Pending" value={routing.pending_lookups} />
            <StatItem label="Req Recv" value={disc.req_received} />
            <StatItem label="Resp Recv" value={disc.resp_received} />
            <StatItem label="Resp Accpt" value={disc.resp_accepted} />
          </div>
        </Card>
      </div>

      <Card title="Forwarding Plane" iconColor="bg-blue-600">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <StatItem label="Received" value={fwd.received_packets} color="text-blue-400" />
          <StatItem label="Delivered" value={fwd.delivered_packets} color="text-green-400" />
          <StatItem label="Forwarded" value={fwd.forwarded_packets} color="text-purple-400" />
          <StatItem label="Originated" value={fwd.originated_packets} />
          
          <StatItem label="No Route" value={fwd.drop_no_route_packets} color="text-red-400" />
          <StatItem label="MTU Drop" value={fwd.drop_mtu_exceeded_packets} color="text-red-400" />
          <StatItem label="TTL Expired" value={fwd.ttl_exhausted_packets} color="text-red-400" />
          <StatItem label="Send Errors" value={fwd.drop_send_error_packets} color="text-red-400" />
        </div>
      </Card>
    </div>
  )
}
