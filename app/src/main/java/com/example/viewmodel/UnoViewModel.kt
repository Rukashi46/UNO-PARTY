package com.example.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.MatchRecord
import com.example.data.PlayerStat
import com.example.data.UnoDatabase
import com.example.data.UnoRepository
import com.example.engine.BotAction
import com.example.engine.UnoDeck
import com.example.engine.UnoGameEngine
import com.example.engine.UnoGameState
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.util.GameEffects
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class UnoViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: UnoRepository
    private val effects: GameEffects

    init {
        val db = UnoDatabase.getDatabase(application)
        repository = UnoRepository(db.unoDao())
        effects = GameEffects(application)
    }

    val recentMatches: Flow<List<MatchRecord>> = repository.recentMatches
    val playerStats: Flow<List<PlayerStat>> = repository.playerStats

    private val _gameState = MutableStateFlow(UnoGameState())
    val gameState: StateFlow<UnoGameState> = _gameState.asStateFlow()

    private val _activeRules = MutableStateFlow(GameRules.SPICY_HOUSE_RULES)
    val activeRules: StateFlow<GameRules> = _activeRules.asStateFlow()

    private var botTurnJob: Job? = null

    fun updateRules(newRules: GameRules) {
        _activeRules.value = newRules
    }

    fun startMatch(playerCount: Int, mode: GameMode, rules: GameRules, roomCode: String? = null) {
        botTurnJob?.cancel()
        _activeRules.value = rules
        val state = UnoGameEngine.startNewGame(
            playerCount = playerCount,
            mode = mode,
            rules = rules,
            roomCode = roomCode
        )
        _gameState.value = state
        checkTriggerBotTurn(state)
    }

    fun playCard(card: UnoCard) {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        if (state.rules.hapticsEnabled) {
            effects.playCardHaptic()
        }

        val nextState = UnoGameEngine.playCard(state, playerIdx, card)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun chooseWildColor(color: UnoColor) {
        val state = _gameState.value
        val nextState = UnoGameEngine.completeWildSelection(state, color)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun chooseCustomWildEffect(effect: com.example.model.CustomWildEffect) {
        val state = _gameState.value
        val nextState = UnoGameEngine.completeCustomWildSelection(state, effect)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun chooseSevenSwapTarget(targetIndex: Int) {
        val state = _gameState.value
        val sourceIndex = state.pendingSevenPlayerIndex ?: return
        val nextState = UnoGameEngine.executeSevenSwap(state, sourceIndex, targetIndex)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun drawCard() {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        if (state.rules.hapticsEnabled) {
            effects.drawCardHaptic()
        }

        val nextState = UnoGameEngine.drawCard(state, playerIdx)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun passTurn() {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        val nextState = UnoGameEngine.passTurn(state, playerIdx)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun callUno() {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        if (state.rules.hapticsEnabled) {
            effects.unoCallHaptic()
        }
        val nextState = UnoGameEngine.callUno(state, playerIdx)
        _gameState.value = nextState
    }

    fun catchUno(targetIndex: Int) {
        val state = _gameState.value
        val catcherIndex = state.currentPlayerIndex
        if (state.rules.hapticsEnabled) {
            effects.penaltyHaptic()
        }
        val nextState = UnoGameEngine.catchUno(state, catcherIndex, targetIndex)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun jumpIn(playerIndex: Int, card: UnoCard) {
        val state = _gameState.value
        if (!state.rules.jumpInRule) return
        if (state.rules.hapticsEnabled) {
            effects.playCardHaptic()
        }
        val nextState = UnoGameEngine.jumpIn(state, playerIndex, card)
        _gameState.value = nextState
        onStateUpdated(nextState)
    }

    fun togglePassAndPlayHandVisibility() {
        _gameState.update { UnoGameEngine.togglePassAndPlayVisibility(it) }
    }

    fun nextRound() {
        val state = _gameState.value
        val currentPlayers = state.players.map { it.copy(hand = emptyList(), hasCalledUno = false, canBePenalizedUno = false) }
        val newDeck = UnoDeck.generateDeck(if (currentPlayers.size >= 7) 2 else 1)
        val dealtPlayers = currentPlayers.map { p ->
            val h = mutableListOf<UnoCard>()
            for (i in 0 until state.rules.initialCardsPerPlayer) {
                if (newDeck.isNotEmpty()) h.add(newDeck.removeAt(0))
            }
            p.copy(hand = h)
        }

        var topCard = newDeck.removeAt(0)
        while (topCard.value == com.example.model.UnoValue.WILD_DRAW_FOUR) {
            newDeck.add(topCard)
            newDeck.shuffle()
            topCard = newDeck.removeAt(0)
        }

        val nextState = state.copy(
            players = dealtPlayers,
            drawPile = newDeck,
            discardPile = listOf(topCard),
            activeColor = if (topCard.color == UnoColor.WILD) UnoColor.RED else topCard.color,
            pendingDrawStack = 0,
            gamePhase = GamePhase.PLAYING,
            roundNumber = state.roundNumber + 1,
            winner = null
        )
        _gameState.value = nextState
        checkTriggerBotTurn(nextState)
    }

    fun quitToLobby() {
        botTurnJob?.cancel()
        _gameState.value = _gameState.value.copy(gamePhase = GamePhase.NOT_STARTED)
    }

    fun clearStats() {
        viewModelScope.launch {
            repository.clearHistory()
        }
    }

    private fun onStateUpdated(state: UnoGameState) {
        if (state.gamePhase == GamePhase.ROUND_OVER || state.gamePhase == GamePhase.MATCH_OVER) {
            handleGameOver(state)
        } else {
            checkTriggerBotTurn(state)
        }
    }

    private fun handleGameOver(state: UnoGameState) {
        val winner = state.winner ?: return
        if (state.rules.hapticsEnabled) {
            effects.winHaptic()
        }

        viewModelScope.launch {
            repository.saveMatch(
                MatchRecord(
                    playerCount = state.players.size,
                    winnerName = winner.name,
                    winnerIsHuman = winner.isHuman,
                    roundScore = winner.score,
                    totalRounds = state.roundNumber,
                    rulesSummary = "${state.players.size}P - ${if (state.rules.stackingDrawTwos) "Stacking" else "No-Stack"} / ${if (state.rules.sevenZeroRule) "7-0" else "Standard"}"
                )
            )

            state.players.forEach { p ->
                if (p.id == winner.id) {
                    repository.recordWinner(p.id, p.name, p.score, p.isHuman, unosCalled = if (p.hasCalledUno) 1 else 0)
                } else {
                    repository.recordParticipant(p.id, p.name, unosCalled = if (p.hasCalledUno) 1 else 0)
                }
            }
        }
    }

    private fun checkTriggerBotTurn(state: UnoGameState) {
        botTurnJob?.cancel()
        if (state.gamePhase != GamePhase.PLAYING) return

        val currentPlayer = state.currentPlayer ?: return
        val isBot = !currentPlayer.isHuman || state.mode == GameMode.ALL_BOTS

        if (isBot) {
            botTurnJob = viewModelScope.launch {
                delay(state.rules.botSpeedMs)
                val botAction = UnoGameEngine.getBotMove(_gameState.value)
                if (botAction != null) {
                    executeBotAction(botAction)
                }
            }
        }
    }

    private fun executeBotAction(action: BotAction) {
        val state = _gameState.value
        val botIdx = state.currentPlayerIndex

        when (action) {
            is BotAction.Play -> {
                val nextState = UnoGameEngine.playCard(state, botIdx, action.card, action.chosenColor)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
            is BotAction.Draw -> {
                val nextState = UnoGameEngine.drawCard(state, botIdx)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
            is BotAction.Pass -> {
                val nextState = UnoGameEngine.passTurn(state, botIdx)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
            is BotAction.CallUno -> {
                val nextState = UnoGameEngine.callUno(state, action.playerIndex)
                _gameState.value = nextState
                // Bot called UNO, now proceed with their play
                checkTriggerBotTurn(nextState)
            }
            is BotAction.CatchUno -> {
                val nextState = UnoGameEngine.catchUno(state, botIdx, action.targetIndex)
                _gameState.value = nextState
                checkTriggerBotTurn(nextState)
            }
            is BotAction.ChooseColor -> {
                val nextState = UnoGameEngine.completeWildSelection(state, action.color)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
            is BotAction.ChooseCustomWild -> {
                val nextState = UnoGameEngine.completeCustomWildSelection(state, action.effect)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
            is BotAction.ChooseSevenSwap -> {
                val nextState = UnoGameEngine.executeSevenSwap(state, botIdx, action.targetIndex)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
        }
    }
}
