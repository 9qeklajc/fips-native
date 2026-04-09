import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Peer {
  npub: string;
  alias: string;
  address: string;
  transport: string;
}

interface AppConfig {
  node: {
    persistent: boolean;
    nsec: string | null;
  };
  tun: {
    enabled: boolean;
    name: string;
    mtu: number;
  };
  dns: {
    enabled: boolean;
    bind_addr: string;
    port: number;
  };
  transports: {
    udp_enabled: boolean;
    udp_bind_addr: string;
    tcp_enabled: boolean;
    tcp_bind_addr: string;
    ethernet_enabled: boolean;
    ethernet_interface: string;
  };
  peers: Peer[];
}

interface ConfigViewProps {
  onClose: () => void;
}

export function ConfigView({ onClose }: ConfigViewProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ping state
  const [pingTarget, setPingTarget] = useState("");
  const [pingResult, setPingResult] = useState<any>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      setConfig(cfg);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("update_config", { config });
      onClose();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setSaving(false);
    }
  }

  async function handlePing() {
    if (!pingTarget) return;
    setPinging(true);
    setPingResult(null);
    try {
      const res = await invoke("ping_node", { target: pingTarget });
      setPingResult(res);
    } catch (e: any) {
      setPingResult({ error: e.toString() });
    } finally {
      setPinging(false);
    }
  }

  function updatePeer(index: number, field: keyof Peer, value: string) {
    if (!config) return;
    const newPeers = [...config.peers];
    newPeers[index] = { ...newPeers[index], [field]: value };
    setConfig({ ...config, peers: newPeers });
  }

  function addPeer() {
    if (!config) return;
    const newPeer: Peer = {
      npub: "",
      alias: "",
      address: "",
      transport: "udp",
    };
    setConfig({ ...config, peers: [...config.peers, newPeer] });
  }

  function removePeer(index: number) {
    if (!config) return;
    const newPeers = config.peers.filter((_, i) => i !== index);
    setConfig({ ...config, peers: newPeers });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-neutral-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold tracking-widest uppercase text-xs">
            Loading configuration...
          </p>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-4 sm:py-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Settings & Tools
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-widest">
              CONFIGURATION
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <button
            onClick={() => {
              if (config) {
                invoke("update_config", { config });
              }
            }}
            className="px-4 py-2 bg-amber-600/20 text-amber-500 hover:bg-amber-600 hover:text-white rounded-lg text-sm font-bold transition-all border border-amber-500/20 whitespace-nowrap"
          >
            Restart Only
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 text-white hover:bg-neutral-700 rounded-lg text-sm font-bold transition-all border border-neutral-700 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-all whitespace-nowrap"
          >
            {saving ? "Saving..." : "Save & Restart"}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Tools Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500 border-l-2 border-green-500 pl-2">
            Diagnostic Tools
          </h3>
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-4">Mesh Ping</h4>
            <p className="text-xs text-neutral-500 mb-4">
              Send an ICMPv6 Echo Request to a node in the mesh via its NPUB or
              Node Address.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={pingTarget}
                onChange={(e) => setPingTarget(e.target.value)}
                placeholder="npub1... or Node Address"
                className="flex-1 bg-black border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors text-white"
              />
              <button
                onClick={handlePing}
                disabled={pinging || !pingTarget}
                className="px-6 py-2 bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-all"
              >
                {pinging ? "Pinging..." : "Ping"}
              </button>
            </div>
            {pingResult && (
              <div className="mt-4 p-3 bg-black/50 border border-neutral-800 rounded-lg font-mono text-[11px]">
                <pre className="whitespace-pre-wrap text-neutral-300">
                  {JSON.stringify(pingResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Node Settings */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500 border-l-2 border-blue-500 pl-2">
            Node Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-sm font-bold text-white">Identity</h4>
              <div className="flex items-center justify-between">
                <label className="text-sm text-neutral-400">
                  Persistent Identity
                </label>
                <input
                  type="checkbox"
                  checked={config.node.persistent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      node: { ...config.node, persistent: e.target.checked },
                    })
                  }
                  className="w-4 h-4"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-neutral-500 uppercase font-bold">
                  NSEC (Optional)
                </label>
                <input
                  type="password"
                  value={config.node.nsec || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      node: { ...config.node, nsec: e.target.value || null },
                    })
                  }
                  placeholder="Auto-generated if empty"
                  className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                />
              </div>
            </div>

            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-sm font-bold text-white">TUN Interface</h4>
              <div className="flex items-center justify-between">
                <label className="text-sm text-neutral-400">Enabled</label>
                <input
                  type="checkbox"
                  checked={config.tun.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tun: { ...config.tun, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Name
                  </label>
                  <input
                    type="text"
                    value={config.tun.name}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tun: { ...config.tun, name: e.target.value },
                      })
                    }
                    className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    MTU
                  </label>
                  <input
                    type="number"
                    value={config.tun.mtu}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tun: { ...config.tun, mtu: parseInt(e.target.value) },
                      })
                    }
                    className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Transports */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500 border-l-2 border-purple-500 pl-2">
            Transports
          </h3>
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UDP */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                    UDP Transport
                  </h5>
                  <input
                    type="checkbox"
                    checked={config.transports.udp_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          udp_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-3 h-3"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Bind Address
                  </label>
                  <input
                    type="text"
                    value={config.transports.udp_bind_addr}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          udp_bind_addr: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>

              {/* TCP */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                    TCP Transport
                  </h5>
                  <input
                    type="checkbox"
                    checked={config.transports.tcp_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          tcp_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-3 h-3"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Bind Address
                  </label>
                  <input
                    type="text"
                    value={config.transports.tcp_bind_addr}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          tcp_bind_addr: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>

              {/* Ethernet */}
              <div className="space-y-3 col-span-1 md:col-span-2 pt-4 border-t border-neutral-800">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                    Ethernet Transport
                  </h5>
                  <input
                    type="checkbox"
                    checked={config.transports.ethernet_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          ethernet_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-3 h-3"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Interface
                  </label>
                  <input
                    type="text"
                    value={config.transports.ethernet_interface}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transports: {
                          ...config.transports,
                          ethernet_interface: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g. eth0, en0"
                    className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Static Peers */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500 border-l-2 border-yellow-500 pl-2">
              Static Peers
            </h3>
            <button
              onClick={addPeer}
              className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded font-bold uppercase tracking-tighter transition-colors"
            >
              + Add Peer
            </button>
          </div>
          <div className="space-y-3">
            {config.peers.map((peer, idx) => (
              <div
                key={idx}
                className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 space-y-4 relative group"
              >
                <button
                  onClick={() => removePeer(idx)}
                  className="absolute top-4 right-4 text-neutral-600 hover:text-red-500 transition-colors"
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
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-neutral-500 uppercase font-bold">
                      Alias
                    </label>
                    <input
                      type="text"
                      value={peer.alias}
                      onChange={(e) => updatePeer(idx, "alias", e.target.value)}
                      placeholder="My Peer"
                      className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-neutral-500 uppercase font-bold">
                      NPUB
                    </label>
                    <input
                      type="text"
                      value={peer.npub}
                      onChange={(e) => updatePeer(idx, "npub", e.target.value)}
                      placeholder="npub1..."
                      className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-neutral-500 uppercase font-bold">
                      Address
                    </label>
                    <input
                      type="text"
                      value={peer.address}
                      onChange={(e) =>
                        updatePeer(idx, "address", e.target.value)
                      }
                      placeholder="host:port"
                      className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-neutral-500 uppercase font-bold">
                      Transport
                    </label>
                    <select
                      value={peer.transport}
                      onChange={(e) =>
                        updatePeer(idx, "transport", e.target.value)
                      }
                      className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                    >
                      <option value="udp">UDP</option>
                      <option value="tcp">TCP</option>
                      <option value="ethernet">Ethernet</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {config.peers.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-neutral-900 rounded-2xl">
                <p className="text-neutral-600 text-sm">
                  No static peers configured.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
