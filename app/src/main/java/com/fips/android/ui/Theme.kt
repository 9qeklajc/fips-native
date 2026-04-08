package com.fips.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val FipsDarkColors = darkColorScheme(
    primary        = Color(0xFF6EE7B7),   // emerald-300
    onPrimary      = Color(0xFF064E3B),
    secondary      = Color(0xFF67E8F9),   // cyan-300
    onSecondary    = Color(0xFF164E63),
    background     = Color(0xFF0F172A),   // slate-900
    onBackground   = Color(0xFFE2E8F0),   // slate-200
    surface        = Color(0xFF1E293B),   // slate-800
    onSurface      = Color(0xFFCBD5E1),   // slate-300
    surfaceVariant = Color(0xFF334155),   // slate-700
    error          = Color(0xFFF87171),   // red-400
)

@Composable
fun FipsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FipsDarkColors,
        content     = content,
    )
}
