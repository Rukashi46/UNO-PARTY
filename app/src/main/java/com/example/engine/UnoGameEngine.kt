package com.example.engine

import com.example.model.CustomWildEffect
import com.example.model.DeckType
import com.example.model.GameEndingMode
import com.example.model.GameLogEntry
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.Player
import com.example.model.TurnDirection
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue
import com.example.model.isCardPlayable

data class UnoGameState(
    val players: List<Player> = emptyList(),
    val currentPlayerIndex: Int = 0,
    val direction: TurnDirection = TurnDirection.CLOCKWISE,
    val drawPile: List<UnoCard> = emptyList(),
    val discardPile: List<UnoCard> = emptyList(),
    val activeColor: UnoColor = UnoColor.RED,
    val pendingDrawStack: Int = 0,
    val gamePhase: GamePhase = GamePhase.NOT_STARTED,
    val rules: GameRules = GameRules(),
    val mode: GameMode = GameMode.SOLO_BOTS,
    val logs: List<GameLogEntry> = emptyList(),
    val winner: Player? = null,
    val roundNumber: Int = 1,
    val pendingWildCard: UnoCard? = null,
    val pendingWildPlayerIndex: Int? = null,
    val pendingCustomWildCard: UnoCard? = null,
    val pendingCustomWildPlayerIndex: Int? = null,
    val pendingSevenPlayerIndex: Int? = null,
    val pendingRouletteTargetIndex: Int? = null,
    val pendingRouletteCardsRevealed: List<UnoCard> = emptyList(),
    val drawnThisTurn: Boolean = false,
    val cardDrawnThisTurn: UnoCard? = null,
    val unplayableDrawnCard: UnoCard? = null,
    val unplayableDrawnNotice: String? = null,
    val passAndPlayHandVisible: Boolean = false,
    val roomCode: String? = null,
    val finishingOrder: List<Player> = emptyList(),
    val lastActionTimestamp: Long = System.currentTimeMillis()
) {
    val topDiscardCard: UnoCard? get() = discardPile.lastOrNull()
    val currentPlayer: Player? get() = players.getOrNull(currentPlayerIndex)
}

sealed class BotAction {
    data class Play(val card: UnoCard, val chosenColor: UnoColor? = null) : BotAction()
    object Draw : BotAction()
    object Pass : BotAction()
    data class CallUno(val playerIndex: Int) : BotAction()
    data class CatchUno(val targetIndex: Int) : BotAction()
    data class ChooseColor(val color: UnoColor) : BotAction()
    data class ChooseCustomWild(val effect: CustomWildEffect) : BotAction()
    data class ChooseSevenSwap(val targetIndex: Int) : BotAction()
    data class ChooseColorRoulette(val color: UnoColor) : BotAction()
}

object UnoGameEngine {

    fun startNewGame(
        playerCount: Int,
        mode: GameMode,
        rules: GameRules,
        humanPlayerName: String = "You",
        roomCode: String? = null
    ): UnoGameState {
        val minPlayers = if (mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER) 1 else 2
        val totalPlayers = playerCount.coerceIn(minPlayers, 10)

        if (totalPlayers == 1 && (mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER)) {
            val hostPlayer = Player(
                id = "player_0",
                name = humanPlayerName,
                avatar = UnoDeck.AVATAR_LIST[0],
                isHuman = true,
                hand = emptyList(),
                hasCalledUno = false,
                canBePenalizedUno = false,
                pingMs = 0,
                isHost = true,
                isConnected = true
            )
            return UnoGameState(
                players = listOf(hostPlayer),
                currentPlayerIndex = 0,
                direction = TurnDirection.CLOCKWISE,
                drawPile = emptyList(),
                discardPile = emptyList(),
                activeColor = UnoColor.RED,
                pendingDrawStack = 0,
                gamePhase = GamePhase.ROUND_OVER,
                rules = rules,
                mode = mode,
                roomCode = roomCode,
                logs = listOf(GameLogEntry(text = "Room ${roomCode ?: ""} created. Waiting for players... (1/10)"))
            )
        }

        val players = mutableListOf<Player>()
        for (i in 0 until totalPlayers) {
            val isHuman = when (mode) {
                GameMode.SOLO_BOTS -> i == 0
                GameMode.ONLINE_ROOM, GameMode.WLAN_MULTIPLAYER -> true
                GameMode.PASS_AND_PLAY -> true
                GameMode.ALL_BOTS -> false
            }
            val name = when {
                i == 0 -> humanPlayerName
                mode == GameMode.PASS_AND_PLAY -> "Player ${i + 1}"
                mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER -> "Player ${i + 1}"
                else -> UnoDeck.BOT_NAMES[i % UnoDeck.BOT_NAMES.size]
            }
            val avatar = UnoDeck.AVATAR_LIST[i % UnoDeck.AVATAR_LIST.size]

            players.add(
                Player(
                    id = "player_$i",
                    name = name,
                    avatar = avatar,
                    isHuman = isHuman,
                    hand = emptyList(),
                    hasCalledUno = false,
                    canBePenalizedUno = false,
                    pingMs = 0,
                    isHost = (i == 0)
                )
            )
        }

        return startNewGameWithPlayers(players, mode, rules, roomCode)
    }

    fun startNewGameWithPlayers(
        players: List<Player>,
        mode: GameMode,
        rules: GameRules,
        roomCode: String? = null
    ): UnoGameState {
        val totalPlayers = players.size.coerceIn(2, 10)
        val deckCount = if (totalPlayers >= 7 && rules.deckType != DeckType.NO_MERCY_168) 2 else 1
        val initialDeck = UnoDeck.generateDeck(
            deckCount = deckCount,
            includeCustomWilds = rules.includeCustomWilds,
            deckType = rules.deckType
        )

        // Deal initial cards
        val dealtDeck = initialDeck.toMutableList()
        val dealtPlayers = players.map { player ->
            val cards = mutableListOf<UnoCard>()
            for (c in 0 until rules.initialCardsPerPlayer) {
                if (dealtDeck.isNotEmpty()) {
                    cards.add(dealtDeck.removeAt(0))
                }
            }
            player.copy(hand = cards, hasCalledUno = false, canBePenalizedUno = false)
        }

        // Top discard card - ensure it's not a Wild Draw 4, Custom Wild, Shuffle Hands, or high Wild penalty for clean start
        var topCard = dealtDeck.removeAt(0)
        while (topCard.value.isWild || topCard.value.isDrawCard || topCard.value == UnoValue.SKIP_EVERYONE || topCard.value == UnoValue.DISCARD_ALL) {
            dealtDeck.add(topCard)
            dealtDeck.shuffle()
            topCard = dealtDeck.removeAt(0)
        }

        val initialColor = if (topCard.color == UnoColor.WILD) UnoColor.RED else topCard.color
        val deckSummary = when (rules.deckType) {
            DeckType.NO_MERCY_168 -> "No Mercy (168 Cards)"
            DeckType.MODERN_112 -> "Modern (112 Cards)"
            DeckType.CLASSIC_108 -> "Classic (108 Cards)"
        }

        val initialLogs = listOf(
            GameLogEntry(
                text = if (mode == GameMode.ONLINE_ROOM)
                    "Online match started in room ${roomCode ?: "UNO-LIVE"} with $totalPlayers players! [$deckSummary]"
                else if (mode == GameMode.WLAN_MULTIPLAYER)
                    "WLAN match started with $totalPlayers real players! [$deckSummary]"
                else "Game started with $totalPlayers players! [$deckSummary]"
            ),
            GameLogEntry(
                text = "First discard is ${topCard.color.displayName} ${topCard.value.symbol}",
                card = topCard,
                color = initialColor
            )
        )

        val state = UnoGameState(
            players = dealtPlayers,
            currentPlayerIndex = 0,
            direction = TurnDirection.CLOCKWISE,
            drawPile = dealtDeck,
            discardPile = listOf(topCard),
            activeColor = initialColor,
            pendingDrawStack = 0,
            gamePhase = GamePhase.PLAYING,
            rules = rules,
            mode = mode,
            roomCode = roomCode,
            logs = initialLogs,
            passAndPlayHandVisible = mode != GameMode.PASS_AND_PLAY
        )

        return handleInitialCardAction(topCard, state)
    }

    private fun handleInitialCardAction(card: UnoCard, state: UnoGameState): UnoGameState {
        var s = state
        when (card.value) {
            UnoValue.SKIP -> {
                s = advanceTurn(s, skipNext = true)
                s = s.copy(logs = s.logs + GameLogEntry(text = "${s.players[0].name} was skipped by the opening card!"))
            }
            UnoValue.REVERSE -> {
                if (s.players.size == 2) {
                    s = advanceTurn(s, skipNext = true)
                } else {
                    s = s.copy(direction = s.direction.toggled())
                }
                s = s.copy(logs = s.logs + GameLogEntry(text = "Opening card reversed direction!"))
            }
            UnoValue.DRAW_TWO -> {
                s = s.copy(pendingDrawStack = 2)
            }
            else -> {}
        }
        return s
    }

    fun playCard(
        state: UnoGameState,
        playerIndex: Int,
        card: UnoCard,
        chosenColor: UnoColor? = null
    ): UnoGameState {
        if (state.gamePhase != GamePhase.PLAYING) return state
        if (playerIndex != state.currentPlayerIndex) return state

        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.contains(card)) return state

        // Centralized play validation
        val topCard = state.topDiscardCard ?: return state
        val isValid = isCardPlayable(
            card = card,
            topCard = topCard,
            activeColor = state.activeColor,
            pendingDrawStack = state.pendingDrawStack,
            rules = state.rules
        )
        if (!isValid) return state

        // Custom Wild ⚡ handling: prompt specifies Custom Wild has an effect selection modal:
        // Either 🔀 SHUFFLE HANDS or ➕ EVERYONE +4.
        if (card.value == UnoValue.CUSTOM_WILD) {
            if (player.isHuman && state.mode != GameMode.ALL_BOTS) {
                return state.copy(
                    gamePhase = GamePhase.CUSTOM_WILD_EFFECT_SELECTION,
                    pendingCustomWildCard = card,
                    pendingCustomWildPlayerIndex = playerIndex
                )
            } else {
                val botEffect = if (state.players.any { it.id != player.id && it.hand.size <= 3 } && player.hand.size > 3) {
                    CustomWildEffect.SHUFFLE_HANDS
                } else {
                    CustomWildEffect.EVERYONE_PLUS_FOUR
                }
                return executeCustomWildPlay(state, playerIndex, card, botEffect)
            }
        }

        // Dedicated Shuffle Hands 🔀 handling:
        if (card.value == UnoValue.SHUFFLE_HANDS) {
            return executeDedicatedShuffleHandsPlay(state, playerIndex, card)
        }

        // Wild Cards requiring color selection
        val isWildWithColorChoice = card.value.isWild && card.value != UnoValue.CUSTOM_WILD && card.value != UnoValue.SHUFFLE_HANDS
        if (isWildWithColorChoice && chosenColor == null) {
            return state.copy(
                gamePhase = GamePhase.COLOR_SELECTION,
                pendingWildCard = card,
                pendingWildPlayerIndex = playerIndex
            )
        }

        return executeCardPlay(state, playerIndex, card, chosenColor)
    }

    fun completeWildSelection(
        state: UnoGameState,
        chosenColor: UnoColor
    ): UnoGameState {
        val playerIndex = state.pendingWildPlayerIndex ?: return state
        val card = state.pendingWildCard ?: return state
        val updatedState = state.copy(
            gamePhase = GamePhase.PLAYING,
            pendingWildCard = null,
            pendingWildPlayerIndex = null
        )
        return executeCardPlay(updatedState, playerIndex, card, chosenColor)
    }

    fun completeCustomWildSelection(
        state: UnoGameState,
        effect: CustomWildEffect
    ): UnoGameState {
        val playerIndex = state.pendingCustomWildPlayerIndex ?: return state
        val card = state.pendingCustomWildCard ?: return state
        if (state.gamePhase != GamePhase.CUSTOM_WILD_EFFECT_SELECTION) return state
        if (state.currentPlayerIndex != playerIndex) return state
        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.any { it.id == card.id }) return state

        val clearedState = state.copy(
            gamePhase = GamePhase.PLAYING,
            pendingCustomWildCard = null,
            pendingCustomWildPlayerIndex = null
        )
        return executeCustomWildPlay(clearedState, playerIndex, card, effect)
    }

    fun executeCustomWildPlay(
        state: UnoGameState,
        playerIndex: Int,
        card: UnoCard,
        effect: CustomWildEffect
    ): UnoGameState {
        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.any { it.id == card.id }) return state

        val newHand = player.hand.toMutableList().apply {
            val idx = indexOfFirst { it.id == card.id }
            if (idx >= 0) removeAt(idx)
        }

        val updatedPlayer = player.copy(
            hand = newHand,
            canBePenalizedUno = (newHand.size == 1 && !player.hasCalledUno)
        )
        val basePlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }
        val newDiscard = state.discardPile + card

        if (newHand.isEmpty()) {
            val baseState = state.copy(
                players = basePlayers,
                discardPile = newDiscard,
                drawnThisTurn = false,
                cardDrawnThisTurn = null,
                logs = state.logs + GameLogEntry(
                    text = "${player.name} played Custom Wild ⚡ with their last card!",
                    card = card,
                    isAlert = true
                )
            )
            return if (state.rules.gameEndingMode == GameEndingMode.PLAY_UNTIL_LAST_PLAYER) {
                handlePlayerFinished(baseState, playerIndex, updatedPlayer)
            } else {
                handleRoundWon(baseState, updatedPlayer)
            }
        }

        return when (effect) {
            CustomWildEffect.SHUFFLE_HANDS -> {
                val redistributedPlayers = performShuffleHandsRedistribution(basePlayers)
                val log = GameLogEntry(
                    text = "⚡ Custom Wild: ${player.name} triggered 🔀 SHUFFLE HANDS! All active hands were shuffled and redistributed!",
                    card = card,
                    isAlert = true
                )
                val newState = state.copy(
                    players = redistributedPlayers,
                    discardPile = newDiscard,
                    activeColor = state.activeColor,
                    drawnThisTurn = false,
                    cardDrawnThisTurn = null,
                    logs = state.logs + log
                )
                advanceTurn(newState, skipNext = false)
            }

            CustomWildEffect.EVERYONE_PLUS_FOUR -> {
                val existingStack = state.pendingDrawStack
                val nextPlayerIdx = getNextPlayerIndex(state, step = 1)

                var currentDrawPile = state.drawPile.toMutableList()
                var currentDiscardPile = newDiscard.toMutableList()
                val finalPlayers = basePlayers.toMutableList()

                for (i in finalPlayers.indices) {
                    if (i == playerIndex || finalPlayers[i].isEliminated) {
                        continue
                    }
                    val cardsToDraw = if (i == nextPlayerIdx) existingStack + 4 else 4
                    val drawnCards = mutableListOf<UnoCard>()
                    for (c in 0 until cardsToDraw) {
                        if (currentDrawPile.isEmpty()) {
                            if (currentDiscardPile.size > 1) {
                                val top = currentDiscardPile.removeAt(currentDiscardPile.size - 1)
                                currentDrawPile = currentDiscardPile.shuffled().toMutableList()
                                currentDiscardPile = mutableListOf(top)
                            } else {
                                currentDrawPile = UnoDeck.generateDeck(1, includeCustomWilds = false, deckType = state.rules.deckType)
                            }
                        }
                        if (currentDrawPile.isNotEmpty()) {
                            drawnCards.add(currentDrawPile.removeAt(0))
                        }
                    }

                    val targetP = finalPlayers[i]
                    finalPlayers[i] = targetP.copy(
                        hand = targetP.hand + drawnCards,
                        hasCalledUno = false,
                        canBePenalizedUno = false
                    )
                }

                val nextPlayerName = state.players[nextPlayerIdx].name
                val logText = if (existingStack > 0) {
                    "⚡ Custom Wild: ${player.name} triggered ➕ EVERYONE +4! Active stack absorbed: $nextPlayerName drew ${4 + existingStack} cards! All other opponents drew 4 cards!"
                } else {
                    "⚡ Custom Wild: ${player.name} triggered ➕ EVERYONE +4! Every other player drew 4 cards!"
                }

                val log = GameLogEntry(
                    text = logText,
                    card = card,
                    isAlert = true
                )

                val newState = state.copy(
                    players = finalPlayers,
                    drawPile = currentDrawPile,
                    discardPile = currentDiscardPile,
                    activeColor = state.activeColor,
                    pendingDrawStack = 0,
                    drawnThisTurn = false,
                    cardDrawnThisTurn = null,
                    logs = state.logs + log
                )
                advanceTurn(newState, skipNext = true)
            }
        }
    }

    fun executeDedicatedShuffleHandsPlay(
        state: UnoGameState,
        playerIndex: Int,
        card: UnoCard
    ): UnoGameState {
        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.any { it.id == card.id }) return state

        val newHand = player.hand.toMutableList().apply {
            val idx = indexOfFirst { it.id == card.id }
            if (idx >= 0) removeAt(idx)
        }

        val updatedPlayer = player.copy(
            hand = newHand,
            canBePenalizedUno = (newHand.size == 1 && !player.hasCalledUno)
        )
        val basePlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }
        val newDiscard = state.discardPile + card

        if (newHand.isEmpty()) {
            val baseState = state.copy(
                players = basePlayers,
                discardPile = newDiscard,
                drawnThisTurn = false,
                cardDrawnThisTurn = null,
                logs = state.logs + GameLogEntry(
                    text = "${player.name} played 🔀 Shuffle Hands with their last card!",
                    card = card,
                    isAlert = true
                )
            )
            return if (state.rules.gameEndingMode == GameEndingMode.PLAY_UNTIL_LAST_PLAYER) {
                handlePlayerFinished(baseState, playerIndex, updatedPlayer)
            } else {
                handleRoundWon(baseState, updatedPlayer)
            }
        }

        val redistributedPlayers = performShuffleHandsRedistribution(basePlayers)
        val log = GameLogEntry(
            text = "🔀 Shuffle Hands: ${player.name} played Shuffle Hands! All active players' hands were shuffled and redistributed!",
            card = card,
            isAlert = true
        )

        val newState = state.copy(
            players = redistributedPlayers,
            discardPile = newDiscard,
            activeColor = state.activeColor,
            drawnThisTurn = false,
            cardDrawnThisTurn = null,
            logs = state.logs + log
        )
        return advanceTurn(newState, skipNext = false)
    }

    private fun performShuffleHandsRedistribution(basePlayers: List<Player>): List<Player> {
        val activePlayers = basePlayers.filter { !it.isEliminated }
        val targetCounts = activePlayers.map { it.hand.size }
        val pooledCards = activePlayers.flatMap { it.hand }.shuffled().toMutableList()

        val redistributedMap = mutableMapOf<String, List<UnoCard>>()
        activePlayers.forEachIndexed { idx, p ->
            val count = targetCounts[idx]
            val assignedHand = mutableListOf<UnoCard>()
            for (c in 0 until count) {
                if (pooledCards.isNotEmpty()) {
                    assignedHand.add(pooledCards.removeAt(0))
                }
            }
            redistributedMap[p.id] = assignedHand
        }

        return basePlayers.map { p ->
            if (p.isEliminated) {
                p
            } else {
                p.copy(
                    hand = redistributedMap[p.id] ?: emptyList(),
                    hasCalledUno = false,
                    canBePenalizedUno = false
                )
            }
        }
    }

    private fun executeCardPlay(
        state: UnoGameState,
        playerIndex: Int,
        card: UnoCard,
        chosenColor: UnoColor?
    ): UnoGameState {
        val player = state.players[playerIndex]
        val newHand = player.hand.toMutableList().apply { remove(card) }

        val newActiveColor = when {
            card.value.isWild -> chosenColor ?: UnoColor.RED
            else -> card.color
        }

        // NO MERCY: Discard All 🗑 - Discard all cards of the played color from hand!
        val additionalDiscarded = mutableListOf<UnoCard>()
        if (card.value == UnoValue.DISCARD_ALL) {
            val matchingColorCards = newHand.filter { it.color == card.color }
            additionalDiscarded.addAll(matchingColorCards)
            newHand.removeAll(matchingColorCards)
        }

        val hasOneCardLeft = newHand.size == 1
        val canBePenalized = hasOneCardLeft && !player.hasCalledUno

        val updatedPlayer = player.copy(
            hand = newHand,
            canBePenalizedUno = canBePenalized
        )

        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }

        val newDiscard = state.discardPile + card + additionalDiscarded
        var logText = "${player.name} played ${card.color.displayName} ${card.value.symbol}"
        if (card.value == UnoValue.DISCARD_ALL) {
            logText += " 🗑 DISCARD ALL! (Discarded ${additionalDiscarded.size + 1} ${card.color.displayName} cards)"
        } else if (card.value.isWild) {
            logText += " (Color: ${newActiveColor.displayName})"
        }

        var newState = state.copy(
            players = updatedPlayers,
            discardPile = newDiscard,
            activeColor = newActiveColor,
            drawnThisTurn = false,
            cardDrawnThisTurn = null,
            logs = state.logs + GameLogEntry(text = logText, card = card, color = newActiveColor)
        )

        // Check win/finish condition
        if (newHand.isEmpty()) {
            return if (state.rules.gameEndingMode == GameEndingMode.PLAY_UNTIL_LAST_PLAYER) {
                handlePlayerFinished(newState, playerIndex, updatedPlayer)
            } else {
                handleRoundWon(newState, updatedPlayer)
            }
        }

        // Check 7-0 Rule (No Mercy / Spicy House)
        val isNoMercyOrSevenZero = state.rules.deckType == DeckType.NO_MERCY_168 || state.rules.sevenZeroRule
        if (isNoMercyOrSevenZero) {
            if (card.value == UnoValue.SEVEN) {
                if (updatedPlayer.isHuman && state.mode != GameMode.ALL_BOTS) {
                    return newState.copy(
                        gamePhase = GamePhase.HAND_SWAP_SELECTION,
                        pendingSevenPlayerIndex = playerIndex,
                        logs = newState.logs + GameLogEntry(
                            text = "🤝 7's SWAP: ${updatedPlayer.name} played 7! Choose an active player to swap hands with.",
                            isAlert = true
                        )
                    )
                } else {
                    val target = state.players.indices
                        .filter { it != playerIndex && !state.players[it].isEliminated }
                        .minByOrNull { state.players[it].hand.size } ?: getNextPlayerIndex(state, 1)
                    return executeSevenSwap(newState, playerIndex, target)
                }
            } else if (card.value == UnoValue.ZERO) {
                newState = executeZeroRotation(newState)
            }
        }

        // Wild Color Roulette 🎯
        if (card.value == UnoValue.WILD_COLOR_ROULETTE) {
            val targetIdx = getNextPlayerIndex(newState, step = 1)
            val targetPlayer = newState.players[targetIdx]
            if (targetPlayer.isHuman && newState.mode != GameMode.ALL_BOTS) {
                return newState.copy(
                    gamePhase = GamePhase.COLOR_ROULETTE_TARGET_SELECTION,
                    pendingRouletteTargetIndex = targetIdx,
                    logs = newState.logs + GameLogEntry(
                        text = "🎯 Wild Color Roulette! ${targetPlayer.name} must choose a color to draw until it appears!",
                        isAlert = true
                    )
                )
            } else {
                val botChosenColor = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE).random()
                return completeColorRouletteSelection(newState, targetIdx, botChosenColor)
            }
        }

        // Apply remaining card effects and advance turn
        return applyCardEffectsAndAdvance(newState, card)
    }

    fun completeColorRouletteSelection(
        state: UnoGameState,
        targetPlayerIndex: Int,
        chosenColor: UnoColor
    ): UnoGameState {
        val targetPlayer = state.players.getOrNull(targetPlayerIndex) ?: return state
        var drawPile = state.drawPile.toMutableList()
        var discardPile = state.discardPile.toMutableList()

        val revealedCards = mutableListOf<UnoCard>()
        var foundColor = false
        var guard = 0

        while (!foundColor && guard < 180) {
            guard++
            if (drawPile.isEmpty()) {
                if (discardPile.size > 1) {
                    val top = discardPile.removeAt(discardPile.size - 1)
                    drawPile = discardPile.shuffled().toMutableList()
                    discardPile = mutableListOf(top)
                } else {
                    drawPile = UnoDeck.generateDeck(1, includeCustomWilds = false, deckType = state.rules.deckType)
                }
            }
            if (drawPile.isNotEmpty()) {
                val c = drawPile.removeAt(0)
                revealedCards.add(c)
                if (c.color == chosenColor && c.color != UnoColor.WILD) {
                    foundColor = true
                }
            }
        }

        val updatedHand = targetPlayer.hand + revealedCards
        val isMercyEliminated = (state.rules.mercyRule || state.rules.noMercy) && (updatedHand.size >= state.rules.mercyLimit)

        val updatedTarget = targetPlayer.copy(
            hand = updatedHand,
            isEliminated = targetPlayer.isEliminated || isMercyEliminated,
            hasCalledUno = false,
            canBePenalizedUno = false
        )

        val updatedPlayers = state.players.toMutableList().apply {
            this[targetPlayerIndex] = updatedTarget
        }

        val logText = "🎯 Color Roulette: ${targetPlayer.name} chose ${chosenColor.displayName} and drew ${revealedCards.size} cards before finding ${chosenColor.displayName}!"
        val extraLogs = mutableListOf(GameLogEntry(text = logText, isAlert = true))

        if (isMercyEliminated) {
            extraLogs.add(
                GameLogEntry(
                    text = "💀 25-CARD MERCY: ${targetPlayer.name} reached ${updatedHand.size} cards and is ELIMINATED!",
                    isAlert = true
                )
            )
        }

        val stateAfterRoulette = state.copy(
            players = updatedPlayers,
            drawPile = drawPile,
            discardPile = discardPile,
            gamePhase = GamePhase.PLAYING,
            pendingRouletteTargetIndex = null,
            pendingRouletteCardsRevealed = revealedCards,
            logs = state.logs + extraLogs
        )

        // Target loses their turn; advance to player after target
        return advanceTurn(stateAfterRoulette, skipNext = true)
    }

    fun executeSevenSwap(state: UnoGameState, sourceIndex: Int, targetIndex: Int): UnoGameState {
        if (sourceIndex == targetIndex) return state
        val p1 = state.players.getOrNull(sourceIndex) ?: return state
        val p2 = state.players.getOrNull(targetIndex) ?: return state
        if (p1.isEliminated || p2.isEliminated) return state

        val updatedPlayers = state.players.toMutableList().apply {
            this[sourceIndex] = p1.copy(hand = p2.hand, hasCalledUno = false, canBePenalizedUno = false)
            this[targetIndex] = p2.copy(hand = p1.hand, hasCalledUno = false, canBePenalizedUno = false)
        }

        val log = GameLogEntry(
            text = "🤝 7's SWAP: ${p1.name} swapped hands with ${p2.name}!",
            isAlert = true
        )

        val intermediate = state.copy(
            players = updatedPlayers,
            gamePhase = GamePhase.PLAYING,
            pendingSevenPlayerIndex = null,
            logs = state.logs + log
        )

        val top = intermediate.topDiscardCard
        return if (top != null) applyCardEffectsAndAdvance(intermediate, top, alreadyHandledAction = true)
        else advanceTurn(intermediate)
    }

    private fun executeZeroRotation(state: UnoGameState): UnoGameState {
        val activePlayers = state.players.filter { !it.isEliminated }
        val count = activePlayers.size
        if (count <= 1) return state
        val mult = state.direction.multiplier
        val activeHands = activePlayers.map { it.hand }
        val rotatedMap = mutableMapOf<String, List<UnoCard>>()
        activePlayers.forEachIndexed { idx, p ->
            val sourceIdx = (idx - mult + count) % count
            rotatedMap[p.id] = activeHands[sourceIdx]
        }

        val updatedPlayers = state.players.map { player ->
            if (player.isEliminated) player
            else player.copy(hand = rotatedMap[player.id] ?: emptyList(), hasCalledUno = false, canBePenalizedUno = false)
        }

        val log = GameLogEntry(
            text = "🌪️ 0's PASS: All active players passed their hands ${state.direction.name.lowercase()}!",
            isAlert = true
        )
        return state.copy(players = updatedPlayers, logs = state.logs + log)
    }

    private fun applyCardEffectsAndAdvance(
        state: UnoGameState,
        card: UnoCard,
        alreadyHandledAction: Boolean = false
    ): UnoGameState {
        var s = state
        val activeCount = s.players.count { !it.isEliminated }

        if (!alreadyHandledAction) {
            when (card.value) {
                // SKIP EVERYONE ⊘⊘ (No Mercy)
                UnoValue.SKIP_EVERYONE -> {
                    s = s.copy(
                        logs = s.logs + GameLogEntry(
                            text = "⊘⊘ SKIP EVERYONE! ${s.players[s.currentPlayerIndex].name} takes another turn!",
                            isAlert = true
                        )
                    )
                    // Current player immediately plays again! No turn advance.
                    return s
                }

                // REVERSE ⇄
                UnoValue.REVERSE -> {
                    if (activeCount == 2) {
                        s = s.copy(logs = s.logs + GameLogEntry(text = "Reverse in 2-player acts as a Skip!"))
                        return advanceTurn(s, skipNext = true)
                    } else {
                        val newDir = s.direction.toggled()
                        s = s.copy(direction = newDir, logs = s.logs + GameLogEntry(text = "Direction reversed to ${newDir.name.lowercase()}!"))
                        return advanceTurn(s, skipNext = false)
                    }
                }

                // WILD REVERSE DRAW 4 ⇄+4 (No Mercy)
                UnoValue.WILD_REVERSE_DRAW_FOUR -> {
                    // Reverse direction first!
                    val newDir = if (activeCount > 2) s.direction.toggled() else s.direction
                    s = s.copy(direction = newDir)
                    val newStack = s.pendingDrawStack + 4
                    s = s.copy(pendingDrawStack = newStack)

                    val nextIdx = getNextPlayerIndex(s, step = if (activeCount == 2) 2 else 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = (s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy || s.rules.stackingDrawFours) &&
                            nextPlayer.hand.any { it.value.isDrawCard }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                // SKIP ⊘
                UnoValue.SKIP -> {
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val skippedPlayer = s.players[nextIdx]
                    s = s.copy(logs = s.logs + GameLogEntry(text = "${skippedPlayer.name} was skipped!"))
                    return advanceTurn(s, skipNext = true)
                }

                // DRAW 2 (+2)
                UnoValue.DRAW_TWO -> {
                    val newStack = s.pendingDrawStack + 2
                    s = s.copy(pendingDrawStack = newStack)
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val isNoMercy = s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy
                    val canStack = if (isNoMercy) {
                        nextPlayer.hand.any { it.value.isDrawCard }
                    } else {
                        (s.rules.stackingDrawTwos && nextPlayer.hand.any { it.value == UnoValue.DRAW_TWO }) ||
                                (s.rules.stackingDrawFourOnTwo && nextPlayer.hand.any { it.value == UnoValue.WILD_DRAW_FOUR }) ||
                                (s.rules.includeCustomWilds && nextPlayer.hand.any { it.value == UnoValue.CUSTOM_WILD })
                    }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                // DRAW 4 (+4, Colored)
                UnoValue.DRAW_FOUR -> {
                    val newStack = s.pendingDrawStack + 4
                    s = s.copy(pendingDrawStack = newStack)
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = (s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy || s.rules.stackingDrawFours) &&
                            nextPlayer.hand.any { it.value.isDrawCard }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                // WILD DRAW 4 (+4, Wild)
                UnoValue.WILD_DRAW_FOUR -> {
                    val newStack = s.pendingDrawStack + 4
                    s = s.copy(pendingDrawStack = newStack)
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = (s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy || s.rules.stackingDrawFours) &&
                            nextPlayer.hand.any { it.value.isDrawCard }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                // WILD DRAW 6 (+6)
                UnoValue.WILD_DRAW_SIX -> {
                    val newStack = s.pendingDrawStack + 6
                    s = s.copy(pendingDrawStack = newStack)
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = (s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy) &&
                            nextPlayer.hand.any { it.value.isDrawCard }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                // WILD DRAW 10 (+10)
                UnoValue.WILD_DRAW_TEN -> {
                    val newStack = s.pendingDrawStack + 10
                    s = s.copy(pendingDrawStack = newStack)
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = (s.rules.deckType == DeckType.NO_MERCY_168 || s.rules.noMercy) &&
                            nextPlayer.hand.any { it.value.isDrawCard }

                    if (canStack) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }

                else -> {
                    return advanceTurn(s, skipNext = false)
                }
            }
        } else {
            return advanceTurn(s, skipNext = false)
        }
    }

    private fun resolveDrawPenaltyAndAdvance(
        state: UnoGameState,
        targetPlayerIndex: Int,
        cardsToDraw: Int
    ): UnoGameState {
        var (s, _) = drawCardsForPlayer(state, targetPlayerIndex, cardsToDraw)
        val targetPlayer = s.players[targetPlayerIndex]

        s = s.copy(
            pendingDrawStack = 0,
            logs = s.logs + GameLogEntry(
                text = "${targetPlayer.name} drew $cardsToDraw penalty cards and turn was skipped!",
                isAlert = true
            )
        )

        // Check 25-card mercy rule elimination
        val effectiveMercy = s.rules.mercyRule || s.rules.noMercy
        if (effectiveMercy && targetPlayer.hand.size >= s.rules.mercyLimit) {
            val updatedPlayers = s.players.toMutableList().apply {
                this[targetPlayerIndex] = targetPlayer.copy(isEliminated = true)
            }
            s = s.copy(
                players = updatedPlayers,
                logs = s.logs + GameLogEntry(
                    text = "💥 25-Card Mercy: ${targetPlayer.name} reached ${targetPlayer.hand.size} cards and was ELIMINATED!",
                    isAlert = true
                )
            )
        }

        return advanceTurn(s, skipNext = true)
    }

    fun drawCard(state: UnoGameState, playerIndex: Int, autoAdvanceIfUnplayable: Boolean = true): UnoGameState {
        if (state.gamePhase != GamePhase.PLAYING) return state
        if (playerIndex != state.currentPlayerIndex) return state

        // If there's an active stack that wasn't countered with stacking
        if (state.pendingDrawStack > 0) {
            return resolveDrawPenaltyAndAdvance(state, playerIndex, state.pendingDrawStack)
        }

        val topCard = state.topDiscardCard ?: return state

        // Draw exactly ONE card
        val (s, drawnCards) = drawCardsForPlayer(state, playerIndex, 1)
        val drawn = drawnCards.firstOrNull() ?: return s
        val p = s.players[playerIndex]

        val isPlayable = isCardPlayable(
            card = drawn,
            topCard = topCard,
            activeColor = s.activeColor,
            pendingDrawStack = s.pendingDrawStack,
            rules = s.rules
        )

        if (isPlayable) {
            return s.copy(
                drawnThisTurn = true,
                cardDrawnThisTurn = drawn,
                unplayableDrawnNotice = null,
                logs = s.logs + GameLogEntry(
                    text = "${p.name} drew ${drawn.color.displayName} ${drawn.value.symbol} (Playable! Choose to play or end turn)",
                    card = drawn,
                    isAlert = false
                )
            )
        } else {
            val nextState = s.copy(
                drawnThisTurn = false,
                cardDrawnThisTurn = null,
                unplayableDrawnCard = drawn,
                unplayableDrawnNotice = "${drawn.color.displayName} ${drawn.value.symbol} is not playable. Added to hand.",
                logs = s.logs + GameLogEntry(
                    text = "${p.name} drew ${drawn.color.displayName} ${drawn.value.symbol} (Not playable). Turn ends.",
                    card = drawn,
                    isAlert = false
                )
            )
            return if (autoAdvanceIfUnplayable) advanceTurn(nextState) else nextState
        }
    }

    fun passTurn(state: UnoGameState, playerIndex: Int): UnoGameState {
        if (state.gamePhase != GamePhase.PLAYING) return state
        if (playerIndex != state.currentPlayerIndex) return state
        if (!state.drawnThisTurn) return state

        val p = state.players[playerIndex]
        val s = state.copy(
            drawnThisTurn = false,
            cardDrawnThisTurn = null,
            logs = state.logs + GameLogEntry(text = "${p.name} kept the card and ended turn.")
        )
        return advanceTurn(s)
    }

    fun callUno(state: UnoGameState, playerIndex: Int): UnoGameState {
        val player = state.players.getOrNull(playerIndex) ?: return state
        val updatedPlayer = player.copy(hasCalledUno = true, canBePenalizedUno = false)
        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }
        val entry = GameLogEntry(
            text = "🔥 ${player.name} yelled UNO!",
            isAlert = true
        )
        return state.copy(players = updatedPlayers, logs = state.logs + entry)
    }

    fun catchUno(state: UnoGameState, catcherIndex: Int, targetIndex: Int): UnoGameState {
        val catcher = state.players.getOrNull(catcherIndex) ?: return state
        val target = state.players.getOrNull(targetIndex) ?: return state

        if (!target.canBePenalizedUno || target.hand.size != 1 || target.hasCalledUno || target.isEliminated) {
            return state
        }

        val penalty = state.rules.unoPenaltyCards
        val (s, _) = drawCardsForPlayer(state, targetIndex, penalty)
        val penalized = s.players[targetIndex].copy(canBePenalizedUno = false, hasCalledUno = false)
        val updatedPlayers = s.players.toMutableList().apply {
            this[targetIndex] = penalized
        }

        val entry = GameLogEntry(
            text = "🚨 UNO Catch! ${catcher.name} caught ${target.name} without calling UNO! +$penalty cards penalty!",
            isAlert = true
        )
        return s.copy(players = updatedPlayers, logs = state.logs + entry)
    }

    fun jumpIn(state: UnoGameState, playerIndex: Int, card: UnoCard): UnoGameState {
        if (!state.rules.jumpInRule) return state
        if (state.gamePhase != GamePhase.PLAYING) return state
        if (playerIndex == state.currentPlayerIndex) return state

        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.contains(card)) return state

        val top = state.topDiscardCard ?: return state
        if (!card.isExactMatch(top)) return state

        val log = GameLogEntry(
            text = "⚡ Jump-In! ${player.name} jumped in with matching ${card.color.displayName} ${card.value.symbol}!",
            card = card,
            color = card.color,
            isAlert = true
        )

        val stateWithActive = state.copy(
            currentPlayerIndex = playerIndex,
            logs = state.logs + log
        )
        return playCard(stateWithActive, playerIndex, card)
    }

    fun advanceTurn(state: UnoGameState, skipNext: Boolean = false): UnoGameState {
        val step = if (skipNext) 2 else 1
        val nextIndex = getNextPlayerIndex(state, step)

        val nextPlayer = state.players[nextIndex]
        val isPassAndPlay = state.mode == GameMode.PASS_AND_PLAY

        val updatedPlayers = state.players.map {
            if (it.canBePenalizedUno) it.copy(canBePenalizedUno = false) else it
        }

        return state.copy(
            players = updatedPlayers,
            currentPlayerIndex = nextIndex,
            drawnThisTurn = false,
            cardDrawnThisTurn = null,
            unplayableDrawnCard = null,
            unplayableDrawnNotice = null,
            passAndPlayHandVisible = !isPassAndPlay || !nextPlayer.isHuman,
            lastActionTimestamp = System.currentTimeMillis()
        )
    }

    fun togglePassAndPlayVisibility(state: UnoGameState): UnoGameState {
        return state.copy(passAndPlayHandVisible = !state.passAndPlayHandVisible)
    }

    private fun getNextPlayerIndex(state: UnoGameState, step: Int = 1): Int {
        val total = state.players.size
        if (total == 0) return 0
        val mult = state.direction.multiplier
        var index = state.currentPlayerIndex
        var activeSteps = 0
        var guard = 0
        while (activeSteps < step && guard < total * 3) {
            index = (index + mult) % total
            if (index < 0) index += total
            if (!state.players[index].isEliminated) {
                activeSteps++
            }
            guard++
        }
        return index
    }

    private fun handlePlayerFinished(
        state: UnoGameState,
        playerIndex: Int,
        finishedPlayer: Player
    ): UnoGameState {
        val nextRank = state.finishingOrder.size + 1
        val rankedPlayer = finishedPlayer.copy(
            finishRank = nextRank,
            isEliminated = true,
            hand = emptyList(),
            canBePenalizedUno = false,
            hasCalledUno = false
        )
        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = rankedPlayer
        }
        val newFinishingOrder = state.finishingOrder + rankedPlayer

        val activeRemaining = updatedPlayers.filter { !it.isEliminated }

        val rankSuffix = when (nextRank) {
            1 -> "1st 🥇"
            2 -> "2nd 🥈"
            3 -> "3rd 🥉"
            else -> "${nextRank}th"
        }

        if (activeRemaining.size <= 1) {
            val lastActive = activeRemaining.firstOrNull()
            val finalRank = nextRank + 1
            val finalPlayers = if (lastActive != null) {
                val lastRanked = lastActive.copy(
                    finishRank = finalRank,
                    isEliminated = true
                )
                val lastIdx = updatedPlayers.indexOfFirst { it.id == lastActive.id }
                if (lastIdx >= 0) updatedPlayers[lastIdx] = lastRanked
                updatedPlayers
            } else {
                updatedPlayers
            }
            val completeOrder = if (lastActive != null) {
                newFinishingOrder + lastActive.copy(finishRank = finalRank, isEliminated = true)
            } else {
                newFinishingOrder
            }

            val gameOverLog = GameLogEntry(
                text = "🏆 ALL PLAYERS FINISHED! 1st: ${newFinishingOrder.first().name}, Last: ${lastActive?.name ?: ""}",
                isAlert = true
            )

            return state.copy(
                players = finalPlayers,
                finishingOrder = completeOrder,
                winner = completeOrder.firstOrNull(),
                gamePhase = GamePhase.MATCH_OVER,
                logs = state.logs + GameLogEntry(
                    text = "🎉 ${finishedPlayer.name} placed $rankSuffix!",
                    isAlert = true
                ) + gameOverLog
            )
        }

        val log = GameLogEntry(
            text = "🎉 ${finishedPlayer.name} finished all cards! Placed $rankSuffix (${activeRemaining.size} active players remaining)",
            isAlert = true
        )

        val intermediateState = state.copy(
            players = updatedPlayers,
            finishingOrder = newFinishingOrder,
            logs = state.logs + log
        )

        return advanceTurn(intermediateState, skipNext = false)
    }

    private fun drawCardsForPlayer(
        state: UnoGameState,
        playerIndex: Int,
        count: Int
    ): Pair<UnoGameState, List<UnoCard>> {
        var drawPile = state.drawPile.toMutableList()
        var discardPile = state.discardPile.toMutableList()

        val drawn = mutableListOf<UnoCard>()
        for (i in 0 until count) {
            if (drawPile.isEmpty()) {
                if (discardPile.size > 1) {
                    val top = discardPile.removeAt(discardPile.size - 1)
                    drawPile = discardPile.shuffled().toMutableList()
                    discardPile = mutableListOf(top)
                } else {
                    drawPile = UnoDeck.generateDeck(
                        deckCount = 1,
                        includeCustomWilds = state.rules.includeCustomWilds,
                        deckType = state.rules.deckType
                    )
                }
            }
            if (drawPile.isNotEmpty()) {
                drawn.add(drawPile.removeAt(0))
            }
        }

        val player = state.players[playerIndex]
        val updatedHand = player.hand + drawn
        val effectiveMercy = state.rules.noMercy || state.rules.mercyRule
        val isMercyEliminated = effectiveMercy && (updatedHand.size >= state.rules.mercyLimit)

        val updatedPlayer = player.copy(
            hand = updatedHand,
            isEliminated = player.isEliminated || isMercyEliminated,
            hasCalledUno = false,
            canBePenalizedUno = false
        )
        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }

        val extraLogs = if (isMercyEliminated && !player.isEliminated) {
            listOf(
                GameLogEntry(
                    text = "💀 NO MERCY! ${player.name} reached ${updatedHand.size} cards (limit: ${state.rules.mercyLimit}) and is ELIMINATED!",
                    isAlert = true
                )
            )
        } else emptyList()

        val s = state.copy(
            players = updatedPlayers,
            drawPile = drawPile,
            discardPile = discardPile,
            logs = state.logs + extraLogs
        )
        return Pair(s, drawn)
    }

    private fun handleRoundWon(state: UnoGameState, winner: Player): UnoGameState {
        var pointsScored = 0
        state.players.forEach { p ->
            if (p.id != winner.id) {
                pointsScored += p.hand.sumOf { it.value.points }
            }
        }

        val updatedWinner = winner.copy(score = winner.score + pointsScored)
        val updatedPlayers = state.players.map { if (it.id == winner.id) updatedWinner else it }

        val isMatchOver = updatedWinner.score >= state.rules.targetScore
        val phase = if (isMatchOver) GamePhase.MATCH_OVER else GamePhase.ROUND_OVER

        val winLog = GameLogEntry(
            text = "🏆 ${winner.name} won the round with +$pointsScored points! (Total: ${updatedWinner.score})",
            isAlert = true
        )

        return state.copy(
            players = updatedPlayers,
            winner = updatedWinner,
            gamePhase = phase,
            logs = state.logs + winLog
        )
    }

    // Bot AI decision logic
    fun getBotMove(state: UnoGameState): BotAction? {
        val currIdx = state.currentPlayerIndex
        val bot = state.players.getOrNull(currIdx) ?: return null
        if (bot.isHuman && state.mode != GameMode.ALL_BOTS) return null

        // Color Roulette target selection
        if (state.gamePhase == GamePhase.COLOR_ROULETTE_TARGET_SELECTION && state.pendingRouletteTargetIndex == currIdx) {
            val color = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE).random()
            return BotAction.ChooseColorRoulette(color)
        }

        // 7-Swap selection
        if (state.gamePhase == GamePhase.HAND_SWAP_SELECTION && state.pendingSevenPlayerIndex == currIdx) {
            val target = state.players.indices
                .filter { it != currIdx && !state.players[it].isEliminated }
                .minByOrNull { state.players[it].hand.size } ?: getNextPlayerIndex(state, 1)
            return BotAction.ChooseSevenSwap(target)
        }

        // Custom Wild selection
        if (state.gamePhase == GamePhase.CUSTOM_WILD_EFFECT_SELECTION) {
            val pendingIndex = state.pendingCustomWildPlayerIndex ?: return null
            if (pendingIndex == currIdx) {
                val botEffect = if (state.players.any { it.id != bot.id && it.hand.size <= 3 } && bot.hand.size > 3) {
                    CustomWildEffect.SHUFFLE_HANDS
                } else {
                    CustomWildEffect.EVERYONE_PLUS_FOUR
                }
                return BotAction.ChooseCustomWild(botEffect)
            }
            return null
        }

        val top = state.topDiscardCard ?: return null

        // If bot previously drew a playable card this turn, play it or pass
        if (state.drawnThisTurn) {
            val drawn = state.cardDrawnThisTurn
            if (drawn != null && isCardPlayable(drawn, top, state.activeColor, state.pendingDrawStack, state.rules)) {
                val chosenColor = if (drawn.value.isWild) {
                    val colorCounts = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)
                        .associateWith { col -> bot.hand.count { it.color == col } }
                    colorCounts.maxByOrNull { it.value }?.key ?: UnoColor.RED
                } else null
                return BotAction.Play(drawn, chosenColor)
            } else {
                return BotAction.Pass
            }
        }

        // Check if bot needs to call UNO
        if (bot.hand.size == 2 && !bot.hasCalledUno) {
            if (Math.random() < 0.85) {
                return BotAction.CallUno(currIdx)
            }
        }

        // Check if bot can catch an opponent who forgot UNO
        val catchTarget = state.players.indexOfFirst { it.canBePenalizedUno && it.hand.size == 1 && it.id != bot.id }
        if (catchTarget >= 0 && Math.random() < 0.70) {
            return BotAction.CatchUno(catchTarget)
        }

        // Find playable cards
        val playableCards = bot.hand.filter {
            isCardPlayable(it, top, state.activeColor, state.pendingDrawStack, state.rules)
        }

        if (playableCards.isNotEmpty()) {
            val selectedCard = when {
                state.pendingDrawStack > 0 -> {
                    playableCards.firstOrNull { it.value.isDrawCard } ?: playableCards.first()
                }
                else -> {
                    playableCards.filter { !it.value.isWild }.maxByOrNull { it.value.points }
                        ?: playableCards.first()
                }
            }

            val chosenColor = if (selectedCard.value.isWild) {
                val colorCounts = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)
                    .associateWith { col -> bot.hand.count { it.color == col } }
                colorCounts.maxByOrNull { it.value }?.key ?: UnoColor.RED
            } else null

            return BotAction.Play(selectedCard, chosenColor)
        } else {
            return BotAction.Draw
        }
    }
}
