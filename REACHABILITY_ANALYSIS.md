# FIPS Mobile vs. Desktop: Node Reachability Analysis

This document summarizes the investigation into why the mobile (Android) version of FIPS may display fewer nodes or have more limited reachability than the desktop version when using identical configurations.

## Executive Summary
The primary differences in reachability stem from **discovery mechanisms**, **identity persistence**, and **spanning tree convergence rules**. While the protocol core is identical, the environment and default transport settings on mobile currently favor an isolated "leaf" behavior unless specific conditions are met.

---

## 1. Discovery Limitations

### transport-Level Auto-Discovery
*   **Desktop:** Automatically uses **Ethernet multicast beacons** and **BLE scanning** (on Linux/macOS) to find and peer with local nodes. This often builds a large initial set of peers without manual configuration.
*   **Mobile:** Currently lacks support for Ethernet/BLE discovery. It relies strictly on manually configured **Static Peers**. This significantly reduces the initial "mesh horizon" of the node.

### Identity Cache Misses (The "Ping Bug")
*   **Issue:** On mobile, the `Mesh Ping` tool used with an `npub` calculates the target's address but fails to register the public key in the internal **Identity Cache**.
*   **Effect:** FIPS cannot start an end-to-end session without a public key. Since discovery for coordinates only triggers when a session is attempted, the request is dropped immediately if the cache is empty.
*   **Desktop Contrast:** Desktop users typically interact via the **DNS responder** (`.fips` domains), which automatically populates this cache upon resolution.

---

## 2. Spanning Tree Convergence

Reachability in FIPS depends on **Bloom Filter propagation**, which occurs only between **Tree Neighbors** (Parent/Child).

### Root Election & Hysteresis
*   FIPS nodes elect a "Root" based on the smallest `NodeAddr`. 
*   If your mobile node generates a random identity that happens to be "smaller" than your gateway's current root, the mobile node will declare itself a Root.
*   Due to `parent_hysteresis` (default 20%), the Gateway may not immediately switch to your mobile node as its parent, and your mobile node will not select the Gateway as its parent. 
*   **Result:** Until they converge to the **"Same Root"**, they do not exchange bloom filters, and the mobile node remains unaware of the rest of the mesh.

### MMP Stability Requirement
*   A peer is not eligible for parent selection until **MMP (Metrics Measurement Protocol)** has collected at least one RTT sample. 
*   On mobile, background throttling or network latency can delay this first sample, keeping the node in an isolated state longer than on desktop.

---

## 3. Identity Conflicts

### Shared Identity (nsec)
*   If the **same `nsec`** is used on both mobile and desktop simultaneously while connecting to the same Gateway:
    *   The Gateway sees two different IP/ports claiming the same identity.
    *   This triggers **Cross-Connection resolution** or **Restart detection**.
    *   The Gateway will frequently drop one session to favor the "fresher" one, leading to reachability "flapping" where only one device is truly part of the mesh at a time.

---

## 4. Troubleshooting Steps (Mobile)

If you see fewer nodes on mobile than expected:

1.  **Check "Mesh Size" (Dashboard):** If it shows `1` or `2`, you are peered but haven't received the global mesh filter.
2.  **Verify Tree State (Monitor -> Tree):** Look for your peer's status.
    *   **Red ("diff root"):** Propagation is blocked. Convergence is still in progress or blocked by hysteresis.
    *   **Green ("same root"):** Propagation is active. You should see more nodes shortly.
3.  **Check "Leaf Only" (Node Tab):** Ensure this is `NO`. If `YES`, your node is configured to not participate in routing or full filter exchange.
4.  **Confirm Distinct Identities:** Ensure your mobile `nsec` is unique if both mobile and desktop are online.
