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

        // Central Table Felt (Oval Arena with active color glowing border)
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(
                    width = (arenaWidth.value * 0.76f).coerceIn(240f, 320f).dp,
                    height = (arenaHeight.value * 0.44f).coerceIn(190f, 250f).dp
                )
                .clip(RoundedCornerShape(80.dp))
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF1E293B).copy(alpha = 0.85f),
                            Color(0xFF0F172A).copy(alpha = 0.95f)
                        )
                    )
                )
                .border(
                    width = 3.dp,
                    brush = Brush.radialGradient(
                        listOf(activeColor.composeColor.copy(alpha = 0.9f), Color(0x33FFFFFF))
                    ),
                    shape = RoundedCornerShape(80.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            // Rotating turn direction ring inside felt
            val infiniteTransition = rememberInfiniteTransition(label = "turnDirectionSpin")
            val rotation by infiniteTransition.animateFloat(
                initialValue = 0f,
                targetValue = if (direction == TurnDirection.CLOCKWISE) 360f else -360f,
                animationSpec = infiniteRepeatable(
                    animation = tween(14000, easing = androidx.compose.animation.core.LinearEasing),
                    repeatMode = RepeatMode.Restart
                ),
                label = "rotation"
            )

            Icon(
                imageVector = Icons.Default.Cached,
                contentDescription = "Turn Direction",
                tint = activeColor.composeColor.copy(alpha = 0.25f),
                modifier = Modifier
                    .size(170.dp)
                    .rotate(rotation)
            )
        }

        // Center Deck & Discard Pile
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Draw Pile (facedown)
                Box(contentAlignment = Alignment.Center) {
                    UnoCardBackView(
                        modifier = Modifier
                            .offset(x = (-2).dp, y = (-2).dp)
                            .alpha(0.5f),
                        width = if (isVeryCrowded) 64.dp else 72.dp,
                        height = if (isVeryCrowded) 96.dp else 108.dp
                    )
                    UnoCardBackView(
                        width = if (isVeryCrowded) 64.dp else 72.dp,
                        height = if (isVeryCrowded) 96.dp else 108.dp,
                        onClick = onDrawClicked
                    )
                    Surface(
                        color = Color(0xEE1E293B),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, Color(0x55FFFFFF)),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = 6.dp)
                    ) {
                        Text(
                            text = "Deck: $drawPileCount",
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                        )
                    }
                }

                // Discard Pile (faceup)
                Box(contentAlignment = Alignment.Center) {
                    if (topCard != null) {
                        UnoCardView(
                            card = topCard,
                            width = if (isVeryCrowded) 70.dp else 78.dp,
                            height = if (isVeryCrowded) 105.dp else 117.dp,
                            isPlayable = true,
                            modifier = Modifier.rotate(2.5f)
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(
                                    width = if (isVeryCrowded) 70.dp else 78.dp,
                                    height = if (isVeryCrowded) 105.dp else 117.dp
                                )
                                .background(Color(0x22FFFFFF), RoundedCornerShape(10.dp))
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Active Color and Stack Info Chips
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = activeColor.composeColor,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Color.White),
                    shadowElevation = 3.dp
                ) {
                    Text(
                        text = "● ${activeColor.displayName}",
                        color = if (activeColor == UnoColor.YELLOW) Color.Black else Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }

                if (pendingDrawStack > 0) {
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

    val borderStroke = when {
        isSwapTarget -> BorderStroke(2.dp, Color(0xFFFF9800))
        isCurrentTurn && !isFinished -> BorderStroke(2.5.dp, Color(0xFFFFD54F))
        player.cardCount == 1 && !isFinished -> BorderStroke(2.dp, Color(0xFFE53935))
        else -> BorderStroke(1.dp, Color(0x44FFFFFF))
    }

    val cardBg = when {
        isFinished -> Color(0x991E293B)
        isCurrentTurn -> Color(0xF01E293B)
        else -> Color(0xEA0F172A)
    }

    val alpha = if (isFinished) 0.5f else 1f

    Card(
        modifier = modifier
            .size(width = badgeWidth, height = badgeHeight)
            .scale(if (isCurrentTurn && !isFinished) pulseScale else 1f)
            .alpha(alpha)
            .pointerInput(player.id, player.canBePenalizedUno) {
                detectTapGestures(
                    onDoubleTap = { onDoubleTap() },
                    onTap = { onTap() }
                )
            }
            .testTag("opponent_${player.id}"),
        shape = RoundedCornerShape(12.dp),
        border = borderStroke,
        colors = CardDefaults.cardColors(containerColor = cardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isCurrentTurn) 6.dp else 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 3.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Avatar & UNO / Placement Badge
            Box(contentAlignment = Alignment.Center) {
                // Circular Avatar
                Box(
                    modifier = Modifier
                        .size(if (isCompact) 26.dp else 32.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF334155), Color(0xFF1E293B))
                            )
                        )
                        .border(
                            width = if (isCurrentTurn && !isFinished) 2.dp else 1.dp,
                            color = if (isCurrentTurn && !isFinished) Color(0xFFFFD54F) else Color(0x44FFFFFF),
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = player.avatar,
                        fontSize = if (isCompact) 14.sp else 18.sp
                    )
                }

                // Prominent UNO badge when player has exactly 1 card
                if (player.cardCount == 1 && !isFinished) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 6.dp, y = (-5).dp)
                            .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                            .padding(horizontal = 3.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = "🔥UNO!",
                            color = Color.Yellow,
                            fontSize = 7.5.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }

                // Placement badge when finished in Play Until Last Player mode
                if (player.finishRank != null) {
                    val rankText = when (player.finishRank) {
                        1 -> "1st 🥇"
                        2 -> "2nd 🥈"
                        3 -> "3rd 🥉"
                        else -> "${player.finishRank}th"
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = 5.dp)
                            .background(Color(0xFF2E7D32), RoundedCornerShape(4.dp))
                            .padding(horizontal = 3.dp, vertical = 0.5.dp)
                    ) {
                        Text(
                            text = rankText,
                            color = Color.White,
                            fontSize = 7.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Player Short Name
            Text(
                text = player.name,
                color = if (isCurrentTurn && !isFinished) Color(0xFFFFD54F) else Color.White,
                fontSize = if (isCompact) 9.sp else 10.5.sp,
                fontWeight = if (isCurrentTurn) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )

            // Card Count Chip (Opponent card count is always clearly visible!)
            if (isFinished) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFF2E7D32)
                ) {
                    Text(
                        text = "🏁 DONE",
                        color = Color.White,
                        fontSize = if (isCompact) 7.5.sp else 8.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = when {
                        player.cardCount == 1 -> Color(0xFFD32F2F)
                        player.cardCount == 2 -> Color(0xFFE65100)
                        isCurrentTurn -> Color(0xFF1D4ED8)
                        else -> Color(0xFF334155)
                    },
                    border = BorderStroke(
                        width = 1.dp,
                        color = when {
                            player.cardCount <= 2 || isCurrentTurn -> Color(0xFFFFD54F)
                            else -> Color(0x66FFFFFF)
                        }
                    ),
                    modifier = Modifier.testTag("card_count_${player.id}")
                ) {
                    Text(
                        text = "🎴 ${player.cardCount} ${if (player.cardCount == 1) "card" else "cards"}",
                        color = if (player.cardCount == 1) Color(0xFFFFD54F) else Color.White,
                        fontSize = if (isCompact) 8.sp else 9.5.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
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
