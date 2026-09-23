package com.example.engine

import com.example.model.CustomWildEffect
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
    val drawnThisTurn: Boolean = false,
    val cardDrawnThisTurn: UnoCard? = null,
    val passAndPlayHandVisible: Boolean = false,
    val roomCode: String? = null,
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
}

object UnoGameEngine {

    fun startNewGame(
        playerCount: Int,
        mode: GameMode,
        rules: GameRules,
        humanPlayerName: String = "You",
        roomCode: String? = null
    ): UnoGameState {
        val totalPlayers = playerCount.coerceIn(2, 10)
        val deckCount = if (totalPlayers >= 7) 2 else 1
        val initialDeck = UnoDeck.generateDeck(deckCount, includeCustomWilds = rules.includeCustomWilds)

        val players = mutableListOf<Player>()
        for (i in 0 until totalPlayers) {
            val isHuman = when (mode) {
                GameMode.SOLO_BOTS -> i == 0
                GameMode.ONLINE_ROOM, GameMode.WLAN_MULTIPLAYER -> i == 0 // In online/WLAN room, Player 0 is local user, others connected
                GameMode.PASS_AND_PLAY -> true
                GameMode.ALL_BOTS -> false
            }
            val name = when {
                i == 0 && (mode == GameMode.SOLO_BOTS || mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER) -> humanPlayerName
                mode == GameMode.PASS_AND_PLAY -> "Player ${i + 1}"
                mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER -> UnoDeck.ONLINE_USERNAMES[i % UnoDeck.ONLINE_USERNAMES.size]
                else -> UnoDeck.BOT_NAMES[i % UnoDeck.BOT_NAMES.size]
            }
            val avatar = UnoDeck.AVATAR_LIST[i % UnoDeck.AVATAR_LIST.size]
            val ping = if (mode == GameMode.ONLINE_ROOM || mode == GameMode.WLAN_MULTIPLAYER) (20 + (i * 7) % 35) else 0

            players.add(
                Player(
                    id = "player_$i",
                    name = name,
                    avatar = avatar,
                    isHuman = isHuman,
                    hand = emptyList(),
                    hasCalledUno = false,
                    canBePenalizedUno = false,
                    pingMs = ping
                )
            )
        }

        // Deal cards
        val dealtDeck = initialDeck.toMutableList()
        val dealtPlayers = players.map { player ->
            val cards = mutableListOf<UnoCard>()
            for (c in 0 until rules.initialCardsPerPlayer) {
                if (dealtDeck.isNotEmpty()) {
                    cards.add(dealtDeck.removeAt(0))
                }
            }
            player.copy(hand = cards)
        }

        // Top discard card - ensure it's not a Wild Draw 4 or Custom Wild for clean starting play
        var topCard = dealtDeck.removeAt(0)
        while (topCard.value == UnoValue.WILD_DRAW_FOUR || topCard.value == UnoValue.CUSTOM_WILD) {
            dealtDeck.add(topCard)
            dealtDeck.shuffle()
            topCard = dealtDeck.removeAt(0)
        }

        val initialColor = if (topCard.color == UnoColor.WILD) UnoColor.RED else topCard.color
        val initialLogs = listOf(
            GameLogEntry(
                text = if (mode == GameMode.ONLINE_ROOM)
                    "Online match started in room ${roomCode ?: "UNO-LIVE"} with $totalPlayers players!"
                else "Game started with $totalPlayers players!"
            ),
            GameLogEntry(
                text = "First discard is ${topCard.color.displayName} ${topCard.value.symbol}",
                card = topCard,
                color = initialColor
            )
        )

        var state = UnoGameState(
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

        // Handle first card action if it's an action card
        state = handleInitialCardAction(topCard, state)
        return state
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

        val player = state.players[playerIndex]
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

        // Custom Wild ⚡ handling: prompt specifies Custom Wild is NOT a normal wild.
        // It does NOT choose a color. It triggers an effect selection modal:
        // Either 🔀 SHUFFLE HANDS or ➕ EVERYONE +4.
        if (card.value == UnoValue.CUSTOM_WILD) {
            val player = state.players[playerIndex]
            if (player.isHuman && state.mode != GameMode.ALL_BOTS) {
                return state.copy(
                    gamePhase = GamePhase.CUSTOM_WILD_EFFECT_SELECTION,
                    pendingCustomWildCard = card,
                    pendingCustomWildPlayerIndex = playerIndex
                )
            } else {
                // Bot decision: choose Shuffle Hands if opponents have small hands and bot has large hand, else Everyone +4
                val botEffect = if (state.players.any { it.id != player.id && it.hand.size <= 3 } && player.hand.size > 3) {
                    CustomWildEffect.SHUFFLE_HANDS
                } else {
                    CustomWildEffect.EVERYONE_PLUS_FOUR
                }
                return executeCustomWildPlay(state, playerIndex, card, botEffect)
            }
        }

        // Standard Wild & Wild Draw Four color choice handling
        if ((card.value == UnoValue.WILD || card.value == UnoValue.WILD_DRAW_FOUR) && chosenColor == null) {
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
        // Server validation (Section 12)
        if (state.gamePhase != GamePhase.CUSTOM_WILD_EFFECT_SELECTION) return state
        if (state.currentPlayerIndex != playerIndex) return state
        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.any { it.id == card.id }) return state
        if (effect != CustomWildEffect.SHUFFLE_HANDS && effect != CustomWildEffect.EVERYONE_PLUS_FOUR) return state

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
        // Section 12: Validate effect is one of the two allowed types
        if (effect != CustomWildEffect.SHUFFLE_HANDS && effect != CustomWildEffect.EVERYONE_PLUS_FOUR) {
            return state
        }
        val player = state.players.getOrNull(playerIndex) ?: return state
        if (!player.hand.any { it.id == card.id }) return state

        // Remove card from player's hand and put into discard pile
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

        // If player played their last card, handle win immediately
        if (newHand.isEmpty()) {
            val winState = state.copy(
                players = basePlayers,
                discardPile = newDiscard,
                drawnThisTurn = false,
                cardDrawnThisTurn = null,
                logs = state.logs + GameLogEntry(
                    text = "${player.name} played Custom Wild ⚡ and won the round!",
                    card = card,
                    isAlert = true
                )
            )
            return handleRoundWon(winState, updatedPlayer)
        }

        return when (effect) {
            CustomWildEffect.SHUFFLE_HANDS -> {
                // Section 5: SHUFFLE HANDS
                // 1. Collect all cards currently held by every player.
                // 2. Shuffle those cards.
                // 3. Redistribute the cards among the same players.
                // 4. Preserve each player's current card count.
                // 5. Update all players' hands.
                // 6. Update all card counts.
                // 7. Never expose another player's private cards.
                val targetCounts = basePlayers.map { it.hand.size }
                val pooledCards = basePlayers.flatMap { it.hand }.shuffled().toMutableList()

                val redistributedPlayers = basePlayers.mapIndexed { idx, p ->
                    val count = targetCounts[idx]
                    val assignedHand = mutableListOf<UnoCard>()
                    for (c in 0 until count) {
                        assignedHand.add(pooledCards.removeAt(0))
                    }
                    p.copy(
                        hand = assignedHand,
                        hasCalledUno = false,
                        canBePenalizedUno = false
                    )
                }

                val log = GameLogEntry(
                    text = "⚡ Custom Wild: ${player.name} triggered 🔀 SHUFFLE HANDS! All hands were shuffled and redistributed while preserving card counts!",
                    card = card,
                    isAlert = true
                )

                val newState = state.copy(
                    players = redistributedPlayers,
                    discardPile = newDiscard,
                    // Custom Wild does NOT automatically change color (Section 8)
                    activeColor = state.activeColor,
                    drawnThisTurn = false,
                    cardDrawnThisTurn = null,
                    logs = state.logs + log
                )
                advanceTurn(newState, skipNext = false)
            }

            CustomWildEffect.EVERYONE_PLUS_FOUR -> {
                // Section 6 & 7: EVERYONE +4 WITH ACTIVE STACK
                // Player who played Custom Wild receives 0 cards.
                // Every other player receives 4 cards.
                // If there is an active stack (existingStack > 0):
                // Next player receives existingStack + 4 cards.
                // Every other player receives 4 cards.
                // pendingDrawStack is reset to 0 (stacking chain ends).
                val existingStack = state.pendingDrawStack
                val nextPlayerIdx = getNextPlayerIndex(state, step = 1)

                var currentDrawPile = state.drawPile.toMutableList()
                var currentDiscardPile = newDiscard.toMutableList()
                val finalPlayers = basePlayers.toMutableList()

                for (i in finalPlayers.indices) {
                    if (i == playerIndex) {
                        // User who played Custom Wild receives 0 cards
                        continue
                    }

                    val cardsToDraw = if (i == nextPlayerIdx) {
                        4 + existingStack
                    } else {
                        4
                    }

                    val drawnCards = mutableListOf<UnoCard>()
                    for (c in 0 until cardsToDraw) {
                        if (currentDrawPile.isEmpty()) {
                            if (currentDiscardPile.size > 1) {
                                val top = currentDiscardPile.removeAt(currentDiscardPile.size - 1)
                                currentDrawPile = currentDiscardPile.shuffled().toMutableList()
                                currentDiscardPile = mutableListOf(top)
                            } else {
                                currentDrawPile = UnoDeck.generateDeck(1, includeCustomWilds = false)
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
                    pendingDrawStack = 0, // Stacking chain ends!
                    drawnThisTurn = false,
                    cardDrawnThisTurn = null,
                    logs = state.logs + log
                )

                if (existingStack > 0) {
                    // Next player ate the stacked draw penalty and is skipped
                    advanceTurn(newState, skipNext = true)
                } else {
                    // No stack existed; turn advances to next player normally (no skip)
                    advanceTurn(newState, skipNext = false)
                }
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

        // Uno penalty eligibility check
        val hasOneCardLeft = newHand.size == 1
        val canBePenalized = hasOneCardLeft && !player.hasCalledUno

        val updatedPlayer = player.copy(
            hand = newHand,
            canBePenalizedUno = canBePenalized
        )

        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }

        val newDiscard = state.discardPile + card
        var logText = "${player.name} played ${card.color.displayName} ${card.value.symbol}"
        if (card.value.isWild) {
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

        // Check if player won round
        if (newHand.isEmpty()) {
            return handleRoundWon(newState, updatedPlayer)
        }

        // Check 7-0 house rule
        if (state.rules.sevenZeroRule) {
            if (card.value == UnoValue.SEVEN) {
                if (updatedPlayer.isHuman && state.mode != GameMode.ALL_BOTS) {
                    return newState.copy(
                        gamePhase = GamePhase.HAND_SWAP_SELECTION,
                        pendingSevenPlayerIndex = playerIndex,
                        logs = newState.logs + GameLogEntry(
                            text = "${updatedPlayer.name} played 7! Choose a player to swap hands with.",
                            isAlert = true
                        )
                    )
                } else {
                    val target = state.players.indices
                        .filter { it != playerIndex }
                        .minByOrNull { state.players[it].hand.size } ?: ((playerIndex + 1) % state.players.size)
                    return executeSevenSwap(newState, playerIndex, target)
                }
            } else if (card.value == UnoValue.ZERO) {
                newState = executeZeroRotation(newState)
            }
        }

        // Apply normal card effects
        return applyCardEffectsAndAdvance(newState, card)
    }

    fun executeSevenSwap(state: UnoGameState, sourceIndex: Int, targetIndex: Int): UnoGameState {
        if (sourceIndex == targetIndex) return state
        val p1 = state.players[sourceIndex]
        val p2 = state.players[targetIndex]

        val updatedPlayers = state.players.toMutableList().apply {
            this[sourceIndex] = p1.copy(hand = p2.hand, hasCalledUno = false, canBePenalizedUno = false)
            this[targetIndex] = p2.copy(hand = p1.hand, hasCalledUno = false, canBePenalizedUno = false)
        }

        val log = GameLogEntry(
            text = "🤝 7-Rule Swap: ${p1.name} swapped hands with ${p2.name}!",
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
        val count = state.players.size
        val mult = state.direction.multiplier
        val hands = state.players.map { it.hand }

        val updatedPlayers = state.players.mapIndexed { idx, player ->
            val sourceIdx = (idx - mult + count) % count
            player.copy(hand = hands[sourceIdx], hasCalledUno = false, canBePenalizedUno = false)
        }

        val log = GameLogEntry(
            text = "🌪️ 0-Rule: All players passed hands ${state.direction.name.lowercase()}!",
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
        val isTwoPlayers = s.players.size == 2

        if (!alreadyHandledAction) {
            when (card.value) {
                UnoValue.REVERSE -> {
                    if (isTwoPlayers) {
                        s = s.copy(logs = s.logs + GameLogEntry(text = "Reverse in 2-player acts as a Skip!"))
                        return advanceTurn(s, skipNext = true)
                    } else {
                        val newDir = s.direction.toggled()
                        s = s.copy(direction = newDir, logs = s.logs + GameLogEntry(text = "Direction reversed to ${newDir.name.lowercase()}!"))
                        return advanceTurn(s, skipNext = false)
                    }
                }
                UnoValue.SKIP -> {
                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val skippedPlayer = s.players[nextIdx]
                    s = s.copy(logs = s.logs + GameLogEntry(text = "${skippedPlayer.name} was skipped!"))
                    return advanceTurn(s, skipNext = true)
                }
                UnoValue.DRAW_TWO -> {
                    val newStack = s.pendingDrawStack + 2
                    s = s.copy(pendingDrawStack = newStack)

                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    // Check if next player can stack
                    val canStack = s.rules.stackingDrawTwos && nextPlayer.hand.any { it.value == UnoValue.DRAW_TWO }
                    val canStackFour = s.rules.stackingDrawFourOnTwo && nextPlayer.hand.any { it.value == UnoValue.WILD_DRAW_FOUR }

                    if (canStack || canStackFour) {
                        return advanceTurn(s, skipNext = false)
                    } else {
                        return resolveDrawPenaltyAndAdvance(s, nextIdx, newStack)
                    }
                }
                UnoValue.WILD_DRAW_FOUR -> {
                    val newStack = s.pendingDrawStack + 4
                    s = s.copy(pendingDrawStack = newStack)

                    val nextIdx = getNextPlayerIndex(s, step = 1)
                    val nextPlayer = s.players[nextIdx]

                    val canStack = s.rules.stackingDrawFours && nextPlayer.hand.any { it.value == UnoValue.WILD_DRAW_FOUR }

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

        // Check mercy rule
        if (s.rules.mercyRule && targetPlayer.hand.size >= s.rules.mercyLimit) {
            val updatedPlayers = s.players.toMutableList().apply {
                this[targetPlayerIndex] = targetPlayer.copy(isEliminated = true)
            }
            s = s.copy(
                players = updatedPlayers,
                logs = s.logs + GameLogEntry(
                    text = "💥 Mercy Rule: ${targetPlayer.name} was eliminated with ${targetPlayer.hand.size} cards!",
                    isAlert = true
                )
            )
        }

        return advanceTurn(s, skipNext = true)
    }

    /**
     * EXACT DRAW RULE:
     * When player has no playable card (or chooses to draw):
     * 1. Draw ONE card.
     * 2. Immediately check if newly drawn card is playable.
     * 3. If playable:
     *    - Card remains in hand
     *    - Turn does NOT end; player MAY choose to play it OR end turn (pass).
     * 4. If NOT playable:
     *    - Card remains in hand
     *    - Turn AUTOMATICALLY ends (advances to next player).
     */
    fun drawCard(state: UnoGameState, playerIndex: Int): UnoGameState {
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
            // Drawn card IS playable: player has choice to PLAY it or END TURN
            return s.copy(
                drawnThisTurn = true,
                cardDrawnThisTurn = drawn,
                logs = s.logs + GameLogEntry(
                    text = "${p.name} drew ${drawn.color.displayName} ${drawn.value.symbol} (Playable! Choose to play or end turn)",
                    card = drawn,
                    isAlert = false
                )
            )
        } else {
            // Drawn card is NOT playable: stays in hand, turn automatically ends!
            val nextState = s.copy(
                drawnThisTurn = false,
                cardDrawnThisTurn = null,
                logs = s.logs + GameLogEntry(
                    text = "${p.name} drew ${drawn.color.displayName} ${drawn.value.symbol} (Not playable). Turn ends.",
                    card = drawn,
                    isAlert = false
                )
            )
            return advanceTurn(nextState)
        }
    }

    /**
     * Pass turn when player drew a playable card but chooses NOT to play it.
     */
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

        if (!target.canBePenalizedUno || target.hand.size != 1) return state

        val penalty = state.rules.unoPenaltyCards
        val (s, _) = drawCardsForPlayer(state, targetIndex, penalty)
        val penalized = s.players[targetIndex].copy(canBePenalizedUno = false, hasCalledUno = false)
        val updatedPlayers = s.players.toMutableList().apply {
            this[targetIndex] = penalized
        }

        val entry = GameLogEntry(
            text = "🚨 ${catcher.name} caught ${target.name} not calling UNO! +$penalty cards penalty!",
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

    private fun advanceTurn(state: UnoGameState, skipNext: Boolean = false): UnoGameState {
        val step = if (skipNext) 2 else 1
        val nextIndex = getNextPlayerIndex(state, step)

        val nextPlayer = state.players[nextIndex]
        val isPassAndPlay = state.mode == GameMode.PASS_AND_PLAY

        return state.copy(
            currentPlayerIndex = nextIndex,
            drawnThisTurn = false,
            cardDrawnThisTurn = null,
            passAndPlayHandVisible = !isPassAndPlay || !nextPlayer.isHuman,
            lastActionTimestamp = System.currentTimeMillis()
        )
    }

    fun togglePassAndPlayVisibility(state: UnoGameState): UnoGameState {
        return state.copy(passAndPlayHandVisible = !state.passAndPlayHandVisible)
    }

    private fun getNextPlayerIndex(state: UnoGameState, step: Int = 1): Int {
        val total = state.players.size
        val mult = state.direction.multiplier
        var index = (state.currentPlayerIndex + (step * mult)) % total
        while (index < 0) {
            index += total
        }

        var guard = 0
        while (state.players[index].isEliminated && guard < total) {
            index = (index + mult) % total
            if (index < 0) index += total
            guard++
        }
        return index
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
                    drawPile = UnoDeck.generateDeck(1, includeCustomWilds = state.rules.includeCustomWilds)
                }
            }
            if (drawPile.isNotEmpty()) {
                drawn.add(drawPile.removeAt(0))
            }
        }

        val player = state.players[playerIndex]
        val updatedPlayer = player.copy(
            hand = player.hand + drawn,
            hasCalledUno = false,
            canBePenalizedUno = false
        )
        val updatedPlayers = state.players.toMutableList().apply {
            this[playerIndex] = updatedPlayer
        }

        val s = state.copy(
            players = updatedPlayers,
            drawPile = drawPile,
            discardPile = discardPile
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

        // If in custom wild effect selection phase
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

        // Check if bot needs to call UNO (at 2 cards about to play 1, or currently at 1)
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
                    playableCards.firstOrNull { it.value == UnoValue.DRAW_TWO }
                        ?: playableCards.firstOrNull { it.value == UnoValue.WILD_DRAW_FOUR }
                        ?: playableCards.first()
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
