package com.fips.app

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

class ServiceCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        Log.d("ServiceCheckWorker", "Checking if FipsService is running...")
        FipsService.startService(applicationContext)
        return Result.success()
    }
}
