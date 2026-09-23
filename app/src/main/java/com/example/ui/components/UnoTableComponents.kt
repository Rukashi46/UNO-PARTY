package com.example.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cached
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Player
import com.example.model.TurnDirection
import com.example.model.UnoCard
import com.example.model.UnoColor

@Composable
fun OpponentsRow(
    players: List<Player>,
    currentPlayerIndex: Int,
    humanIndex: Int,
    onPlayerClicked: (Int) -> Unit,
    modifier: Modifier = Modifier,
    isSwapSelection: Boolean = false
) {
    LazyRow(
        modifier = modifier
            .fillMaxWidth()
            .testTag("opponents_row"),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        itemsIndexed(players) { index, player ->
            // In Solo mode, skip human player in opponents row (since they are shown in bottom hand)
            if (index != humanIndex) {
                OpponentBadge(
                    player = player,
                    isCurrentTurn = index == currentPlayerIndex,
                    isSwapTarget = isSwapSelection,
                    onClick = { onPlayerClicked(index) }
                )
            }
        }
    }
}

@Composable
fun OpponentBadge(
    player: Player,
    isCurrentTurn: Boolean,
    isSwapTarget: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "turnPulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    val borderStroke = when {
        isSwapTarget -> BorderStroke(2.5.dp, Color(0xFFFF9800))
        isCurrentTurn -> BorderStroke(2.5.dp, Color(0xFFFFD54F))
        player.canBePenalizedUno -> BorderStroke(2.dp, Color(0xFFE53935))
        else -> BorderStroke(1.dp, Color(0x33FFFFFF))
    }

    val cardBg = if (isCurrentTurn) Color(0xFF1E293B) else Color(0xCC0F172A)

    Card(
        modifier = modifier
            .scale(if (isCurrentTurn) pulseScale else 1f)
            .clickable(onClick = onClick)
            .testTag("opponent_${player.id}"),
        shape = RoundedCornerShape(14.dp),
        border = borderStroke,
        colors = CardDefaults.cardColors(containerColor = cardBg)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Avatar with turn indicator ring
            Box(contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF334155), Color(0xFF1E293B))
                            )
                        )
                        .border(
                            width = if (isCurrentTurn) 2.dp else 1.dp,
                            color = if (isCurrentTurn) Color(0xFFFFD54F) else Color.Transparent,
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = player.avatar, fontSize = 22.sp)
                }

                // UNO speech bubble badge
                if (player.hasCalledUno) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = "UNO!",
                            color = Color.White,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = player.name,
                color = if (isCurrentTurn) Color(0xFFFFD54F) else Color.White,
                fontSize = 12.sp,
                fontWeight = if (isCurrentTurn) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(2.dp))

            // Card count chip
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (player.cardCount <= 2) Color(0xFFE53935) else Color(0xFF334155)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "🃏 ${player.cardCount}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Connection status and host badge
            if (player.isHost) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFF2E7D32),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = "HOST",
                        color = Color.White,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }

            if (player.isReconnecting) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFFF57C00),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = "RECONNECTING",
                        color = Color.White,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            } else if (!player.isConnected) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFF757575),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = "OFFLINE",
                        color = Color.White,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            } else if (player.pingMs > 0) {
                Text(
                    text = "${player.pingMs}ms",
                    color = Color(0xFF81C784),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 1.dp)
                )
            }

            if (isSwapTarget) {
                Text(
                    text = "Tap to Swap",
                    color = Color(0xFFFF9800),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
    }
}

@Composable
fun TableCenterView(
    topCard: UnoCard?,
    drawPileCount: Int,
    activeColor: UnoColor,
    direction: TurnDirection,
    pendingDrawStack: Int,
    onDrawClicked: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "directionSpin")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = if (direction == TurnDirection.CLOCKWISE) 360f else -360f,
        animationSpec = infiniteRepeatable(
            animation = tween(12000, easing = androidx.compose.animation.core.LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        // Felt circle background with active color ring glow
        Box(
            modifier = Modifier
                .size(240.dp)
                .clip(CircleShape)
                .background(Color(0xFF0F172A).copy(alpha = 0.6f))
                .border(
                    width = 4.dp,
                    brush = Brush.radialGradient(
                        listOf(activeColor.composeColor.copy(alpha = 0.8f), Color.Transparent)
                    ),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            // Rotating turn direction ring
            Icon(
                imageVector = Icons.Default.Cached,
                contentDescription = "Turn Direction",
                tint = activeColor.composeColor.copy(alpha = 0.35f),
                modifier = Modifier
                    .size(210.dp)
                    .rotate(rotation)
            )
        }

        // Draw Pile & Discard Pile side by side
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Draw Pile
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(contentAlignment = Alignment.Center) {
                    // Slight stacked effect
                    UnoCardBackView(
                        modifier = Modifier
                            .offset(x = (-3).dp, y = (-3).dp)
                            .alpha(0.6f),
                        width = 75.dp,
                        height = 112.dp
                    )
                    UnoCardBackView(
                        width = 75.dp,
                        height = 112.dp,
                        onClick = onDrawClicked
                    )
                    // Card count badge
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = 8.dp)
                            .background(Color(0xEE1E293B), RoundedCornerShape(10.dp))
                            .border(1.dp, Color(0x66FFFFFF), RoundedCornerShape(10.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Deck: $drawPileCount",
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Discard Pile
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(contentAlignment = Alignment.Center) {
                    if (topCard != null) {
                        UnoCardView(
                            card = topCard,
                            width = 82.dp,
                            height = 122.dp,
                            isPlayable = true,
                            modifier = Modifier.rotate(3f)
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(width = 82.dp, height = 122.dp)
                                .background(Color(0x33FFFFFF), RoundedCornerShape(10.dp))
                        )
                    }
                }
            }
        }

        // Floating badges: Active Color & Stack alert
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Stack Alert if any
            if (pendingDrawStack > 0) {
                Surface(
                    color = Color(0xFFD32F2F),
                    shape = RoundedCornerShape(12.dp),
                    shadowElevation = 6.dp,
                    modifier = Modifier.padding(bottom = 4.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "🔥 DRAW STACK: +$pendingDrawStack CARDS!",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            }

            // Active Color indicator chip
            Surface(
                color = activeColor.composeColor,
                shape = RoundedCornerShape(20.dp),
                border = BorderStroke(1.5.dp, Color.White),
                shadowElevation = 4.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Active Color: ${activeColor.displayName}",
                        color = if (activeColor == UnoColor.YELLOW) Color.Black else Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
fun ActionControlsBar(
    canDraw: Boolean,
    canPass: Boolean,
    canCallUno: Boolean,
    catchUnoTarget: Player?,
    onDraw: () -> Unit,
    onPass: () -> Unit,
    onCallUno: () -> Unit,
    onCatchUno: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Draw Button
        Button(
            onClick = onDraw,
            enabled = canDraw,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2)),
            modifier = Modifier.testTag("draw_button")
        ) {
            Text("Draw Card", fontWeight = FontWeight.Bold)
        }

        // Pass / End Turn Button
        if (canPass) {
            Button(
                onClick = onPass,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF455A64)),
                modifier = Modifier.testTag("pass_button")
            ) {
                Text("End Turn", fontWeight = FontWeight.Bold)
            }
        }

        // Shout UNO Button
        Button(
            onClick = onCallUno,
            enabled = canCallUno,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFE53935),
                disabledContainerColor = Color(0x33E53935)
            ),
            modifier = Modifier
                .height(44.dp)
                .testTag("call_uno_button")
        ) {
            Text(
                text = "🔥 UNO!",
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.sp
            )
        }
    }
}

@Composable
fun WildColorPickerDialog(
    onColorSelected: (UnoColor) -> Unit
) {
    AlertDialog(
        onDismissRequest = {},
        title = {
            Text(
                text = "Choose Active Color",
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    ColorChoiceButton(
                        color = UnoColor.RED,
                        modifier = Modifier.weight(1f),
                        onClick = { onColorSelected(UnoColor.RED) }
                    )
                    ColorChoiceButton(
                        color = UnoColor.BLUE,
                        modifier = Modifier.weight(1f),
                        onClick = { onColorSelected(UnoColor.BLUE) }
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    ColorChoiceButton(
                        color = UnoColor.GREEN,
                        modifier = Modifier.weight(1f),
                        onClick = { onColorSelected(UnoColor.GREEN) }
                    )
                    ColorChoiceButton(
                        color = UnoColor.YELLOW,
                        modifier = Modifier.weight(1f),
                        onClick = { onColorSelected(UnoColor.YELLOW) }
                    )
                }
            }
        },
        confirmButton = {}
    )
}

@Composable
fun CustomWildEffectDialog(
    onEffectSelected: (com.example.model.CustomWildEffect) -> Unit
) {
    AlertDialog(
        onDismissRequest = {}, // Modal requires choosing one of the two effects
        containerColor = Color(0xFF0F172A),
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 10.dp,
        title = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = Color(0xFFFFD54F).copy(alpha = 0.15f),
                    border = BorderStroke(1.5.dp, Color(0xFFFFD54F)),
                    modifier = Modifier.padding(bottom = 6.dp)
                ) {
                    Text(
                        text = "⚡ CUSTOM WILD ⚡",
                        color = Color(0xFFFFD54F),
                        fontWeight = FontWeight.Black,
                        fontSize = 17.sp,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                    )
                }
                Text(
                    text = "CHOOSE YOUR EFFECT",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    letterSpacing = 0.8.sp
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Card 1: 🔀 SHUFFLE HANDS
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onEffectSelected(com.example.model.CustomWildEffect.SHUFFLE_HANDS) }
                        .testTag("custom_wild_shuffle_hands"),
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1E293B),
                    border = BorderStroke(2.dp, Color(0xFF818CF8)),
                    shadowElevation = 6.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "🔀",
                            fontSize = 30.sp,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "SHUFFLE HANDS",
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 15.sp
                            )
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = "Shuffle all players' cards while preserving individual card counts.",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                // Card 2: ➕ EVERYONE +4
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onEffectSelected(com.example.model.CustomWildEffect.EVERYONE_PLUS_FOUR) }
                        .testTag("custom_wild_everyone_plus_four"),
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1E293B),
                    border = BorderStroke(2.dp, Color(0xFFF43F5E)),
                    shadowElevation = 6.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "➕",
                            fontSize = 30.sp,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "EVERYONE +4",
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 15.sp
                            )
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = "Every other player gets 4 cards. (Next player absorbs active draw stack!)",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {}
    )
}

@Composable
private fun ColorChoiceButton(
    color: UnoColor,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = color.composeColor),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier
            .height(60.dp)
            .testTag("color_choice_${color.name}")
    ) {
        Text(
            text = color.displayName,
            color = if (color == UnoColor.YELLOW) Color.Black else Color.White,
            fontWeight = FontWeight.Black,
            fontSize = 16.sp
        )
    }
}
