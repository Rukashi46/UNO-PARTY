package com.example.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue

@Composable
fun UnoCardView(
    card: UnoCard,
    modifier: Modifier = Modifier,
    width: Dp = 80.dp,
    height: Dp = 120.dp,
    isPlayable: Boolean = true,
    isSelected: Boolean = false,
    onClick: (() -> Unit)? = null
) {
    val elevation by animateDpAsState(
        targetValue = if (isSelected) 10.dp else if (isPlayable) 4.dp else 1.dp,
        label = "cardElevation"
    )
    val offsetY by animateDpAsState(
        targetValue = if (isSelected) (-12).dp else if (isPlayable) (-4).dp else 0.dp,
        label = "cardOffset"
    )
    val alpha by animateFloatAsState(
        targetValue = if (isPlayable) 1.0f else 0.65f,
        label = "cardAlpha"
    )

    val borderStroke = when {
        card.value == UnoValue.CUSTOM_WILD || card.value == UnoValue.SHUFFLE_HANDS -> BorderStroke(2.5.dp, Color(0xFFFFD54F))
        isSelected -> BorderStroke(2.5.dp, Color(0xFFFFD700))
        isPlayable -> BorderStroke(1.5.dp, Color.White)
        else -> BorderStroke(1.dp, Color(0x66FFFFFF))
    }

    Card(
        modifier = modifier
            .width(width)
            .height(height)
            .offset(y = offsetY)
            .alpha(alpha)
            .shadow(elevation, RoundedCornerShape(10.dp))
            .testTag("card_${card.color.name}_${card.value.name}")
            .then(
                if (onClick != null) {
                    Modifier.clickable(enabled = isPlayable, onClick = onClick)
                } else Modifier
            ),
        shape = RoundedCornerShape(10.dp),
        border = borderStroke,
        colors = CardDefaults.cardColors(
            containerColor = card.color.composeColor
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(4.dp)
        ) {
            // Inner glossy tilted oval
            CardOvalBadge(
                card = card,
                modifier = Modifier
                    .fillMaxSize(0.85f)
                    .align(Alignment.Center)
            )

            // Center Symbol
            CardCenterContent(
                card = card,
                modifier = Modifier.align(Alignment.Center)
            )

            // Top Left Index
            CardCornerIndex(
                symbol = card.value.symbol,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(2.dp)
            )

            // Bottom Right Index
            CardCornerIndex(
                symbol = card.value.symbol,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(2.dp)
                    .rotate(180f)
            )
        }
    }
}

@Composable
private fun CardOvalBadge(
    card: UnoCard,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .rotate(-25f)
            .clip(RoundedCornerShape(percent = 50))
            .background(Color.White)
            .padding(3.dp)
    ) {
        if (card.value.isWild) {
            // 4-Quadrant Wild circle
            FourColorQuadrant(modifier = Modifier.fillMaxSize())
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(percent = 50))
                    .background(card.color.composeColor)
            )
        }
    }
}

@Composable
fun FourColorQuadrant(modifier: Modifier = Modifier) {
    Box(modifier = modifier.clip(CircleShape)) {
        // Red top-left
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        listOf(Color(0xFFE53935), Color(0xFFB71C1C))
                    )
                )
        )
        // Diagonal quarters simulation with brush or stacked boxes
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.sweepGradient(
                        listOf(
                            Color(0xFFE53935), // Red
                            Color(0xFF1E88E5), // Blue
                            Color(0xFF43A047), // Green
                            Color(0xFFFDD835), // Yellow
                            Color(0xFFE53935)
                        )
                    )
                )
        )
    }
}

@Composable
private fun CardCenterContent(
    card: UnoCard,
    modifier: Modifier = Modifier
) {
    val symbol = card.value.symbol
    val textColor = when {
        card.value.isWild -> Color.White
        card.color == UnoColor.YELLOW -> Color(0xFF212121)
        else -> Color.White
    }

    val fontSize = when {
        symbol.length > 2 -> 18.sp
        symbol.length == 2 -> 24.sp
        else -> 32.sp
    }

    Text(
        text = symbol,
        color = textColor,
        fontSize = fontSize,
        fontWeight = FontWeight.Black,
        fontFamily = FontFamily.SansSerif,
        textAlign = TextAlign.Center,
        modifier = modifier
    )
}

@Composable
private fun CardCornerIndex(
    symbol: String,
    modifier: Modifier = Modifier
) {
    Text(
        text = symbol,
        color = Color.White,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier
    )
}

@Composable
fun UnoCardBackView(
    modifier: Modifier = Modifier,
    width: Dp = 80.dp,
    height: Dp = 120.dp,
    label: String = "UNO",
    onClick: (() -> Unit)? = null
) {
    Card(
        modifier = modifier
            .width(width)
            .height(height)
            .shadow(4.dp, RoundedCornerShape(10.dp))
            .testTag("card_back")
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else Modifier
            ),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.5.dp, Color(0xFFD32F2F)),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF121212)
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(4.dp),
            contentAlignment = Alignment.Center
        ) {
            // Tilted vibrant red oval
            Box(
                modifier = Modifier
                    .fillMaxSize(0.85f)
                    .rotate(-25f)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(Color(0xFFE53935))
                    .border(2.dp, Color(0xFFFFD54F), RoundedCornerShape(percent = 50)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    color = Color(0xFFFFEB3B),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.SansSerif,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}
