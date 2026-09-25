package com.example.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

val UnoRed = Color(0xFFE53935)
val UnoYellow = Color(0xFFFDD835)
val UnoGreen = Color(0xFF43A047)
val UnoBlue = Color(0xFF1E88E5)
val UnoDark = Color(0xFF0F172A)
val UnoDarkSurface = Color(0xFF1E293B)
val UnoGold = Color(0xFFFFD54F)

val PrimaryDark = Color(0xFFE53935)
val SecondaryDark = Color(0xFFFFD54F)
val TertiaryDark = Color(0xFF1E88E5)

val BackgroundDark = Color(0xFF0F172A)
val SurfaceDark = Color(0xFF1E293B)

/**
 * Premium "arena" design tokens — a warm ember/obsidian palette used across the
 * gameplay table, lobby, and glass panels. Centralized here so every screen shares
 * one visual identity instead of ad-hoc hex values.
 */
object ArenaPalette {
    // Base atmosphere: near-black obsidian with a warm ember undertone (not pure UNO red)
    val ObsidianDeep = Color(0xFF0B0C10)
    val ObsidianSurface = Color(0xFF15171F)
    val EmberCore = Color(0xFFFF6A3D)
    val EmberDeep = Color(0xFFB2274A)
    val AccentGold = Color(0xFFFFC857)

    // Glass surface fills/borders used for panels, chips, and cards-on-glass
    val GlassFill = Color(0x33FFFFFF)
    val GlassFillStrong = Color(0x59FFFFFF)
    val GlassBorder = Color(0x40FFFFFF)
    val GlassBorderBright = Color(0x80FFFFFF)

    // Status accents
    val TurnGlow = Color(0xFFFFC857)
    val DangerGlow = Color(0xFFFF4757)
    val ConnectedDot = Color(0xFF2ED573)
    val DisconnectedDot = Color(0xFF747D8C)

    val tableAtmosphere = Brush.radialGradient(
        colors = listOf(
            EmberDeep.copy(alpha = 0.35f),
            ObsidianSurface.copy(alpha = 0.55f),
            ObsidianDeep
        )
    )

    val tableFelt = Brush.linearGradient(
        colors = listOf(
            Color(0xFF1B1E29),
            Color(0xFF121319)
        )
    )

    fun glassPanel(alphaBoost: Float = 0f) = Brush.verticalGradient(
        colors = listOf(
            Color.White.copy(alpha = 0.12f + alphaBoost),
            Color.White.copy(alpha = 0.04f + alphaBoost)
        )
    )
}
