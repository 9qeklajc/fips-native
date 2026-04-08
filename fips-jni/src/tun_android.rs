//! Android VPN TUN fd reader/writer — Phase 2.
//!
//! When `TunDevice::from_fd()` is available in fips, this module wires the
//! Android `ParcelFileDescriptor` into the fips node's packet channels,
//! replacing the Phase 1 approach of running the node with TUN disabled.
//!
//! # Packet flow
//!
//! ```text
//! Android apps
//!      │ (IPv6 packets via VPN fd)
//!      ▼
//! [tun_android reader thread]  →  TunOutboundTx  →  fips Node (encrypt + route)
//!
//! fips Node (decrypt + deliver)  →  TunTx  →  [tun_android writer thread]
//!      │
//!      ▼
//! Android apps (via VPN fd)
//! ```

use std::fs::File;
use std::io::{Read, Write};
use std::os::unix::io::{FromRawFd, RawFd};

use fips::upper::tun::{TunOutboundTx, TunTx};

/// Holds the raw VPN file descriptor and spawns reader/writer threads.
pub struct AndroidTun {
    fd: RawFd,
    mtu: u16,
}

impl AndroidTun {
    pub fn new(fd: RawFd, mtu: u16) -> Self {
        Self { fd, mtu }
    }

    /// Activate the Android TUN interface.
    ///
    /// Returns a `(TunTx, TunOutboundTx)` pair that can be passed to the fips
    /// node once Phase 2 is wired. Spawns OS threads for the reader and writer.
    pub fn activate(self) -> (TunTx, TunOutboundTx) {
        let (tun_tx, tun_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let (outbound_tx, _outbound_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);

        // Reader: VPN fd → node outbound channel
        let read_fd = unsafe { libc::dup(self.fd) };
        let mtu = self.mtu;
        let reader_tx = outbound_tx.clone();
        std::thread::Builder::new()
            .name("fips-tun-reader".to_string())
            .spawn(move || {
                let mut file = unsafe { File::from_raw_fd(read_fd) };
                let mut buf = vec![0u8; mtu as usize + 4];
                loop {
                    match file.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if reader_tx.blocking_send(buf[..n].to_vec()).is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::error!("TUN read error: {e}");
                            break;
                        }
                    }
                }
                tracing::debug!("TUN reader thread exiting");
            })
            .expect("failed to spawn tun reader");

        // Writer: node → VPN fd
        let write_fd = unsafe { libc::dup(self.fd) };
        std::thread::Builder::new()
            .name("fips-tun-writer".to_string())
            .spawn(move || {
                let mut file = unsafe { File::from_raw_fd(write_fd) };
                for packet in tun_rx {
                    if let Err(e) = file.write_all(&packet) {
                        tracing::error!("TUN write error: {e}");
                        break;
                    }
                }
                tracing::debug!("TUN writer thread exiting");
            })
            .expect("failed to spawn tun writer");

        (tun_tx, outbound_tx)
    }
}
