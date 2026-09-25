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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
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
 * Premium 3D Table Arena Card Layout.
 * Opponents are distributed in an adaptive perimeter arc around the 3D felt table with mini-card fans,
 * central Draw and Discard piles with 3D stacked chips, rotating turn direction ring, and active player glow.
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
    val currentPlayer = players.getOrNull(currentPlayerIndex)
    val isHumanTurn = currentPlayerIndex == humanPlayerIndex

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .testTag("card_table_arena")
    ) {
        val arenaWidth = maxWidth
        val arenaHeight = maxHeight

        // 3D Red-Gold Glowing Table Felt
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.92f)
                .height((arenaHeight.value * 0.52f).coerceIn(210f, 290f).dp)
                .clip(RoundedCornerShape(120.dp))
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFFE65100).copy(alpha = 0.55f),
                            Color(0xFFB71C1C).copy(alpha = 0.75f),
                            Color(0xFF3E0000).copy(alpha = 0.95f),
                            Color(0xFF0F0505)
                        )
                    )
                )
                .border(
                    width = 3.dp,
                    brush = Brush.sweepGradient(
                        listOf(
                            Color(0xFFFFD54F),
                            activeColor.composeColor,
                            Color(0xFFFF9800),
                            Color(0xFFFFD54F)
                        )
                    ),
                    shape = RoundedCornerShape(120.dp)
                )
                .shadow(16.dp, RoundedCornerShape(120.dp)),
            contentAlignment = Alignment.Center
        ) {
            // Embossed "UNO" logo watermark in center
            Text(
                text = "UNO",
                color = Color(0x18FFFFFF),
                fontSize = 110.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.SansSerif,
                letterSpacing = 4.sp,
                modifier = Modifier.rotate(-8f)
            )

            // Rotating Turn Direction Ring
            val infiniteTransition = rememberInfiniteTransition(label = "turnDirectionSpin")
            val rotation by infiniteTransition.animateFloat(
                initialValue = 0f,
                targetValue = if (direction == TurnDirection.CLOCKWISE) 360f else -360f,
                animationSpec = infiniteRepeatable(
                    animation = tween(12000, easing = androidx.compose.animation.core.LinearEasing),
                    repeatMode = RepeatMode.Restart
                ),
                label = "rotation"
            )

            Icon(
                imageVector = Icons.Default.Cached,
                contentDescription = "Direction",
                tint = activeColor.composeColor.copy(alpha = 0.22f),
                modifier = Modifier
                    .size(220.dp)
                    .rotate(rotation)
            )
        }

        // Center Deck & Discard Pile + Turn Indicator
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // DRAW PILE (Facedown Stack with 3D Depth)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(contentAlignment = Alignment.Center) {
                        // Depth layers
                        UnoCardBackView(
                            modifier = Modifier
                                .offset(x = (-3).dp, y = (-3).dp)
                                .alpha(0.45f),
                            width = if (isVeryCrowded) 64.dp else 72.dp,
                            height = if (isVeryCrowded) 96.dp else 108.dp
                        )
                        UnoCardBackView(
                            modifier = Modifier
                                .offset(x = (-1.5).dp, y = (-1.5).dp)
                                .alpha(0.7f),
                            width = if (isVeryCrowded) 64.dp else 72.dp,
                            height = if (isVeryCrowded) 96.dp else 108.dp
                        )
                        UnoCardBackView(
                            width = if (isVeryCrowded) 64.dp else 72.dp,
                            height = if (isVeryCrowded) 96.dp else 108.dp,
                            onClick = onDrawClicked
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Surface(
                        color = Color(0xDD0F172A),
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, Color(0x66FFFFFF))
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "DRAW",
                                color = Color.White,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = "$drawPileCount cards",
                                color = Color(0xFF94A3B8),
                                fontSize = 8.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // DISCARD PILE (Faceup Card with 3D Depth & Active Color Glow)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(contentAlignment = Alignment.Center) {
                        // Underneath discard shadow/stack
                        if (topCard != null) {
                            Box(
                                modifier = Modifier
                                    .size(
                                        width = if (isVeryCrowded) 68.dp else 76.dp,
                                        height = if (isVeryCrowded) 102.dp else 114.dp
                                    )
                                    .offset(x = 2.dp, y = 2.dp)
                                    .background(Color(0x44000000), RoundedCornerShape(10.dp))
                            )
                            UnoCardView(
                                card = topCard,
                                width = if (isVeryCrowded) 68.dp else 76.dp,
                                height = if (isVeryCrowded) 102.dp else 114.dp,
                                isPlayable = true,
                                modifier = Modifier.rotate(1.5f)
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

                    Surface(
                        color = Color(0xDD0F172A),
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, activeColor.composeColor)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "DISCARD",
                                color = Color.White,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = "● ${activeColor.displayName}",
                                color = activeColor.composeColor,
                                fontSize = 8.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Central Active Turn Glow Banner
            Surface(
                color = if (isHumanTurn) Color(0xFFFFD54F) else Color(0xFF1E293B).copy(alpha = 0.9f),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, if (isHumanTurn) Color(0xFFFF8F00) else Color(0x44FFFFFF)),
                shadowElevation = 4.dp
            ) {
                Text(
                    text = if (isHumanTurn) "👉 YOUR TURN" else "⏳ ${currentPlayer?.name?.uppercase() ?: "WAITING"}'S TURN",
                    color = if (isHumanTurn) Color(0xFF0F172A) else Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.6.sp,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)
                )
            }

            // Draw stack penalty warning if active
            if (pendingDrawStack > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Surface(
                    color = Color(0xFFD32F2F),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, Color(0xFFFFD54F))
                ) {
                    Text(
                        text = "🔥 +$pendingDrawStack STACK ACTIVE",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp)
                    )
                }
            }
        }

        // Perimeter Opponents
        val slotPositions = getPerimeterSlotPositions(opponentCount)
        val badgeWidth = if (isVeryCrowded) 78.dp else 90.dp
        val badgeHeight = if (isVeryCrowded) 84.dp else 96.dp

        opponents.forEachIndexed { i, (realIndex, opponent) ->
            val slot = slotPositions.getOrElse(i) { Pair(0.5f, 0.12f) }
            val xOffset = arenaWidth * slot.first - (badgeWidth / 2)
            val yOffset = arenaHeight * slot.second - (badgeHeight / 2)

            OpponentTablePlayerView(
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
 * Opponent Table Player View:
 * Features a circular avatar with active turn glow, mini card-back fan, card count chip, and placement badge.
 */
@Composable
private fun OpponentTablePlayerView(
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
        targetValue = 1.08f,
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
        else -> BorderStroke(1.dp, Color(0x33FFFFFF))
    }

    val alpha = if (isFinished) 0.5f else 1f

    Column(
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
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Mini Card-Back Fan above/around player avatar
        if (!isFinished && player.cardCount > 0) {
            MiniOpponentCardFan(
                cardCount = player.cardCount,
                modifier = Modifier.padding(bottom = 2.dp)
            )
        }

        // Circular Avatar Badge
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(if (isCompact) 32.dp else 38.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF334155), Color(0xFF1E293B))
                        )
                    )
                    .border(
                        width = if (isCurrentTurn && !isFinished) 2.5.dp else 1.dp,
                        color = if (isCurrentTurn && !isFinished) Color(0xFFFFD54F) else Color(0x44FFFFFF),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = player.avatar,
                    fontSize = if (isCompact) 18.sp else 22.sp
                )
            }

            // Crown for Host
            if (player.isHost) {
                Text(
                    text = "👑",
                    fontSize = 11.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .offset(x = (-4).dp, y = (-8).dp)
                )
            }

            // UNO Badge
            if (player.cardCount == 1 && !isFinished) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 6.dp, y = (-6).dp)
                        .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                        .padding(horizontal = 3.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = "UNO!",
                        color = Color.Yellow,
                        fontSize = 7.5.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // Placement Rank
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
                        .offset(y = 6.dp)
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

        Spacer(modifier = Modifier.height(2.dp))

        // Opponent Name
        Text(
            text = player.name,
            color = if (isCurrentTurn && !isFinished) Color(0xFFFFD54F) else Color.White,
            fontSize = if (isCompact) 10.sp else 11.sp,
            fontWeight = if (isCurrentTurn) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )

        // Card count chip
        Text(
            text = if (isFinished) "Finished" else "${player.cardCount} cards",
            color = if (isFinished) Color(0xFF81C784) else Color(0xFF94A3B8),
            fontSize = if (isCompact) 8.5.sp else 9.5.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Renders a miniature card-back fan representing the cards held by an opponent.
 */
@Composable
private fun MiniOpponentCardFan(
    cardCount: Int,
    modifier: Modifier = Modifier
) {
    val displayCount = cardCount.coerceIn(1, 5)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy((-10).dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        for (i in 0 until displayCount) {
            val angle = -12f + (i * 6f)
            Box(
                modifier = Modifier
                    .size(width = 14.dp, height = 20.dp)
                    .rotate(angle)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFF1E293B))
                    .border(0.8.dp, Color(0xFFE53935), RoundedCornerShape(2.dp)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 9.dp, height = 13.dp)
                        .rotate(-20f)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(Color(0xFFE53935))
                )
            }
        }
    }
}

/**
 * Calculates adaptive perimeter coordinates (xPct, yPct) for opponents around the table arena.
 */
private fun getPerimeterSlotPositions(count: Int): List<Pair<Float, Float>> {
    return when (count) {
        1 -> listOf(Pair(0.50f, 0.12f))
        2 -> listOf(Pair(0.24f, 0.13f), Pair(0.76f, 0.13f))
        3 -> listOf(Pair(0.12f, 0.36f), Pair(0.50f, 0.12f), Pair(0.88f, 0.36f))
        4 -> listOf(Pair(0.12f, 0.40f), Pair(0.28f, 0.12f), Pair(0.72f, 0.12f), Pair(0.88f, 0.40f))
        5 -> listOf(Pair(0.12f, 0.46f), Pair(0.16f, 0.22f), Pair(0.50f, 0.11f), Pair(0.84f, 0.22f), Pair(0.88f, 0.46f))
        6 -> listOf(Pair(0.11f, 0.48f), Pair(0.13f, 0.25f), Pair(0.33f, 0.11f), Pair(0.67f, 0.11f), Pair(0.87f, 0.25f), Pair(0.89f, 0.48f))
        7 -> listOf(Pair(0.11f, 0.49f), Pair(0.12f, 0.28f), Pair(0.26f, 0.12f), Pair(0.50f, 0.10f), Pair(0.74f, 0.12f), Pair(0.88f, 0.28f), Pair(0.89f, 0.49f))
        8 -> listOf(Pair(0.11f, 0.50f), Pair(0.12f, 0.32f), Pair(0.18f, 0.18f), Pair(0.38f, 0.10f), Pair(0.62f, 0.10f), Pair(0.82f, 0.18f), Pair(0.88f, 0.32f), Pair(0.89f, 0.50f))
        9 -> listOf(Pair(0.11f, 0.51f), Pair(0.12f, 0.34f), Pair(0.16f, 0.19f), Pair(0.33f, 0.10f), Pair(0.50f, 0.09f), Pair(0.67f, 0.10f), Pair(0.84f, 0.19f), Pair(0.88f, 0.34f), Pair(0.89f, 0.51f))
        else -> (0 until count).map { i ->
            val angle = Math.PI * (1.1 - 1.2 * i / (count - 1).coerceAtLeast(1))
            val x = (0.5 + 0.38 * Math.cos(angle)).toFloat().coerceIn(0.10f, 0.90f)
            val y = (0.32 - 0.20 * Math.sin(angle)).toFloat().coerceIn(0.08f, 0.52f)
            Pair(x, y)
        }
    }
}
