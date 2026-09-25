package com.example.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.MatchEntity
import com.example.data.MatchRecord
import com.example.data.MatchScoreRecord
import com.example.data.PlayerStat
import com.example.data.RoomRecordEntity
import com.example.data.SupabaseLobbyRepository
import com.example.data.UnoDatabase
import com.example.data.UnoRepository
import com.example.data.UserPreferencesManager
import com.example.engine.BotAction
import com.example.engine.UnoDeck
import com.example.engine.UnoGameEngine
import com.example.engine.UnoGameState
import com.example.model.CustomWildEffect
import com.example.model.GameLogEntry
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.Player
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.network.DiscoveredRoom
import com.example.network.RoomCodeUtil
import com.example.network.SupabaseManager
import com.example.network.UnoNetworkProtocol
import com.example.network.UnoWlanClient
import com.example.network.UnoWlanServer
import com.example.util.GameEffects
import com.example.util.SoundManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class NetworkRole {
    OFFLINE,
    HOST,
    CLIENT
}

class UnoViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: UnoRepository
    val supabaseLobbyRepository: SupabaseLobbyRepository
    private val effects: GameEffects

    // Network Server & Client
    val wlanServer: UnoWlanServer = UnoWlanServer(viewModelScope) { state ->
        _gameState.value = state
        onStateUpdated(state)
    }

    val wlanClient: UnoWlanClient = UnoWlanClient(
        scope = viewModelScope,
        onStateUpdated = { state ->
            _gameState.value = state
            onStateUpdated(state)
        },
        onGameStarted = { state ->
            _gameState.value = state
            onStateUpdated(state)
        }
    )

    private val _networkRole = MutableStateFlow(NetworkRole.OFFLINE)
    val networkRole: StateFlow<NetworkRole> = _networkRole.asStateFlow()

    private val _currentRoomCode = MutableStateFlow("UNO-7777")
    val currentRoomCode: StateFlow<String> = _currentRoomCode.asStateFlow()

    private val _hostIpAddress = MutableStateFlow("127.0.0.1")
    val hostIpAddress: StateFlow<String> = _hostIpAddress.asStateFlow()

    private val _lobbyPlayers = MutableStateFlow<List<Player>>(emptyList())
    val lobbyPlayers: StateFlow<List<Player>> = _lobbyPlayers.asStateFlow()

    val discoveredRooms: StateFlow<List<DiscoveredRoom>> = wlanClient.discoveredRooms
    val isClientConnected: StateFlow<Boolean> = wlanClient.isConnected
    val connectionStatus: StateFlow<UnoNetworkProtocol.ConnectionStatus> = wlanClient.connectionStatus
    val networkErrorMessage: StateFlow<String?> = wlanClient.errorMessage
    val currentUserId: String get() = userPrefs.getPlayerId()

    val soundManager: SoundManager = SoundManager.getInstance(application)

    init {
        val db = UnoDatabase.getDatabase(application)
        repository = UnoRepository(db.unoDao())
        supabaseLobbyRepository = SupabaseLobbyRepository(repository, scope = viewModelScope)
        effects = GameEffects(application)

        // Load persisted game configuration from Room database
        viewModelScope.launch {
            repository.loadGameConfig()?.let { savedRules ->
                _activeRules.value = savedRules
                soundManager.isSoundEnabled = savedRules.soundEnabled
            }
        }

        // Observe Supabase real-time lobby state updates
        viewModelScope.launch {
            supabaseLobbyRepository.lobbyState.collect { sState ->
                if (_networkRole.value != NetworkRole.OFFLINE && sState.players.isNotEmpty()) {
                    _lobbyPlayers.value = sState.players
                }
                // If client, keep rules synchronized with host's Supabase state
                if (_networkRole.value == NetworkRole.CLIENT && sState.rules != _activeRules.value) {
                    _activeRules.value = sState.rules
                }
            }
        }

        // Observe server players
        viewModelScope.launch {
            wlanServer.connectedPlayers.collect { players ->
                if (_networkRole.value == NetworkRole.HOST) {
                    _lobbyPlayers.value = players
                }
            }
        }

        // Observe client players
        viewModelScope.launch {
            wlanClient.lobbyPlayers.collect { players ->
                if (_networkRole.value == NetworkRole.CLIENT) {
                    _lobbyPlayers.value = players
                }
            }
        }

        // Observe rule changes pushed by host
        wlanClient.onRulesUpdated = { rules ->
            _activeRules.value = rules
        }

        // Sync profile to cloud on launch if configured
        if (SupabaseManager.isConfigured) {
            viewModelScope.launch {
                SupabaseManager.syncProfile(userPrefs.getPlayerId(), userPrefs.getUsername(), userPrefs.getAvatar())
            }
        }
    }

    val recentMatches: Flow<List<MatchRecord>> = repository.recentMatches
    val playerStats: Flow<List<PlayerStat>> = repository.playerStats

    private val _gameState = MutableStateFlow(UnoGameState())
    val gameState: StateFlow<UnoGameState> = _gameState.asStateFlow()

    private val _activeRules = MutableStateFlow(GameRules.SPICY_HOUSE_RULES)
    val activeRules: StateFlow<GameRules> = _activeRules.asStateFlow()

    val userPrefs: UserPreferencesManager = UserPreferencesManager.getInstance(application)
    private val _currentUsername = MutableStateFlow(userPrefs.getUsername())
    val currentUsername: StateFlow<String> = _currentUsername.asStateFlow()

    private val _currentAvatar = MutableStateFlow(userPrefs.getAvatar())
    val currentAvatar: StateFlow<String> = _currentAvatar.asStateFlow()

    fun saveUsername(newName: String): Boolean {
        val success = userPrefs.saveUsername(newName)
        if (success) {
            _currentUsername.value = userPrefs.getUsername()
            if (SupabaseManager.isConfigured) {
                viewModelScope.launch {
                    SupabaseManager.syncProfile(userPrefs.getPlayerId(), userPrefs.getUsername(), userPrefs.getAvatar())
                }
            }
        }
        return success
    }

    fun saveAvatar(newAvatar: String) {
        userPrefs.saveAvatar(newAvatar)
        _currentAvatar.value = newAvatar
        if (SupabaseManager.isConfigured) {
            viewModelScope.launch {
                SupabaseManager.syncProfile(userPrefs.getPlayerId(), userPrefs.getUsername(), newAvatar)
            }
        }
    }

    fun validateUsername(name: String): String? = userPrefs.validateUsername(name)

    private var botTurnJob: Job? = null
    private var unplayableCardJob: Job? = null

    fun updateRules(newRules: GameRules, configName: String = "Custom") {
        if (_networkRole.value == NetworkRole.CLIENT) {
            // Clients cannot edit authoritative room rules
            viewModelScope.launch {
                supabaseLobbyRepository.errorMessage.replayCache
            }
            return
        }
        _activeRules.value = newRules
        soundManager.isSoundEnabled = newRules.soundEnabled

        // If a game is active locally or as host, update the game state rules immediately
        if (_gameState.value.gamePhase != GamePhase.NOT_STARTED) {
            _gameState.update { current ->
                current.copy(
                    rules = newRules,
                    logs = current.logs + GameLogEntry(text = "👑 House Rules updated", isAlert = true)
                )
            }
        }

        viewModelScope.launch {
            val currentRoom = _gameState.value.roomCode ?: _currentRoomCode.value
            supabaseLobbyRepository.updateMatchSettings(
                roomCode = currentRoom,
                requestingPlayerId = currentUserId,
                newRules = newRules,
                configName = configName
            )
        }

        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateRules(newRules)
        }
    }

    fun generateHostRoomCode(isWlan: Boolean = true): String {
        val localIp = wlanServer.getLocalIpAddress()
        val prefix = if (isWlan) "WLAN-" else "ONLINE-"
        return RoomCodeUtil.encodeIpToRoomCode(localIp, prefix = prefix)
    }

    // Network Room Management
    fun hostRoom(
        roomCode: String,
        playerName: String = userPrefs.getUsername(),
        avatar: String = userPrefs.getAvatar()
    ) {
        leaveNetwork()
        _networkRole.value = NetworkRole.HOST
        _currentRoomCode.value = roomCode

        val localIp = wlanServer.getLocalIpAddress()
        _hostIpAddress.value = localIp

        val hostPlayer = Player(
            id = userPrefs.getPlayerId(),
            name = playerName,
            avatar = avatar,
            isHuman = true,
            isHost = true,
            isConnected = true,
            isReconnecting = false,
            pingMs = 0
        )

        _lobbyPlayers.value = listOf(hostPlayer)
        wlanServer.startServer(roomCode, hostPlayer)

        supabaseLobbyRepository.startHosting(
            roomCode = roomCode,
            hostPlayer = hostPlayer,
            mode = "ONLINE_ROOM",
            rules = _activeRules.value,
            hostAddress = localIp
        )
    }

    fun joinRoom(
        hostAddressOrCode: String,
        playerName: String = userPrefs.getUsername(),
        avatar: String = userPrefs.getAvatar()
    ) {
        leaveNetwork()
        _networkRole.value = NetworkRole.CLIENT

        val clientPlayer = Player(
            id = userPrefs.getPlayerId(),
            name = playerName,
            avatar = avatar,
            isHuman = true,
            isHost = false,
            isConnected = false,
            isReconnecting = false,
            pingMs = 0
        )

        wlanClient.resolveAndConnect(hostAddressOrCode, clientPlayer)

        // If a room code was entered, synchronize via Supabase repository as well
        val resolvedCode = if (hostAddressOrCode.contains(":") || hostAddressOrCode.split(".").size == 4) {
            RoomCodeUtil.encodeIpToRoomCode(hostAddressOrCode.substringBefore(":"))
        } else {
            hostAddressOrCode.uppercase().trim()
        }
        _currentRoomCode.value = resolvedCode
        supabaseLobbyRepository.joinRoom(resolvedCode, clientPlayer)
    }

    fun startDiscovery() {
        wlanClient.startDiscovery(userPrefs.getPlayerId())
    }

    fun stopDiscovery() {
        wlanClient.stopDiscovery()
    }

    fun leaveNetwork() {
        val code = _currentRoomCode.value
        supabaseLobbyRepository.leaveLobby(code, userPrefs.getPlayerId())
        wlanServer.stopServer()
        wlanClient.disconnect()
        wlanClient.stopDiscovery()
        _networkRole.value = NetworkRole.OFFLINE
        _lobbyPlayers.value = emptyList()
    }

    fun startMatch(playerCount: Int, mode: GameMode, rules: GameRules, roomCode: String? = null) {
        botTurnJob?.cancel()
        unplayableCardJob?.cancel()
        _activeRules.value = rules

        if (rules.soundEnabled) {
            soundManager.playCardDealSound()
        }

        if (mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER) {
            if (_networkRole.value == NetworkRole.HOST) {
                val hostState = wlanServer.startGame(rules, mode)
                if (hostState != null) {
                    _gameState.value = hostState
                    onStateUpdated(hostState)
                }
            }
            // For client, start is received automatically via wlanClient
            return
        }

        // Local Single-Player or Pass & Play
        val state = UnoGameEngine.startNewGame(
            playerCount = playerCount,
            mode = mode,
            rules = rules,
            roomCode = roomCode,
            humanPlayerName = userPrefs.getUsername()
        )
        _gameState.value = state
        checkTriggerBotTurn(state)
    }

    fun playUnplayableCardFeedback() {
        if (_activeRules.value.soundEnabled) {
            soundManager.playInvalidCardSound()
        }
        if (_activeRules.value.hapticsEnabled) {
            effects.playCardHaptic()
        }
    }

    fun playCard(card: UnoCard) {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        val myPlayerIndex = state.players.indexOfFirst { it.id == userPrefs.getPlayerId() }

        if (_networkRole.value == NetworkRole.CLIENT) {
            // Only send action if it is the client's turn
            if (playerIdx == myPlayerIndex) {
                if (state.rules.soundEnabled) {
                    soundManager.playCardPlaySound()
                }
                wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_PLAY_CARD, card = card)
            }
            return
        }

        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        if (state.rules.soundEnabled) {
            soundManager.playCardPlaySound()
        }
        if (state.rules.hapticsEnabled) {
            effects.playCardHaptic()
        }

        val nextState = UnoGameEngine.playCard(state, playerIdx, card)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun chooseWildColor(color: UnoColor) {
        val state = _gameState.value
        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CHOOSE_COLOR, chosenColor = color)
            return
        }

        val nextState = UnoGameEngine.completeWildSelection(state, color)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun chooseCustomWildEffect(effect: CustomWildEffect) {
        val state = _gameState.value
        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CHOOSE_CUSTOM_WILD, effect = effect)
            return
        }

        val nextState = UnoGameEngine.completeCustomWildSelection(state, effect)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun chooseSevenSwapTarget(targetIndex: Int) {
        val state = _gameState.value
        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CHOOSE_SEVEN_SWAP, targetIndex = targetIndex)
            return
        }

        val sourceIndex = state.pendingSevenPlayerIndex ?: return
        val nextState = UnoGameEngine.executeSevenSwap(state, sourceIndex, targetIndex)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun chooseColorRoulette(color: UnoColor) {
        val state = _gameState.value
        val targetIdx = state.pendingRouletteTargetIndex ?: state.currentPlayerIndex
        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CHOOSE_COLOR_ROULETTE, chosenColor = color)
            return
        }

        val nextState = UnoGameEngine.completeColorRouletteSelection(state, targetIdx, color)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    // DRAW CARD: Real Drawn Playable Card UX
    fun drawCard() {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        val myPlayerIndex = state.players.indexOfFirst { it.id == userPrefs.getPlayerId() }

        if (_networkRole.value == NetworkRole.CLIENT) {
            if (playerIdx == myPlayerIndex) {
                if (state.rules.soundEnabled) {
                    soundManager.playDrawCardSound()
                }
                wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_DRAW_CARD)
            }
            return
        }

        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        if (state.rules.soundEnabled) {
            soundManager.playDrawCardSound()
        }
        if (state.rules.hapticsEnabled) {
            effects.drawCardHaptic()
        }

        unplayableCardJob?.cancel()

        // Pass autoAdvanceIfUnplayable = false so user sees unplayable card enter hand before turn ends
        val nextState = UnoGameEngine.drawCard(state, playerIdx, autoAdvanceIfUnplayable = false)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }

        if (nextState.drawnThisTurn && nextState.cardDrawnThisTurn != null) {
            // Drawn card IS playable! Remains floating above hand with [PLAY CARD] & [END TURN] buttons
        } else {
            // Drawn card is NOT playable! Visible in hand, automatically advance turn after visual feedback
            unplayableCardJob = viewModelScope.launch {
                delay(1200L)
                val advanced = UnoGameEngine.advanceTurn(_gameState.value)
                _gameState.value = advanced
                if (_networkRole.value == NetworkRole.HOST) {
                    wlanServer.updateAndBroadcastHostState(advanced)
                }
                onStateUpdated(advanced)
            }
        }
    }

    fun playDrawnCard() {
        val state = _gameState.value
        val card = state.cardDrawnThisTurn ?: return
        playCard(card)
    }

    fun passTurn() {
        unplayableCardJob?.cancel()
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        val player = state.players.getOrNull(playerIdx) ?: return
        val myPlayerIndex = state.players.indexOfFirst { it.id == userPrefs.getPlayerId() }

        if (_networkRole.value == NetworkRole.CLIENT) {
            if (playerIdx == myPlayerIndex) {
                wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_PASS_TURN)
            }
            return
        }

        if (!player.isHuman && state.mode != GameMode.ALL_BOTS) return

        val nextState = UnoGameEngine.passTurn(state, playerIdx)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun callUno() {
        val state = _gameState.value
        val playerIdx = state.currentPlayerIndex
        if (state.rules.soundEnabled) {
            soundManager.playUnoCallSound()
        }
        if (state.rules.hapticsEnabled) {
            effects.unoCallHaptic()
        }

        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CALL_UNO)
            return
        }

        val nextState = UnoGameEngine.callUno(state, playerIdx)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
    }

    fun catchUno(targetIndex: Int) {
        val state = _gameState.value
        val catcherIndex = state.players.indexOfFirst { it.isHuman }.takeIf { it >= 0 } ?: state.currentPlayerIndex
        if (state.rules.hapticsEnabled) {
            effects.penaltyHaptic()
        }

        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_CATCH_UNO, targetIndex = targetIndex)
            return
        }

        val nextState = UnoGameEngine.catchUno(state, catcherIndex, targetIndex)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        onStateUpdated(nextState)
    }

    fun jumpIn(playerIndex: Int, card: UnoCard) {
        val state = _gameState.value
        if (!state.rules.jumpInRule) return
        if (state.rules.hapticsEnabled) {
            effects.playCardHaptic()
        }

        if (_networkRole.value == NetworkRole.CLIENT) {
            wlanClient.sendAction(actionType = UnoNetworkProtocol.ACTION_JUMP_IN, card = card)
            return
        }

        val nextState = UnoGameEngine.jumpIn(state, playerIndex, card)
        _gameState.value = nextState
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
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
        while (topCard.value == com.example.model.UnoValue.WILD_DRAW_FOUR ||
            topCard.value == com.example.model.UnoValue.CUSTOM_WILD ||
            topCard.value == com.example.model.UnoValue.SHUFFLE_HANDS) {
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
        if (_networkRole.value == NetworkRole.HOST) {
            wlanServer.updateAndBroadcastHostState(nextState)
        }
        checkTriggerBotTurn(nextState)
    }

    fun quitToLobby() {
        botTurnJob?.cancel()
        unplayableCardJob?.cancel()
        leaveNetwork()
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
        if (state.rules.soundEnabled) {
            soundManager.playWinSound()
        }
        if (state.rules.hapticsEnabled) {
            effects.winHaptic()
        }

        viewModelScope.launch {
            val matchId = java.util.UUID.randomUUID().toString()
            val matchEntity = MatchEntity(
                matchId = matchId,
                roomCode = state.roomCode,
                gameMode = state.mode.name,
                gameEndingMode = state.rules.gameEndingMode.name,
                playerCount = state.players.size,
                winnerId = winner.id,
                winnerName = winner.name,
                noMercy = state.rules.noMercy,
                deckType = state.rules.deckType.name,
                startedAt = System.currentTimeMillis() - (state.roundNumber * 60000L),
                finishedAt = System.currentTimeMillis(),
                rulesSummary = "${state.players.size}P • ${state.rules.deckType.label} • ${if (state.rules.noMercy) "No Mercy" else "Standard"}"
            )
            repository.saveMatchEntity(matchEntity)

            val scoreRecords = state.players.mapIndexed { idx, p ->
                MatchScoreRecord(
                    matchId = matchId,
                    roomCode = state.roomCode,
                    playerId = p.id,
                    playerName = p.name,
                    avatar = p.avatar,
                    isHuman = p.isHuman,
                    isWinner = p.id == winner.id,
                    score = p.score,
                    placement = p.finishRank ?: if (p.id == winner.id) 1 else (idx + 1),
                    finalCards = p.hand.size,
                    cardsPlayed = 0,
                    unosCalled = if (p.hasCalledUno) 1 else 0,
                    unosCaught = 0
                )
            }
            repository.saveMatchScores(scoreRecords)

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

            if (SupabaseManager.isConfigured) {
                SupabaseManager.recordHistory(
                    roomCode = state.roomCode ?: "OFFLINE",
                    winnerId = winner.id,
                    winnerName = winner.name,
                    playerCount = state.players.size,
                    mode = state.mode.name,
                    rounds = state.roundNumber
                )
            }
        }
    }

    // STRICT BOT RULE: Bots are allowed ONLY in SOLO_BOTS or ALL_BOTS.
    // Never in ONLINE_ROOM or WLAN_MULTIPLAYER!
    private fun checkTriggerBotTurn(state: UnoGameState) {
        botTurnJob?.cancel()
        if (state.gamePhase != GamePhase.PLAYING) return
        if (state.mode == GameMode.ONLINE_ROOM || state.mode == GameMode.WLAN_MULTIPLAYER) return

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
                val nextState = UnoGameEngine.drawCard(state, botIdx, autoAdvanceIfUnplayable = true)
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
            is BotAction.ChooseColorRoulette -> {
                val nextState = UnoGameEngine.completeColorRouletteSelection(state, botIdx, action.color)
                _gameState.value = nextState
                onStateUpdated(nextState)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        leaveNetwork()
    }
}
