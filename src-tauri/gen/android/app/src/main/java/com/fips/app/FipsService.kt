package com.fips.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.VpnService
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class FipsService : VpnService() {
    private val TAG = "FipsService"
    private val CHANNEL_ID = "FipsServiceChannel"
    private val NOTIFICATION_ID = 1
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var tunInterface: ParcelFileDescriptor? = null

    // Native methods from Rust
    private external fun startRustServer(basePath: String, tunFd: Int)
    private external fun stopRustServer()

    companion object {
        init {
            // Load the Rust library
            System.loadLibrary("fips_native_lib")
        }

        fun startService(context: Context) {
            // Request VPN permission if not granted
            val intent = VpnService.prepare(context)
            if (intent != null) {
                // We are in a static context, usually called from MainActivity
                // MainActivity should handle the result of VpnService.prepare
                return
            }

            try {
                val serviceIntent = Intent(context, FipsService::class.java)

                val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    PendingIntent.getForegroundService(
                        context,
                        0,
                        serviceIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                } else {
                    PendingIntent.getService(
                        context,
                        0,
                        serviceIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                }

                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                // Use a short delay to ensure system is ready
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pendingIntent)
                    } catch (e: SecurityException) {
                        Log.w("FipsService", "Exact alarm permission missing, falling back to non-exact alarm")
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pendingIntent)
                    }
                } else {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pendingIntent)
                }
            } catch (e: Exception) {
                Log.e("FipsService", "Failed to start service via AlarmManager", e)
                // Fallback to direct start
                val serviceIntent = Intent(context, FipsService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "FipsService created")
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FipsService::WakeLock")
        wakeLock?.acquire()

        val wifiManager = getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "FipsService::WifiLock")
        wifiLock?.acquire()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "FipsService started")

        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE is 0x40000000
            startForeground(NOTIFICATION_ID, notification, 0x40000000)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Establish the VPN interface
        establishVpn()

        // Start the Rust server
        val basePath = filesDir.absolutePath
        val fd = tunInterface?.fd ?: -1
        startRustServer(basePath, fd)

        return START_STICKY
    }

    private fun establishVpn() {
        try {
            val builder = Builder()
            builder.setSession("FIPS VPN")
            builder.setMtu(1280)
            
            // FIPS virtual IPv4 space for .fips mappings
            builder.addAddress("10.1.1.1", 32)
            builder.addRoute("10.0.0.0", 8) 
            
            // FIPS native IPv6 space
            builder.addAddress("fc00:f175:add::1", 128)
            builder.addRoute("fc00::", 7)
            
            // 1. Primary DNS: Our local FIPS node
            builder.addDnsServer("10.1.1.1")

            // 2. Secondary DNS: Try to get system DNS to keep internet working
            try {
                val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val activeNetwork = connectivityManager.activeNetwork
                    val linkProperties = connectivityManager.getLinkProperties(activeNetwork)
                    linkProperties?.dnsServers?.forEach { dns ->
                        val dnsAddr = dns.hostAddress
                        if (dnsAddr != null && dnsAddr != "10.1.1.1" && dnsAddr != "127.0.0.1") {
                            builder.addDnsServer(dnsAddr)
                            Log.d(TAG, "Added system DNS fallback: $dnsAddr")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to get system DNS servers", e)
            }

            // 3. Last resort DNS
            builder.addDnsServer("8.8.8.8")
            builder.addDnsServer("1.1.1.1")
            
            // Search domain for .fips
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.addSearchDomain("fips")
            }

            // EXCLUDE our own app from the VPN to avoid routing loops
            // The FIPS node's transport sockets (UDP/TCP) will then go over WiFi/LTE
            builder.addDisallowedApplication(packageName)

            tunInterface = builder.establish()
            Log.d(TAG, "VPN interface established with FD: ${tunInterface?.fd}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN", e)
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "Task removed, restarting service in 1 second")
        startService(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        Log.d(TAG, "FipsService destroying")
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wifiLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        stopRustServer()
        tunInterface?.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotification(): Notification {
        val title = "FIPS Mesh Active"
        val message = "FIPS is running in the background"

        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Fips Background Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }
}

