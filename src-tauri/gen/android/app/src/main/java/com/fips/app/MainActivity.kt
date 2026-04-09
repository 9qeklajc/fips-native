package com.fips.app

import android.os.Bundle
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {
  private val VPN_REQUEST_CODE = 100

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    requestBatteryOptimizationExemption()
    requestNotificationPermission()

    checkAndStartVpn()
    scheduleServiceCheck()
  }

  private fun checkAndStartVpn() {
    val intent = VpnService.prepare(this)
    if (intent != null) {
      startActivityForResult(intent, VPN_REQUEST_CODE)
    } else {
      onActivityResult(VPN_REQUEST_CODE, RESULT_OK, null)
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == VPN_REQUEST_CODE && resultCode == RESULT_OK) {
      FipsService.startService(this)
    }
  }

  private fun scheduleServiceCheck() {
    val workRequest = PeriodicWorkRequestBuilder<ServiceCheckWorker>(4, TimeUnit.HOURS)
        .setInitialDelay(1, TimeUnit.HOURS)
        .build()
    
    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
        "ServicePersistence",
        ExistingPeriodicWorkPolicy.KEEP,
        workRequest
    )
  }

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
      }
    }
  }

  private fun requestBatteryOptimizationExemption() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val pm = getSystemService(POWER_SERVICE) as PowerManager
      if (!pm.isIgnoringBatteryOptimizations(packageName)) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
      }
    }
  }
}
