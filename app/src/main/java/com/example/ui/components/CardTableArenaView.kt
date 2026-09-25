package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cached
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Player
import com.example.model.TurnDirection
import com.example.model.UnoCard
import com.example.model.UnoColor

/**
 * Responsive Arena / Table Card Layout.
 * Opponents are distributed in an adaptive perimeter arc around the central deck and discard pile.
 * Supports 2 to 10 players seamlessly on mobile portrait screens.
 */
@Composable
fun CardTableArenaView(
    players: List<Player>,
    currentPlayerIndex: Int,
    humanPlayerIndex: Int,
    topCard: UnoCard?,
    drawPileCount: Int,
    activeColor: UnoColor,
    direction: TurnDirection,
    pendingDrawStack: Int,
    onDrawClicked: () -> Unit,
    onPlayerTap: (Int) -> Unit,
    onDoubleTapCatchUno: (Int) -> Unit,
    isSwapSelection: Boolean = false,
    modifier: Modifier = Modifier
) {
    // Collect opponents in clockwise seating order relative to local player
    val total = players.size
    val opponents = mutableListOf<Pair<Int, Player>>()
    if (total > 1) {
        for (step in 1 until total) {
            val idx = (humanPlayerIndex + step) % total
            opponents.add(Pair(idx, players[idx]))
        }
    }

    val opponentCount = opponents.size
    val isVeryCrowded = opponentCount >= 6

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .testTag("card_table_arena")
    ) {
        val arenaWidth = maxWidth
        val arenaHeight = maxHeight

        // Center Table Felt — clean rounded rectangle with a faint "UNO" watermark
        // and an active-color glow ring, matching the reference art direction.
        val feltShape = RoundedCornerShape(28.dp)
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(
                    width = (arenaWidth.value * 0.80f).coerceIn(260f, 340f).dp,
                    height = (arenaHeight.value * 0.46f).coerceIn(180f, 235f).dp
                )
                .clip(feltShape)
                .background(com.example.ui.theme.ArenaPalette.tableFelt)
                .border(
                    width = 1.5.dp,
                    color = com.example.ui.theme.ArenaPalette.GlassBorder,
                    shape = feltShape
                )
                .border(
                    width = 2.dp,
                    brush = Brush.radialGradient(
                        listOf(activeColor.composeColor.copy(alpha = 0.55f), Color.Transparent)
                    ),
                    shape = feltShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "UNO",
                color = Color.White.copy(alpha = 0.05f),
                fontSize = 64.sp,
                fontWeight = FontWeight.Black
            )
        }

        // Center Deck & Discard Pile — labeled exactly like the reference:
        // "DRAW / n cards" under the draw pile, "DISCARD / <Color>" under the discard pile.
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.Top
            ) {
                // Draw Pile (facedown)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(contentAlignment = Alignment.Center) {
                        UnoCardBackView(
                            modifier = Modifier
                                .offset(x = (-2).dp, y = (-2).dp)
                                .alpha(0.5f),
                            width = if (isVeryCrowded) 62.dp else 70.dp,
                            height = if (isVeryCrowded) 93.dp else 105.dp
                        )
                        UnoCardBackView(
                            width = if (isVeryCrowded) 62.dp else 70.dp,
                            height = if (isVeryCrowded) 93.dp else 105.dp,
                            onClick = onDrawClicked
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "DRAW",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.5.sp
                    )
                    Text(
                        text = "$drawPileCount cards",
                        color = Color.White.copy(alpha = 0.65f),
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Discard Pile (faceup)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(contentAlignment = Alignment.Center) {
                        if (topCard != null) {
                            UnoCardView(
                                card = topCard,
                                width = if (isVeryCrowded) 68.dp else 76.dp,
                                height = if (isVeryCrowded) 102.dp else 114.dp,
                                isPlayable = true
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(
                                        width = if (isVeryCrowded) 68.dp else 76.dp,
                                        height = if (isVeryCrowded) 102.dp else 114.dp
                                    )
                                    .background(Color(0x22FFFFFF), RoundedCornerShape(10.dp))
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "DISCARD",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.5.sp
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(activeColor.composeColor)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = activeColor.displayName,
                            color = Color.White.copy(alpha = 0.75f),
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            if (pendingDrawStack > 0) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = Color(0xFFD32F2F),
                    shape = RoundedCornerShape(14.dp),
                    shadowElevation = 3.dp
                ) {
                    Text(
                        text = "🔥 +$pendingDrawStack STACK",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }
        }

        // Perimeter Opponents Positioning
        val slotPositions = getPerimeterSlotPositions(opponentCount)
        val badgeWidth = if (isVeryCrowded) 74.dp else 86.dp
        val badgeHeight = if (isVeryCrowded) 82.dp else 94.dp

        opponents.forEachIndexed { i, (realIndex, opponent) ->
            val slot = slotPositions.getOrElse(i) { Pair(0.5f, 0.12f) }
            val xOffset = arenaWidth * slot.first - (badgeWidth / 2)
            val yOffset = arenaHeight * slot.second - (badgeHeight / 2)

            CompactOpponentBadge(
                player = opponent,
                playerIndex = realIndex,
                isCurrentTurn = realIndex == currentPlayerIndex,
                isSwapTarget = isSwapSelection,
                isCompact = isVeryCrowded,
                badgeWidth = badgeWidth,
                badgeHeight = badgeHeight,
                onTap = { onPlayerTap(realIndex) },
                onDoubleTap = { onDoubleTapCatchUno(realIndex) },
                modifier = Modifier.offset(x = xOffset, y = yOffset)
            )
        }
    }
}

/**
 * Compact Player Indicator for Arena Table.
 * Shows Avatar, Short Name, Card Count, Turn Glow, and UNO Status.
 * Supports Secret Double-Tap UNO Challenge (NO visible hit button!).
 * Displays placement badge when finished in Play Until Last Player mode.
 */
@Composable
private fun CompactOpponentBadge(
    player: Player,
    playerIndex: Int,
    isCurrentTurn: Boolean,
    isSwapTarget: Boolean,
    isCompact: Boolean,
    badgeWidth: Dp,
    badgeHeight: Dp,
    onTap: () -> Unit,
    onDoubleTap: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isFinished = player.finishRank != null || player.isEliminated
    val infiniteTransition = rememberInfiniteTransition(label = "turnPulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.07f,
        animationSpec = infiniteRepeatable(
            animation = tween(650, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    val alpha = if (isFinished) 0.5f else 1f

    Column(
        modifier = modifier
            .width(badgeWidth + 26.dp)
            .alpha(alpha)
            .pointerInput(player.id, player.canBePenalizedUno) {
                detectTapGestures(
                    onDoubleTap = { onDoubleTap() },
                    onTap = { onTap() }
                )
            }
            .testTag("opponent_${player.id}"),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Badge row: circular avatar + name/card-count, floating on the dark backdrop
        // (no boxed card container) to match the reference art direction.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.scale(if (isCurrentTurn && !isFinished) pulseScale else 1f)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(if (isCompact) 30.dp else 36.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(listOf(Color(0xFF334155), Color(0xFF1E293B)))
                        )
                        .border(
                            width = if (isCurrentTurn && !isFinished) 2.dp else 1.dp,
                            color = when {
                                isCurrentTurn && !isFinished -> com.example.ui.theme.ArenaPalette.TurnGlow
                                isSwapTarget -> Color(0xFFFF9800)
                                else -> Color(0x55FFFFFF)
                            },
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = player.avatar, fontSize = if (isCompact) 15.sp else 19.sp)
                }

                // Host crown — real state, not decorative
                if (player.isHost) {
                    Text(
                        text = "👑",
                        fontSize = 11.sp,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 3.dp, y = (-4).dp)
                    )
                }

                // Connection dot — real state
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(
                            if (player.isConnected) com.example.ui.theme.ArenaPalette.ConnectedDot
                            else com.example.ui.theme.ArenaPalette.DisconnectedDot
                        )
                        .border(1.dp, Color(0xFF0B0C10), CircleShape)
                )

                // Prominent UNO badge when player has exactly 1 card
                if (player.cardCount == 1 && !isFinished) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .offset(x = (-8).dp, y = (-6).dp)
                            .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                            .padding(horizontal = 3.dp, vertical = 1.dp)
                    ) {
                        Text(text = "UNO!", color = Color.Yellow, fontSize = 7.5.sp, fontWeight = FontWeight.Black)
                    }
                }
            }

            Column {
                Text(
                    text = player.name,
                    color = if (isCurrentTurn && !isFinished) com.example.ui.theme.ArenaPalette.TurnGlow else Color.White,
                    fontSize = if (isCompact) 10.sp else 11.5.sp,
                    fontWeight = if (isCurrentTurn) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (isFinished) {
                    Text(
                        text = player.finishRank?.let { placementLabel(it) } ?: "Done",
                        color = Color(0xFF66BB6A),
                        fontSize = if (isCompact) 8.5.sp else 9.5.sp,
                        fontWeight = FontWeight.Bold
                    )
                } else {
                    Text(
                        text = "${player.cardCount} cards",
                        color = if (player.cardCount <= 2) Color(0xFFFF8A65) else Color.White.copy(alpha = 0.7f),
                        fontSize = if (isCompact) 8.5.sp else 9.5.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Fanned face-down mini hand — count reflects the player's REAL card count
        // (capped visually so 10+ cards don't overflow the table), never a fake number.
        if (!isFinished) {
            Spacer(modifier = Modifier.height(4.dp))
            MiniHandFan(cardCount = player.cardCount, compact = isCompact)
        }
    }
}

private fun placementLabel(rank: Int): String = when (rank) {
    1 -> "1st 🥇"
    2 -> "2nd 🥈"
    3 -> "3rd 🥉"
    else -> "${rank}th"
}

/**
 * Small fanned row of face-down cards representing an opponent's real hand size,
 * capped visually at 7 overlapping cards (a 10th card wouldn't add legibility,
 * only the count label communicates the true number beyond that).
 */
@Composable
private fun MiniHandFan(cardCount: Int, compact: Boolean) {
    if (cardCount <= 0) return
    val shown = cardCount.coerceAtMost(7)
    val cardW = if (compact) 14.dp else 16.dp
    val cardH = if (compact) 20.dp else 23.dp
    Row(horizontalArrangement = Arrangement.spacedBy(-(cardW * 0.55f))) {
        repeat(shown) { i ->
            val angle = (i - (shown - 1) / 2f) * 6f
            Box(
                modifier = Modifier
                    .size(cardW, cardH)
                    .rotate(angle)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color(0xFF1A1A1A))
                    .border(0.75.dp, Color(0xFFB0281E), RoundedCornerShape(3.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "🂠", color = Color(0xFFE53935), fontSize = if (compact) 8.sp else 9.sp)
            }
        }
    }
}

/**
 * Calculates adaptive perimeter coordinates (xPct, yPct) for opponents around the table arena.
 * Guaranteed not to collide with center deck/discard or bottom player hand.
 */
private fun getPerimeterSlotPositions(count: Int): List<Pair<Float, Float>> {
    return when (count) {
        1 -> listOf(
            Pair(0.50f, 0.12f) // Top center facing local player
        )
        2 -> listOf(
            Pair(0.24f, 0.13f), // Top left
            Pair(0.76f, 0.13f)  // Top right
        )
        3 -> listOf(
            Pair(0.12f, 0.36f), // Left
            Pair(0.50f, 0.12f), // Top
            Pair(0.88f, 0.36f)  // Right
        )
        4 -> listOf(
            Pair(0.12f, 0.40f), // Mid-left
            Pair(0.28f, 0.12f), // Top-left
            Pair(0.72f, 0.12f), // Top-right
            Pair(0.88f, 0.40f)  // Mid-right
        )
        5 -> listOf(
            Pair(0.12f, 0.46f), // Lower-left
            Pair(0.16f, 0.22f), // Upper-left
            Pair(0.50f, 0.11f), // Top-center
            Pair(0.84f, 0.22f), // Upper-right
            Pair(0.88f, 0.46f)  // Lower-right
        )
        6 -> listOf(
            Pair(0.11f, 0.48f), // Lower-left
            Pair(0.13f, 0.25f), // Mid-left
            Pair(0.33f, 0.11f), // Top-left
            Pair(0.67f, 0.11f), // Top-right
            Pair(0.87f, 0.25f), // Mid-right
            Pair(0.89f, 0.48f)  // Lower-right
        )
        7 -> listOf(
            Pair(0.11f, 0.49f),
            Pair(0.12f, 0.28f),
            Pair(0.26f, 0.12f),
            Pair(0.50f, 0.10f),
            Pair(0.74f, 0.12f),
            Pair(0.88f, 0.28f),
            Pair(0.89f, 0.49f)
        )
        8 -> listOf(
            Pair(0.11f, 0.50f),
            Pair(0.12f, 0.32f),
            Pair(0.18f, 0.18f),
            Pair(0.38f, 0.10f),
            Pair(0.62f, 0.10f),
            Pair(0.82f, 0.18f),
            Pair(0.88f, 0.32f),
            Pair(0.89f, 0.50f)
        )
        9 -> listOf(
            Pair(0.11f, 0.51f),
            Pair(0.12f, 0.34f),
            Pair(0.16f, 0.19f),
            Pair(0.33f, 0.10f),
            Pair(0.50f, 0.09f),
            Pair(0.67f, 0.10f),
            Pair(0.84f, 0.19f),
            Pair(0.88f, 0.34f),
            Pair(0.89f, 0.51f)
        )
        else -> (0 until count).map { i ->
            val angle = Math.PI * (1.1 - 1.2 * i / (count - 1).coerceAtLeast(1))
            val x = (0.5 + 0.38 * Math.cos(angle)).toFloat().coerceIn(0.10f, 0.90f)
            val y = (0.32 - 0.20 * Math.sin(angle)).toFloat().coerceIn(0.08f, 0.52f)
            Pair(x, y)
        }
    }
}
