package com.example

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.model.GamePhase
import com.example.ui.screens.GameScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.RulesScreen
import com.example.ui.screens.StatsScreen
import com.example.ui.theme.MyApplicationTheme
import com.example.viewmodel.UnoViewModel

/**
 * Walks up the Context wrapper chain to find the hosting Activity, so a Composable
 * deep in the tree (e.g. GameScreen) can request an orientation change. Returns null
 * if none is found (e.g. in a Preview), in which case callers should no-op.
 */
tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is android.content.ContextWrapper -> baseContext.findActivity()
    else -> null
}

enum class AppScreen {
    HOME,
    GAME,
    RULES,
    STATS
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                Surface(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
                    UnoAppRoot()
                }
            }
        }
    }
}

@Composable
fun UnoAppRoot(
    viewModel: UnoViewModel = viewModel()
) {
    val gameState by viewModel.gameState.collectAsStateWithLifecycle()
    val activeRules by viewModel.activeRules.collectAsStateWithLifecycle()
    val networkRole by viewModel.networkRole.collectAsStateWithLifecycle()
    val recentMatches by viewModel.recentMatches.collectAsStateWithLifecycle(initialValue = emptyList())
    val playerStats by viewModel.playerStats.collectAsStateWithLifecycle(initialValue = emptyList())

    var currentScreen by remember { mutableStateOf(AppScreen.HOME) }

    // If game has started, show game screen
    val effectiveScreen = if (gameState.gamePhase != GamePhase.NOT_STARTED) {
        AppScreen.GAME
    } else {
        currentScreen
    }

    when (effectiveScreen) {
        AppScreen.HOME -> {
            HomeScreen(
                viewModel = viewModel,
                activeRules = activeRules,
                onStartGame = { playerCount, mode, rules, roomCode ->
                    viewModel.startMatch(playerCount, mode, rules, roomCode)
                },
                onOpenRules = { currentScreen = AppScreen.RULES },
                onOpenStats = { currentScreen = AppScreen.STATS }
            )
        }

        AppScreen.GAME -> {
            // Gameplay is a fixed LANDSCAPE card table (see design spec) regardless of
            // the device's rotation lock/auto-rotate setting — force it while this
            // screen is composed, and restore whatever orientation the app had on entry.
            val context = LocalContext.current
            DisposableEffect(Unit) {
                val activity = context.findActivity()
                val previousOrientation = activity?.requestedOrientation
                activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                onDispose {
                    activity?.requestedOrientation = previousOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }

            BackHandler {
                viewModel.quitToLobby()
                currentScreen = AppScreen.HOME
            }
            GameScreen(
                gameState = gameState,
                localPlayerId = viewModel.currentUserId,
                isHost = (networkRole == com.example.viewmodel.NetworkRole.HOST || networkRole == com.example.viewmodel.NetworkRole.OFFLINE),
                onPlayCard = { card -> viewModel.playCard(card) },
                onDrawCard = { viewModel.drawCard() },
                onPassTurn = { viewModel.passTurn() },
                onCallUno = { viewModel.callUno() },
                onCatchUno = { targetIdx -> viewModel.catchUno(targetIdx) },
                onJumpIn = { playerIdx, card -> viewModel.jumpIn(playerIdx, card) },
                onSelectWildColor = { color -> viewModel.chooseWildColor(color) },
                onSelectCustomWildEffect = { effect -> viewModel.chooseCustomWildEffect(effect) },
                onSelectSevenSwapTarget = { targetIdx -> viewModel.chooseSevenSwapTarget(targetIdx) },
                onTogglePassAndPlayReveal = { viewModel.togglePassAndPlayHandVisibility() },
                onNextRound = { viewModel.nextRound() },
                onPlayUnplayableCard = { viewModel.playUnplayableCardFeedback() },
                onUpdateRules = { updatedRules -> viewModel.updateRules(updatedRules) },
                onQuit = {
                    viewModel.quitToLobby()
                    currentScreen = AppScreen.HOME
                }
            )
        }

        AppScreen.RULES -> {
            BackHandler { currentScreen = AppScreen.HOME }
            RulesScreen(
                currentRules = activeRules,
                isHost = (networkRole == com.example.viewmodel.NetworkRole.HOST || networkRole == com.example.viewmodel.NetworkRole.OFFLINE),
                onSaveRules = { updatedRules ->
                    viewModel.updateRules(updatedRules)
                },
                onBack = { currentScreen = AppScreen.HOME }
            )
        }

        AppScreen.STATS -> {
            BackHandler { currentScreen = AppScreen.HOME }
            StatsScreen(
                recentMatches = recentMatches,
                playerStats = playerStats,
                onClearStats = { viewModel.clearStats() },
                onBack = { currentScreen = AppScreen.HOME }
            )
        }
    }
}
