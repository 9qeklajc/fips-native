package com.fips.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Android VpnService that manages the FIPS mesh network tunnel.
 *
 * Lifecycle:
 *  1. [MainActivity] calls [VpnService.prepare] to get user consent.
 *  2. MainActivity starts this service via Intent.
 *  3. [onStartCommand] builds the TUN interface and hands the fd to [FipsBridge].
 *  4. [onDestroy] stops the Rust node and closes the TUN interface.
 */
class FipsVpnService : VpnService() {

    private var tunInterface: ParcelFileDescriptor? = null

    companion object {
        private const val TAG = "FipsVpnService"
        private const val NOTIFICATION_CHANNEL_ID = "fips_vpn"
        private const val NOTIFICATION_ID = 1

        const val ACTION_START = "com.fips.android.START"
        const val ACTION_STOP  = "com.fips.android.STOP"

        // IPv6 prefix allocated to this node (placeholder; real address comes from identity).
        private const val VPN_ADDRESS = "fd00::1"
        private const val VPN_PREFIX_LENGTH = 8
        private const val VPN_MTU = 1420
    }

    // -------------------------------------------------------------------------
    // Service lifecycle
    // -------------------------------------------------------------------------

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopVpn()
                return START_NOT_STICKY
            }
            else -> startVpn()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    override fun onRevoke() {
        stopVpn()
        super.onRevoke()
    }

    // -------------------------------------------------------------------------
    // VPN management
    // -------------------------------------------------------------------------

    private fun startVpn() {
        startForeground(NOTIFICATION_ID, buildNotification())

        val tun = buildTunInterface() ?: run {
            Log.e(TAG, "Failed to establish VPN interface")
            stopSelf()
            return
        }

        tunInterface = tun

        val dataDir = filesDir.absolutePath
        Log.i(TAG, "Starting FIPS node (tunFd=${tun.fd}, dataDir=$dataDir)")

        FipsBridge.start(
            tunFd    = tun.fd,
            dataDir  = dataDir,
            configYaml = "",   // use defaults; TODO: load from shared prefs
        )
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping FIPS node")
        FipsBridge.stop()
        tunInterface?.close()
        tunInterface = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * Build the VPN TUN interface via [VpnService.Builder].
     *
     * The IPv6 address is a placeholder; Phase 2 will derive it from the
     * node's identity (FIPS address = fd::/8 prefix + public key hash).
     */
    private fun buildTunInterface(): ParcelFileDescriptor? {
        return try {
            Builder()
                .setSession("FIPS")
                .setMtu(VPN_MTU)
                // Route all IPv6 FIPS addresses (fd::/8) through the tunnel.
                .addAddress(VPN_ADDRESS, VPN_PREFIX_LENGTH)
                .addRoute("fd00::", VPN_PREFIX_LENGTH)
                // Allow all other traffic to bypass the VPN.
                .allowFamily(android.system.OsConstants.AF_INET)
                .allowFamily(android.system.OsConstants.AF_INET6)
                .establish()
        } catch (e: Exception) {
            Log.e(TAG, "VpnService.Builder.establish() failed: $e")
            null
        }
    }

    // -------------------------------------------------------------------------
    // Foreground notification
    // -------------------------------------------------------------------------

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "FIPS Mesh VPN",
                NotificationManager.IMPORTANCE_LOW,
            )
        )

        val stopIntent = PendingIntent.getService(
            this, 0,
            Intent(this, FipsVpnService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE,
        )

        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("FIPS Mesh VPN")
            .setContentText("Mesh network active")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_delete, "Stop", stopIntent)
            .setOngoing(true)
            .build()
    }
}
