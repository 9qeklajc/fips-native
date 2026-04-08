package com.fips.android

/**
 * Kotlin wrapper around the Rust JNI library.
 *
 * The native library is built by running:
 *   ./scripts/build_android.sh
 *
 * The resulting .so files are copied to app/src/main/jniLibs/.
 */
object FipsBridge {

    init {
        System.loadLibrary("fips_jni")
    }

    // -------------------------------------------------------------------------
    // Native declarations (implemented in fips-jni/src/lib.rs)
    // -------------------------------------------------------------------------

    /**
     * Start the FIPS mesh node.
     *
     * @param tunFd       File descriptor of the Android VPN interface
     *                    (from [android.os.ParcelFileDescriptor.getFd]).
     * @param dataDir     App's internal files directory (for identity key storage).
     * @param configYaml  Optional YAML config string. Empty string uses defaults.
     */
    private external fun startFips(tunFd: Int, dataDir: String, configYaml: String)

    /** Stop the FIPS mesh node. */
    private external fun stopFips()

    /** Return current node status as a JSON string. */
    private external fun getStatus(): String

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    fun start(tunFd: Int, dataDir: String, configYaml: String = "") {
        startFips(tunFd, dataDir, configYaml)
    }

    fun stop() {
        stopFips()
    }

    fun status(): NodeStatus {
        val json = getStatus()
        return try {
            kotlinx.serialization.json.Json.decodeFromString(json)
        } catch (e: Exception) {
            NodeStatus()
        }
    }
}

@kotlinx.serialization.Serializable
data class NodeStatus(
    val running: Boolean = false,
    val version: String = "",
    val identity: String? = null,
    val peer_count: Int = 0,
    val tun_state: String = "disabled",
    val error: String? = null,
)
