package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import com.example.model.GameEndingMode
import com.example.ui.components.CardTableArenaView
import com.example.ui.components.FloatingDrawnPlayableCard
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.engine.UnoGameState
import com.example.model.CustomWildEffect
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.Player
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.ui.components.ActionControlsBar
import com.example.ui.components.CustomWildEffectDialog
import com.example.ui.components.OpponentsRow
import com.example.ui.components.TableCenterView
import com.example.ui.components.UnoCardView
import com.example.ui.components.WildColorPickerDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GameScreen(
    gameState: UnoGameState,
    localPlayerId: String? = null,
    onPlayCard: (UnoCard) -> Unit,
    onDrawCard: () -> Unit,
    onPassTurn: () -> Unit,
    onCallUno: () -> Unit,
    onCatchUno: (Int) -> Unit,
    onJumpIn: (Int, UnoCard) -> Unit,
    onSelectWildColor: (UnoColor) -> Unit,
    onSelectCustomWildEffect: (CustomWildEffect) -> Unit,
    onSelectSevenSwapTarget: (Int) -> Unit,
    onTogglePassAndPlayReveal: () -> Unit,
    onNextRound: () -> Unit,
    onQuit: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showLogsSheet by remember { mutableStateOf(false) }
    var showRulesModal by remember { mutableStateOf(false) }
    var showQuitConfirmation by remember { mutableStateOf(false) }

    val humanIndex = when (gameState.mode) {
        GameMode.ONLINE_ROOM, GameMode.WLAN_MULTIPLAYER -> {
            if (localPlayerId != null) {
                gameState.players.indexOfFirst { it.id == localPlayerId }.takeIf { it >= 0 } ?: 0
            } else 0
        }
        GameMode.SOLO_BOTS -> 0
        GameMode.PASS_AND_PLAY -> gameState.currentPlayerIndex
        GameMode.ALL_BOTS -> -1
    }

    val activePlayer = gameState.currentPlayer
    val isMyTurn = when (gameState.mode) {
        GameMode.ONLINE_ROOM, GameMode.WLAN_MULTIPLAYER -> {
            activePlayer != null && (localPlayerId == null || activePlayer.id == localPlayerId)
        }
        GameMode.SOLO_BOTS -> activePlayer?.isHuman == true
        GameMode.PASS_AND_PLAY -> true
        GameMode.ALL_BOTS -> true
    }
    val humanPlayer = gameState.players.getOrNull(if (humanIndex >= 0) humanIndex else 0)

    val topCard = gameState.topDiscardCard
    val catchTarget = gameState.players.firstOrNull { it.canBePenalizedUno && it.cardCount == 1 && it.id != activePlayer?.id }

    // Check jump-in eligibility for human
    val jumpInCard = remember(gameState.discardPile, humanPlayer?.hand) {
        if (gameState.rules.jumpInRule && !isMyTurn && topCard != null && humanPlayer != null) {
            humanPlayer.hand.firstOrNull { it.isExactMatch(topCard) }
        } else null
    }

    val handScrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Round ${gameState.roundNumber}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            if (gameState.mode == GameMode.ONLINE_ROOM) {
                                Surface(
                                    color = Color(0xFF1B5E20),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text(
                                        text = "🟢 ${gameState.roomCode ?: "ONLINE"}",
                                        color = Color(0xFFA5D6A7),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                            }
                            Surface(
                                color = Color(0xFFE53935),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(
                                    text = "${gameState.players.size} Players",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Text(
                            text = if (isMyTurn) "👉 Your Turn!" else "⏳ ${activePlayer?.name}'s Turn",
                            color = if (isMyTurn) Color(0xFFFFD54F) else Color(0xFF94A3B8),
                            fontSize = 12.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { showQuitConfirmation = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Leave Match",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    // Game log button
                    IconButton(onClick = { showLogsSheet = true }) {
                        Icon(
                            imageVector = Icons.Default.FormatListBulleted,
                            contentDescription = "Game Feed",
                            tint = Color(0xFF64B5F6)
                        )
                    }
                    // Rules inspector button
                    IconButton(onClick = { showRulesModal = true }) {
                        Icon(
                            imageVector = Icons.Default.MenuBook,
                            contentDescription = "Rules",
                            tint = Color(0xFFFFD54F)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A),
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color(0xFF0F172A),
                            Color(0xFF1E293B),
                            Color(0xFF0B132B)
                        )
                    )
                )
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Persistent Live Players Card Tracker Bar (Shows every player's card count at a glance!)
                PlayersCardTrackerBar(
                    players = gameState.players,
                    currentPlayerIndex = gameState.currentPlayerIndex,
                    humanIndex = humanIndex,
                    onPlayerTap = { clickedIdx ->
                        if (gameState.gamePhase == GamePhase.HAND_SWAP_SELECTION) {
                            onSelectSevenSwapTarget(clickedIdx)
                        } else if (clickedIdx != humanIndex) {
                            onCatchUno(clickedIdx)
                        }
                    }
                )

                // Recent ticker alert positioned cleanly below tracker bar (NOT covering opponents on the table)
                gameState.logs.lastOrNull()?.let { lastLog ->
                    Surface(
                        color = if (lastLog.isAlert) Color(0xFFE53935).copy(alpha = 0.92f) else Color(0xDD1E293B),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, Color(0x33FFFFFF)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = lastLog.text,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = if (lastLog.isAlert) FontWeight.Bold else FontWeight.Normal,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                // Arena Card Table Layout (Opponents dynamically distributed around central deck & discard)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    CardTableArenaView(
                        players = gameState.players,
                        currentPlayerIndex = gameState.currentPlayerIndex,
                        humanPlayerIndex = if (humanIndex >= 0) humanIndex else 0,
                        topCard = gameState.topDiscardCard,
                        drawPileCount = gameState.drawPile.size,
                        activeColor = gameState.activeColor,
                        direction = gameState.direction,
                        pendingDrawStack = gameState.pendingDrawStack,
                        onDrawClicked = {
                            if (isMyTurn && gameState.gamePhase == GamePhase.PLAYING) {
                                onDrawCard()
                            }
                        },
                        onPlayerTap = { clickedIdx ->
                            if (gameState.gamePhase == GamePhase.HAND_SWAP_SELECTION) {
                                onSelectSevenSwapTarget(clickedIdx)
                            }
                        },
                        onDoubleTapCatchUno = { targetIdx ->
                            onCatchUno(targetIdx)
                        },
                        isSwapSelection = gameState.gamePhase == GamePhase.HAND_SWAP_SELECTION,
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Jump-In Floating Prompt Banner if human can jump in
                AnimatedVisibility(
                    visible = jumpInCard != null,
                    enter = fadeIn() + slideInVertically(),
                    exit = fadeOut() + slideOutVertically()
                ) {
                    jumpInCard?.let { card ->
                        Surface(
                            color = Color(0xFFFF9800),
                            shape = RoundedCornerShape(20.dp),
                            shadowElevation = 8.dp,
                            modifier = Modifier
                                .align(Alignment.CenterHorizontally)
                                .clickable {
                                    if (humanIndex >= 0) onJumpIn(humanIndex, card)
                                }
                                .padding(horizontal = 16.dp, vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.ElectricBolt, contentDescription = null, tint = Color.White)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "⚡ JUMP-IN! Tap to play matching ${card.color.displayName} ${card.value.symbol}!",
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                }

                // Bottom Hand Area
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A).copy(alpha = 0.9f))
                        .padding(bottom = 8.dp)
                ) {
                    // Action controls bar
                    ActionControlsBar(
                        canDraw = isMyTurn && gameState.gamePhase == GamePhase.PLAYING && !gameState.drawnThisTurn,
                        canPass = isMyTurn && gameState.gamePhase == GamePhase.PLAYING && gameState.drawnThisTurn,
                        canCallUno = isMyTurn && (humanPlayer?.hand?.size ?: 0) <= 2,
                        catchUnoTarget = catchTarget,
                        onDraw = onDrawCard,
                        onPass = onPassTurn,
                        onCallUno = onCallUno,
                        onCatchUno = { targetIdx -> onCatchUno(targetIdx) }
                    )

                    // If human drew a playable card this turn, display prominent FloatingDrawnPlayableCard!
                    if (isMyTurn && gameState.drawnThisTurn && gameState.cardDrawnThisTurn != null) {
                        FloatingDrawnPlayableCard(
                            card = gameState.cardDrawnThisTurn,
                            onPlay = { onPlayCard(gameState.cardDrawnThisTurn) },
                            onEndTurn = onPassTurn
                        )
                    }

                    // If human drew an UNPLAYABLE card, show clear notice before turn automatically ends
                    AnimatedVisibility(
                        visible = isMyTurn && !gameState.drawnThisTurn && gameState.unplayableDrawnNotice != null,
                        enter = fadeIn() + slideInVertically(),
                        exit = fadeOut() + slideOutVertically()
                    ) {
                        Surface(
                            color = Color(0xFFC62828),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFFFF8A80)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Info, contentDescription = null, tint = Color.White)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "🎴 ${gameState.unplayableDrawnNotice} Added to hand. Ending turn...",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }

                    // Hand Cards View
                    if (gameState.mode == GameMode.PASS_AND_PLAY && !gameState.passAndPlayHandVisible) {
                        // Pass & Play Hidden Hand Privacy Barrier
                        PassAndPlayShield(
                            playerName = activePlayer?.name ?: "Player",
                            onReveal = onTogglePassAndPlayReveal
                        )
                    } else {
                        // Display Current Player Hand - DO NOT show the playable drawn card in the normal hand row while deciding!
                        val rawHand = if (gameState.mode == GameMode.ALL_BOTS) {
                            activePlayer?.hand ?: emptyList()
                        } else {
                            humanPlayer?.hand ?: emptyList()
                        }
                        val playerHand = if (isMyTurn && gameState.drawnThisTurn && gameState.cardDrawnThisTurn != null) {
                            rawHand.filter { it.id != gameState.cardDrawnThisTurn.id }
                        } else {
                            rawHand
                        }

                        Column(modifier = Modifier.fillMaxWidth()) {
                            // Player Info Pill
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = humanPlayer?.avatar ?: "🦁",
                                        fontSize = 18.sp
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = humanPlayer?.name ?: "You",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = when {
                                            playerHand.size == 1 -> Color(0xFFD32F2F)
                                            playerHand.size == 2 -> Color(0xFFE65100)
                                            else -> Color(0xFF2563EB)
                                        },
                                        border = BorderStroke(1.dp, if (playerHand.size <= 2) Color(0xFFFFD54F) else Color(0x66FFFFFF))
                                    ) {
                                        Text(
                                            text = "🎴 ${playerHand.size} ${if (playerHand.size == 1) "Card (UNO!)" else "Cards"}",
                                            color = if (playerHand.size == 1) Color(0xFFFFD54F) else Color.White,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 11.5.sp,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                if (gameState.mode == GameMode.PASS_AND_PLAY) {
                                    TextButton(onClick = onTogglePassAndPlayReveal) {
                                        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Hide Hand", fontSize = 11.sp)
                                    }
                                }
                            }

                            // Cards Scrollable Row
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(handScrollState)
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                playerHand.forEach { card ->
                                    val isPlayable = topCard != null && isMyTurn &&
                                            gameState.gamePhase == GamePhase.PLAYING &&
                                            card.canPlayOn(
                                                topCard = topCard,
                                                activeColor = gameState.activeColor,
                                                pendingDrawStack = gameState.pendingDrawStack,
                                                rules = gameState.rules
                                            )

                                    UnoCardView(
                                        card = card,
                                        isPlayable = isPlayable,
                                        isSelected = (isMyTurn && gameState.drawnThisTurn && card == gameState.cardDrawnThisTurn),
                                        onClick = {
                                            if (isPlayable) onPlayCard(card)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Modal: Wild Color Picker
    if (gameState.gamePhase == GamePhase.COLOR_SELECTION) {
        WildColorPickerDialog(
            onColorSelected = { color -> onSelectWildColor(color) }
        )
    }

    // Modal: Custom Wild Effect Picker
    if (gameState.gamePhase == GamePhase.CUSTOM_WILD_EFFECT_SELECTION) {
        CustomWildEffectDialog(
            onEffectSelected = { effect -> onSelectCustomWildEffect(effect) }
        )
    }

    // Modal: 7-Rule Hand Swap Picker
    if (gameState.gamePhase == GamePhase.HAND_SWAP_SELECTION) {
        AlertDialog(
            onDismissRequest = {},
            title = {
                Text("🤝 7-Rule Swap: Choose Opponent", fontWeight = FontWeight.Bold)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Select a player to swap your entire hand with:")
                    gameState.players.forEachIndexed { index, opponent ->
                        if (index != gameState.currentPlayerIndex) {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectSevenSwapTarget(index) },
                                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(text = opponent.avatar, fontSize = 20.sp)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = opponent.name,
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Text(
                                        text = "${opponent.cardCount} cards",
                                        color = Color(0xFFFFD54F),
                                        fontWeight = FontWeight.Black
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {}
        )
    }

    // Modal: Round Over or Match Winner
    if (gameState.gamePhase == GamePhase.ROUND_OVER || gameState.gamePhase == GamePhase.MATCH_OVER) {
        val winner = gameState.winner
        val isMatchOver = gameState.gamePhase == GamePhase.MATCH_OVER
        val isLastPlayerMode = gameState.rules.gameEndingMode == GameEndingMode.PLAY_UNTIL_LAST_PLAYER && gameState.finishingOrder.isNotEmpty()

        AlertDialog(
            onDismissRequest = {},
            title = {
                Text(
                    text = if (isLastPlayerMode) "🏁 MATCH PLACEMENTS" else if (isMatchOver) "🎉 MATCH CHAMPION!" else "🏆 ROUND WINNER!",
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                    color = Color(0xFFFFD54F),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (isLastPlayerMode) {
                        Text(
                            text = "Placements (Play Until Last Player):",
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF94A3B8),
                            fontSize = 13.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        gameState.finishingOrder.forEachIndexed { idx, p ->
                            val rankStr = when (idx + 1) {
                                1 -> "1st 🥇"
                                2 -> "2nd 🥈"
                                3 -> "3rd 🥉"
                                else -> "${idx + 1}th"
                            }
                            Surface(
                                color = if (idx == 0) Color(0x33FFD54F) else Color(0x221E293B),
                                shape = RoundedCornerShape(8.dp),
                                border = if (idx == 0) BorderStroke(1.dp, Color(0xFFFFD54F)) else null,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 3.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = rankStr,
                                            fontWeight = FontWeight.Black,
                                            color = if (idx == 0) Color(0xFFFFD54F) else Color.White,
                                            fontSize = 13.sp
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "${p.avatar} ${p.name}",
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp
                                        )
                                    }
                                    if (p.isHuman) {
                                        Surface(
                                            color = Color(0xFF1976D2),
                                            shape = RoundedCornerShape(4.dp)
                                        ) {
                                            Text(
                                                text = "YOU",
                                                color = Color.White,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        Text(
                            text = "${winner?.avatar} ${winner?.name ?: "Someone"} WON!",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Total Score: ${winner?.score ?: 0} pts",
                            color = Color(0xFF81C784),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )

                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = "Leaderboard:",
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF94A3B8),
                            fontSize = 13.sp
                        )
                        Spacer(modifier = Modifier.height(4.dp))

                        gameState.players.sortedByDescending { it.score }.forEach { p ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(text = "${p.avatar} ${p.name}", color = Color.White, fontSize = 13.sp)
                                Text(text = "${p.score} pts", color = Color(0xFFFFD54F), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isMatchOver) onQuit() else onNextRound()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
                ) {
                    Text(if (isMatchOver) "Back to Lobby" else "Next Round")
                }
            },
            dismissButton = {
                TextButton(onClick = onQuit) {
                    Text("Exit Match", color = Color(0xFF94A3B8))
                }
            }
        )
    }

    // Modal: Game Logs BottomSheet
    if (showLogsSheet) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { showLogsSheet = false },
            sheetState = sheetState,
            containerColor = Color(0xFF1E293B)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = "Game Action Feed",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier.height(300.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(gameState.logs.reversed()) { log ->
                        Surface(
                            color = if (log.isAlert) Color(0xFFE53935).copy(alpha = 0.3f) else Color(0xFF0F172A),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = log.text,
                                color = if (log.isAlert) Color(0xFFFF8A80) else Color(0xFFCBD5E1),
                                fontSize = 12.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }
                }
            }
        }
    }

    // Modal: Active Rules Inspector
    if (showRulesModal) {
        AlertDialog(
            onDismissRequest = { showRulesModal = false },
            title = { Text("Active House Rules", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val r = gameState.rules
                    RuleBullet("Player Count", "${gameState.players.size} Players")
                    RuleBullet("Stacking +2", if (r.stackingDrawTwos) "Enabled (+2 on +2)" else "Disabled")
                    RuleBullet("Stacking +4", if (r.stackingDrawFours) "Enabled (+4 on +4)" else "Disabled")
                    RuleBullet("Stack +4 on +2", if (r.stackingDrawFourOnTwo) "Enabled" else "Disabled")
                    RuleBullet("7-0 Hand Swap", if (r.sevenZeroRule) "Enabled" else "Disabled")
                    RuleBullet("Jump-In Rule", if (r.jumpInRule) "Enabled" else "Disabled")
                    RuleBullet("Draw Rule", if (r.drawUntilPlayable) "Draw Until Playable" else "Draw 1")
                    RuleBullet("Mercy Rule", if (r.mercyRule) "25 Cards = Out" else "Disabled")
                }
            },
            confirmButton = {
                Button(onClick = { showRulesModal = false }) {
                    Text("Got it")
                }
            }
        )
    }

    // Modal: Quit Confirmation
    if (showQuitConfirmation) {
        AlertDialog(
            onDismissRequest = { showQuitConfirmation = false },
            title = { Text("Leave Match?") },
            text = { Text("Are you sure you want to exit to the main lobby? Current match progress will be lost.") },
            confirmButton = {
                Button(
                    onClick = {
                        showQuitConfirmation = false
                        onQuit()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
                ) {
                    Text("Exit to Lobby")
                }
            },
            dismissButton = {
                TextButton(onClick = { showQuitConfirmation = false }) {
                    Text("Resume")
                }
            }
        )
    }
}

@Composable
private fun PassAndPlayShield(
    playerName: String,
    onReveal: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .clickable(onClick = onReveal),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        border = BorderStroke(2.dp, Color(0xFFFFD54F))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = "Hidden",
                tint = Color(0xFFFFD54F),
                modifier = Modifier.size(40.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "$playerName's Turn",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = "Pass the device to $playerName, then tap to reveal cards!",
                color = Color(0xFF94A3B8),
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(14.dp))
            Button(
                onClick = onReveal,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
            ) {
                Icon(Icons.Default.Visibility, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text("Reveal My Hand")
            }
        }
    }
}

@Composable
private fun RuleBullet(name: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "• $name:", color = Color(0xFF94A3B8), fontSize = 13.sp)
        Text(text = value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

/**
 * Top Players Card Tracker Bar.
 * Guarantees every player's card count is continuously and clearly visible on any device.
 */
@Composable
private fun PlayersCardTrackerBar(
    players: List<Player>,
    currentPlayerIndex: Int,
    humanIndex: Int,
    onPlayerTap: (Int) -> Unit
) {
    val scrollState = rememberScrollState()

    Surface(
        color = Color(0xFF0F172A).copy(alpha = 0.95f),
        border = BorderStroke(0.5.dp, Color(0x33FFFFFF)),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("players_card_tracker_bar")
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            players.forEachIndexed { idx, player ->
                val isCurrent = idx == currentPlayerIndex
                val isLocal = idx == humanIndex
                val isFinished = player.isFinished

                Surface(
                    color = when {
                        isFinished -> Color(0x442E7D32)
                        isCurrent -> Color(0xEE1E293B)
                        else -> Color(0x991E293B)
                    },
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(
                        width = if (isCurrent) 1.5.dp else 1.dp,
                        color = when {
                            isCurrent -> Color(0xFFFFD54F)
                            player.cardCount == 1 && !isFinished -> Color(0xFFE53935)
                            else -> Color(0x22FFFFFF)
                        }
                    ),
                    modifier = Modifier
                        .clickable { onPlayerTap(idx) }
                        .testTag("player_tracker_$idx")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = player.avatar, fontSize = 13.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (isLocal) "${player.name} (You)" else player.name,
                            color = if (isCurrent) Color(0xFFFFD54F) else Color.White,
                            fontSize = 11.sp,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        if (isFinished) {
                            val rankText = when (player.finishRank) {
                                1 -> "1st 🥇"
                                2 -> "2nd 🥈"
                                3 -> "3rd 🥉"
                                else -> "Done 🏁"
                            }
                            Text(
                                text = rankText,
                                color = Color(0xFF81C784),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        } else {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = when {
                                    player.cardCount == 1 -> Color(0xFFD32F2F)
                                    player.cardCount == 2 -> Color(0xFFE65100)
                                    else -> Color(0xFF2563EB)
                                }
                            ) {
                                Text(
                                    text = if (player.cardCount == 1) "🔥 1" else "🎴 ${player.cardCount}",
                                    color = Color.White,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
