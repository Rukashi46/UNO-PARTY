package com.example.model

import androidx.compose.ui.graphics.Color

enum class UnoColor(val displayName: String, val composeColor: Color, val darkColor: Color) {
    RED("Red", Color(0xFFE53935), Color(0xFFB71C1C)),
    YELLOW("Yellow", Color(0xFFFDD835), Color(0xFFF57F17)),
    GREEN("Green", Color(0xFF43A047), Color(0xFF1B5E20)),
    BLUE("Blue", Color(0xFF1E88E5), Color(0xFF0D47A1)),
    WILD("Wild", Color(0xFF263238), Color(0xFF102027))
}

enum class UnoValue(val symbol: String, val points: Int, val isAction: Boolean, val isWild: Boolean) {
    ZERO("0", 0, false, false),
    ONE("1", 1, false, false),
    TWO("2", 2, false, false),
    THREE("3", 3, false, false),
    FOUR("4", 4, false, false),
    FIVE("5", 5, false, false),
    SIX("6", 6, false, false),
    SEVEN("7", 7, false, false),
    EIGHT("8", 8, false, false),
    NINE("9", 9, false, false),
    SKIP("⊘", 20, true, false),
    REVERSE("⇄", 20, true, false),
    DRAW_TWO("+2", 20, true, false),
    WILD("★", 50, false, true),
    WILD_DRAW_FOUR("+4", 50, true, true),
    CUSTOM_WILD("⚡", 50, true, true),
    SHUFFLE_HANDS("🔀", 40, true, true);

    val isNumber: Boolean get() = this in ZERO..NINE
}

/**
 * Centralized rule-checking function:
 * A card is playable if:
 * 1. Card color matches active color
 * OR
 * 2. Card number matches active number
 * OR
 * 3. Card action matches active action (e.g. SKIP on SKIP, REVERSE on REVERSE, DRAW_TWO on DRAW_TWO)
 * OR
 * 4. Card is Wild
 * OR
 * 5. Card is Custom Wild
 * OR
 * 6. Card is a valid stacking card according to stacking rules
 */
fun isCardPlayable(
    card: UnoCard,
    topCard: UnoCard,
    activeColor: UnoColor,
    pendingDrawStack: Int = 0,
    rules: GameRules = GameRules()
): Boolean {
    // 6. Stacking check if there is an active penalty stack (+2 or +4)
    if (pendingDrawStack > 0) {
        // Section 7: If there is an active stack, the player MAY play Custom Wild ⚡
        if (card.value == UnoValue.CUSTOM_WILD) return true

        if (topCard.value == UnoValue.DRAW_TWO) {
            if (rules.stackingDrawTwos && card.value == UnoValue.DRAW_TWO) return true
            if (rules.stackingDrawFourOnTwo && card.value == UnoValue.WILD_DRAW_FOUR) return true
            return false
        }
        if (topCard.value == UnoValue.WILD_DRAW_FOUR) {
            if (rules.stackingDrawFours && card.value == UnoValue.WILD_DRAW_FOUR) return true
            return false
        }
        return false
    }

    // 4 & 5. Wild cards and Custom Wild cards can always be played
    if (card.value.isWild) return true

    // 1. Color matches active color
    if (card.color == activeColor) return true

    // 2. Number matches active number
    if (card.value.isNumber && topCard.value.isNumber && card.value == topCard.value) return true

    // 3. Action matches active action (even when color is different!)
    // e.g. RED SKIP on BLUE SKIP, RED REVERSE on BLUE REVERSE, RED +2 on BLUE +2
    if (card.value.isAction && topCard.value.isAction && card.value == topCard.value) return true

    return false
}

data class UnoCard(
    val id: String,
    val color: UnoColor,
    val value: UnoValue
) {
    fun canPlayOn(
        topCard: UnoCard,
        activeColor: UnoColor,
        pendingDrawStack: Int = 0,
        rules: GameRules = GameRules()
    ): Boolean = isCardPlayable(this, topCard, activeColor, pendingDrawStack, rules)

    val isExactMatch: (UnoCard) -> Boolean = { other ->
        color == other.color && value == other.value
    }
}

data class Player(
    val id: String,
    val name: String,
    val avatar: String,
    val isHuman: Boolean,
    val hand: List<UnoCard> = emptyList(),
    val networkCardCount: Int? = null,
    val hasCalledUno: Boolean = false,
    val canBePenalizedUno: Boolean = false,
    val score: Int = 0,
    val isEliminated: Boolean = false,
    val pingMs: Int = 0,
    val isHost: Boolean = false,
    val isConnected: Boolean = true,
    val isReconnecting: Boolean = false,
    val finishRank: Int? = null
) {
    val cardCount: Int get() = networkCardCount ?: hand.size
    val isFinished: Boolean get() = finishRank != null || isEliminated
}

enum class GameEndingMode(val label: String, val description: String) {
    FIRST_PLAYER_WINS("First Player Wins", "End the game when the first player reaches 0 cards."),
    PLAY_UNTIL_LAST_PLAYER("Play Until Last Player", "Continue until only one active player remains.")
}

enum class GameMode(val label: String, val description: String) {
    SOLO_BOTS("Play vs Bots", "Play as Player 1 against smart AI opponents"),
    WLAN_MULTIPLAYER("WLAN Multiplayer", "Host or join on local Wi-Fi / Hotspot (Same network)"),
    ONLINE_ROOM("Online Multiplayer", "Play in an online room with custom code (2-10 players)"),
    PASS_AND_PLAY("Pass & Play", "Play with friends on this single phone with turn privacy"),
    ALL_BOTS("Bot Spectator", "Sit back and watch bots compete with high speed")
}

enum class TurnDirection(val multiplier: Int) {
    CLOCKWISE(1),
    COUNTER_CLOCKWISE(-1);

    fun toggled(): TurnDirection = if (this == CLOCKWISE) COUNTER_CLOCKWISE else CLOCKWISE
}

enum class GamePhase {
    NOT_STARTED,
    PLAYING,
    COLOR_SELECTION,
    CUSTOM_WILD_EFFECT_SELECTION,
    HAND_SWAP_SELECTION,
    CHALLENGE_PROMPT,
    ROUND_OVER,
    MATCH_OVER
}

enum class CustomWildEffect(val displayName: String, val description: String) {
    SHUFFLE_HANDS("🔀 Shuffle Hands", "Collect all cards, shuffle them, and redistribute preserving each player's card count"),
    EVERYONE_PLUS_FOUR("➕ Everyone +4", "Every other player receives 4 cards (and absorbs active stack if next)")
}

enum class DeckType(val label: String, val cardCount: Int, val description: String) {
    CLASSIC_108("Classic 108-card deck", 108, "24 Action (Skip, Reverse, Draw Two) + 8 Wild (Wild, Wild Draw Four)"),
    MODERN_112("Modern 112-card deck", 112, "Adds 1 Wild Swap/Shuffle Hands + 3 Customizable Wild cards")
}

data class GameRules(
    val playerCount: Int = 4,
    val initialCardsPerPlayer: Int = 7,
    val stackingDrawTwos: Boolean = true,
    val stackingDrawFours: Boolean = true,
    val stackingDrawFourOnTwo: Boolean = false,
    val sevenZeroRule: Boolean = false,
    val jumpInRule: Boolean = true,
    val drawUntilPlayable: Boolean = false,
    val forcePlay: Boolean = false,
    val wildDrawFourChallenge: Boolean = false,
    val mercyRule: Boolean = false,
    val mercyLimit: Int = 25,
    val unoPenaltyCards: Int = 2,
    val targetScore: Int = 250,
    val botSpeedMs: Long = 900L,
    val hapticsEnabled: Boolean = true,
    val soundEnabled: Boolean = true,
    val includeCustomWilds: Boolean = true,
    val gameEndingMode: GameEndingMode = GameEndingMode.FIRST_PLAYER_WINS,
    val noMercy: Boolean = false,
    val deckType: DeckType = DeckType.MODERN_112
) {
    companion object {
        val OFFICIAL_RULES = GameRules(
            stackingDrawTwos = false,
            stackingDrawFours = false,
            stackingDrawFourOnTwo = false,
            sevenZeroRule = false,
            jumpInRule = false,
            drawUntilPlayable = false,
            forcePlay = false,
            wildDrawFourChallenge = true,
            mercyRule = false,
            includeCustomWilds = false,
            noMercy = false,
            deckType = DeckType.CLASSIC_108
        )

        val SPICY_HOUSE_RULES = GameRules(
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            sevenZeroRule = true,
            jumpInRule = true,
            drawUntilPlayable = false,
            forcePlay = false,
            wildDrawFourChallenge = false,
            mercyRule = true,
            includeCustomWilds = true,
            noMercy = false,
            deckType = DeckType.MODERN_112
        )

        val NO_MERCY = GameRules(
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            sevenZeroRule = true,
            jumpInRule = true,
            drawUntilPlayable = false,
            forcePlay = true,
            wildDrawFourChallenge = false,
            mercyRule = true,
            mercyLimit = 25,
            includeCustomWilds = true,
            noMercy = true,
            deckType = DeckType.MODERN_112
        )

        val STACK_ATTACK = GameRules(
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            sevenZeroRule = false,
            jumpInRule = false,
            drawUntilPlayable = false,
            forcePlay = false,
            wildDrawFourChallenge = false,
            mercyRule = true,
            includeCustomWilds = true,
            noMercy = false,
            deckType = DeckType.MODERN_112
        )

        val CHAOS_PARTY = GameRules(
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            sevenZeroRule = true,
            jumpInRule = true,
            drawUntilPlayable = false,
            forcePlay = false,
            wildDrawFourChallenge = false,
            mercyRule = true,
            includeCustomWilds = true,
            noMercy = true,
            deckType = DeckType.MODERN_112
        )
    }
}

data class GameLogEntry(
    val id: String = java.util.UUID.randomUUID().toString(),
    val timestamp: Long = System.currentTimeMillis(),
    val text: String,
    val card: UnoCard? = null,
    val color: UnoColor? = null,
    val isAlert: Boolean = false
)
