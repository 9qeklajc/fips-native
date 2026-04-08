package com.fips.android

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.fips.android.ui.DashboardScreen
import com.fips.android.ui.FipsTheme

class MainActivity : ComponentActivity() {

    /** Launched after VpnService.prepare() returns RESULT_OK. */
    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            startFipsVpn()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FipsTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    DashboardScreen(
                        onStart = { requestVpnPermissionAndStart() },
                        onStop  = { stopFipsVpn() },
                    )
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // VPN permission + service control
    // -------------------------------------------------------------------------

    private fun requestVpnPermissionAndStart() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            // User hasn't granted VPN permission yet — show the system dialog.
            vpnPermissionLauncher.launch(intent)
        } else {
            // Permission already granted.
            startFipsVpn()
        }
    }

    private fun startFipsVpn() {
        startService(
            Intent(this, FipsVpnService::class.java).apply {
                action = FipsVpnService.ACTION_START
            }
        )
    }

    private fun stopFipsVpn() {
        startService(
            Intent(this, FipsVpnService::class.java).apply {
                action = FipsVpnService.ACTION_STOP
            }
        )
    }
}
