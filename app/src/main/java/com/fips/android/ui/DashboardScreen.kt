package com.fips.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.fips.android.FipsBridge
import com.fips.android.NodeStatus
import kotlinx.coroutines.delay

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

class DashboardViewModel : ViewModel() {
    var status by mutableStateOf(NodeStatus())
        private set

    /** Poll the Rust bridge for status every second. */
    suspend fun pollStatus() {
        while (true) {
            status = FipsBridge.status()
            delay(1_000)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun DashboardScreen(
    onStart: () -> Unit,
    onStop:  () -> Unit,
    vm: DashboardViewModel = viewModel(),
) {
    LaunchedEffect(Unit) { vm.pollStatus() }

    val status = vm.status

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Header
        Text(
            text  = "FIPS Mesh",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold,
        )

        if (status.version.isNotBlank()) {
            Text(
                text  = "v${status.version}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            )
        }

        Spacer(Modifier.height(4.dp))

        // Status indicator card
        StatusCard(status)

        // Identity card
        if (!status.identity.isNullOrBlank()) {
            InfoCard(label = "Identity", value = status.identity)
        }

        // Stats row
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatChip(label = "Peers", value = status.peer_count.toString(), modifier = Modifier.weight(1f))
            StatChip(label = "TUN",   value = status.tun_state,             modifier = Modifier.weight(1f))
        }

        // Error banner
        if (!status.error.isNullOrBlank()) {
            ErrorBanner(message = status.error)
        }

        Spacer(Modifier.weight(1f))

        // Start / Stop button
        Button(
            onClick = if (status.running) onStop else onStart,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (status.running)
                    MaterialTheme.colorScheme.error
                else
                    MaterialTheme.colorScheme.primary,
            ),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text(
                text     = if (status.running) "Stop FIPS" else "Start FIPS",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-composables
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun StatusCard(status: NodeStatus) {
    val dotColor = when {
        status.running          -> Color(0xFF34D399)  // green
        !status.error.isNullOrBlank() -> Color(0xFFF87171)  // red
        else                    -> Color(0xFF94A3B8)  // grey
    }
    val label = when {
        status.running -> "Connected"
        !status.error.isNullOrBlank() -> "Error"
        else -> "Disconnected"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape    = RoundedCornerShape(16.dp),
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
            Text(
                text  = label,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun InfoCard(label: String, value: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape    = RoundedCornerShape(16.dp),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text  = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text       = value,
                style      = MaterialTheme.typography.bodyMedium,
                color      = MaterialTheme.colorScheme.primary,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape    = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier           = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text  = value,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text  = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.error.copy(alpha = 0.15f)
        ),
        shape    = RoundedCornerShape(12.dp),
    ) {
        Text(
            text     = message,
            modifier = Modifier.padding(16.dp),
            color    = MaterialTheme.colorScheme.error,
            style    = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
        )
    }
}
