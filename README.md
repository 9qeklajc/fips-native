# fips-android

A cross-platform Tauri application (desktop and Android) that provides a
graphical interface for running and inspecting a [FIPS](./fips/README.md)
mesh network node — the Free Internetworking Peering System, a distributed,
decentralized routing protocol for mesh nodes connecting over arbitrary
transports.

The app bundles the FIPS node directly and exposes node configuration and
live network monitoring — including an interactive visualization of the
mesh topology — through a modern React frontend.

> **Note:** The FIPS implementation under [`fips/`](./fips/) was cloned
> from the [upstream FIPS repository](https://github.com/jmcorgan/fips/tree/master)
> into this repository to make it compatible with being built as a native
> app. This should be fixed in the future — ideally by depending on the
> upstream FIPS crate directly rather than maintaining a fork.
