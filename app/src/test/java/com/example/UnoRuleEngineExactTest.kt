package com.example

import com.example.engine.UnoGameEngine
import com.example.engine.UnoGameState
import com.example.model.CustomWildEffect
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.Player
import com.example.model.TurnDirection
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue
import com.example.model.isCardPlayable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UnoRuleEngineExactTest {

    private val rules = GameRules(
        stackingDrawTwos = true,
        stackingDrawFours = true
    )

    @Test
    fun testRuleMatchingLogicSection24() {
        val redSeven = UnoCard("1", UnoColor.RED, UnoValue.SEVEN)
        val blueSeven = UnoCard("2", UnoColor.BLUE, UnoValue.SEVEN)
        val redThree = UnoCard("3", UnoColor.RED, UnoValue.THREE)
        val redSkip = UnoCard("4", UnoColor.RED, UnoValue.SKIP)
        val blueSkip = UnoCard("5", UnoColor.BLUE, UnoValue.SKIP)
        val greenReverse = UnoCard("6", UnoColor.GREEN, UnoValue.REVERSE)
        val yellowReverse = UnoCard("7", UnoColor.YELLOW, UnoValue.REVERSE)
        val redDrawTwo = UnoCard("8", UnoColor.RED, UnoValue.DRAW_TWO)
        val blueDrawTwo = UnoCard("9", UnoColor.BLUE, UnoValue.DRAW_TWO)
        val blueThree = UnoCard("10", UnoColor.BLUE, UnoValue.THREE)
        val wildCard = UnoCard("11", UnoColor.WILD, UnoValue.WILD)
        val customWild = UnoCard("12", UnoColor.WILD, UnoValue.CUSTOM_WILD)

        // 1. RED 7 -> BLUE 7 (Number Match -> Playable)
        assertTrue("RED 7 -> BLUE 7 must be playable", isCardPlayable(blueSeven, redSeven, UnoColor.RED, 0, rules))

        // 2. RED 7 -> RED 3 (Color Match -> Playable)
        assertTrue("RED 7 -> RED 3 must be playable", isCardPlayable(redThree, redSeven, UnoColor.RED, 0, rules))

        // 3. RED SKIP -> BLUE SKIP (Action Match -> Playable)
        assertTrue("RED SKIP -> BLUE SKIP must be playable", isCardPlayable(blueSkip, redSkip, UnoColor.RED, 0, rules))

        // 4. GREEN REVERSE -> YELLOW REVERSE (Action Match -> Playable)
        assertTrue("GREEN REVERSE -> YELLOW REVERSE must be playable", isCardPlayable(yellowReverse, greenReverse, UnoColor.GREEN, 0, rules))

        // 5. RED +2 -> BLUE +2 (Draw Two Match with stacking)
        assertTrue("RED +2 -> BLUE +2 with stack=2 must be playable", isCardPlayable(blueDrawTwo, redDrawTwo, UnoColor.RED, 2, rules))
        assertTrue("RED +2 -> BLUE +2 with stack=0 must be playable", isCardPlayable(blueDrawTwo, redDrawTwo, UnoColor.RED, 0, rules))

        // 6. RED 7 -> BLUE 3 (Different color and different number -> NOT Playable)
        assertFalse("RED 7 -> BLUE 3 must NOT be playable", isCardPlayable(blueThree, redSeven, UnoColor.RED, 0, rules))

        // 7. RED SKIP -> BLUE REVERSE (Different color and different action -> NOT Playable)
        assertFalse("RED SKIP -> BLUE REVERSE must NOT be playable", isCardPlayable(yellowReverse, redSkip, UnoColor.RED, 0, rules))

        // 8. Wild & Custom Wild are always playable
        assertTrue("Wild on RED 7 must be playable", isCardPlayable(wildCard, redSeven, UnoColor.RED, 0, rules))
        assertTrue("Custom Wild on RED 7 must be playable", isCardPlayable(customWild, redSeven, UnoColor.RED, 0, rules))
    }

    @Test
    fun testDrawCardRule_PlayableCardDrawn() {
        // Top card is RED 7
        val redSeven = UnoCard("top", UnoColor.RED, UnoValue.SEVEN)
        // Next card in draw pile is BLUE 7 (Playable!)
        val blueSeven = UnoCard("draw", UnoColor.BLUE, UnoValue.SEVEN)

        val player0 = Player(
            id = "p0",
            name = "Player 1",
            avatar = "🦁",
            isHuman = true,
            hand = listOf(UnoCard("unplayable", UnoColor.GREEN, UnoValue.TWO))
        )
        val player1 = Player(id = "p1", name = "Player 2", avatar = "🦊", isHuman = true, hand = emptyList())

        val state = UnoGameState(
            players = listOf(player0, player1),
            currentPlayerIndex = 0,
            direction = TurnDirection.CLOCKWISE,
            drawPile = listOf(blueSeven),
            discardPile = listOf(redSeven),
            activeColor = UnoColor.RED,
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        val nextState = UnoGameEngine.drawCard(state, 0)

        // Card should be added to hand (now 2 cards)
        assertEquals(2, nextState.players[0].hand.size)
        assertTrue(nextState.players[0].hand.contains(blueSeven))

        // Player should NOT lose turn yet: drawnThisTurn should be true
        assertEquals(0, nextState.currentPlayerIndex)
        assertTrue(nextState.drawnThisTurn)
        assertEquals(blueSeven, nextState.cardDrawnThisTurn)

        // Player plays the drawn card
        val playedState = UnoGameEngine.playCard(nextState, 0, blueSeven)
        // Turn advances to Player 2
        assertEquals(1, playedState.currentPlayerIndex)
        assertEquals(blueSeven, playedState.topDiscardCard)
    }

    @Test
    fun testDrawCardRule_UnplayableCardDrawn_TurnEndsImmediately() {
        // Top card is RED 7
        val redSeven = UnoCard("top", UnoColor.RED, UnoValue.SEVEN)
        // Next card in draw pile is BLUE 3 (Unplayable!)
        val blueThree = UnoCard("draw", UnoColor.BLUE, UnoValue.THREE)

        val player0 = Player(id = "p0", name = "Player 1", avatar = "🦁", isHuman = true, hand = emptyList())
        val player1 = Player(id = "p1", name = "Player 2", avatar = "🦊", isHuman = true, hand = emptyList())

        val state = UnoGameState(
            players = listOf(player0, player1),
            currentPlayerIndex = 0,
            direction = TurnDirection.CLOCKWISE,
            drawPile = listOf(blueThree),
            discardPile = listOf(redSeven),
            activeColor = UnoColor.RED,
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        val nextState = UnoGameEngine.drawCard(state, 0)

        // Card must remain in Player 0's hand
        assertEquals(1, nextState.players[0].hand.size)
        assertEquals(blueThree, nextState.players[0].hand[0])

        // Turn MUST automatically end and advance to Player 1 (index 1)!
        assertEquals(1, nextState.currentPlayerIndex)
        assertFalse(nextState.drawnThisTurn)
    }

    @Test
    fun testDeckContainsExactlyThreeCustomWilds() {
        val deckWithCustom = com.example.engine.UnoDeck.generateDeck(deckCount = 1, includeCustomWilds = true)
        val customWildCount = deckWithCustom.count { it.value == UnoValue.CUSTOM_WILD }
        assertEquals("Deck must contain exactly 3 Custom Wild cards", 3, customWildCount)

        val deckWithoutCustom = com.example.engine.UnoDeck.generateDeck(deckCount = 1, includeCustomWilds = false)
        val zeroCount = deckWithoutCustom.count { it.value == UnoValue.CUSTOM_WILD }
        assertEquals("Deck without custom wilds must have 0", 0, zeroCount)
    }

    @Test
    fun testCustomWild_PhaseTransition_And_ShuffleHandsPreservesCardCounts() {
        val top = UnoCard("top", UnoColor.RED, UnoValue.SEVEN)
        val customWild = UnoCard("cw", UnoColor.WILD, UnoValue.CUSTOM_WILD)
        val c1 = UnoCard("c1", UnoColor.BLUE, UnoValue.ONE)
        val c2 = UnoCard("c2", UnoColor.GREEN, UnoValue.TWO)
        val c3 = UnoCard("c3", UnoColor.YELLOW, UnoValue.THREE)
        val c4 = UnoCard("c4", UnoColor.RED, UnoValue.FOUR)

        val p0 = Player(id = "p0", name = "Player 1", avatar = "🦁", isHuman = true, hand = listOf(customWild, c1, c2)) // 3 cards
        val p1 = Player(id = "p1", name = "Player 2", avatar = "🦊", isHuman = true, hand = listOf(c3)) // 1 card
        val p2 = Player(id = "p2", name = "Player 3", avatar = "🐼", isHuman = true, hand = listOf(c4)) // 1 card

        val state = UnoGameState(
            players = listOf(p0, p1, p2),
            currentPlayerIndex = 0,
            drawPile = emptyList(),
            discardPile = listOf(top),
            activeColor = UnoColor.RED,
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        // 1. Playing Custom Wild pauses to CUSTOM_WILD_EFFECT_SELECTION
        val phaseState = UnoGameEngine.playCard(state, 0, customWild)
        assertEquals(GamePhase.CUSTOM_WILD_EFFECT_SELECTION, phaseState.gamePhase)
        assertEquals(customWild, phaseState.pendingCustomWildCard)
        assertEquals(0, phaseState.pendingCustomWildPlayerIndex)

        // 2. Select SHUFFLE HANDS
        val resolvedState = UnoGameEngine.completeCustomWildSelection(phaseState, CustomWildEffect.SHUFFLE_HANDS)

        // After playing customWild, p0 had 2 cards, p1 had 1, p2 had 1
        assertEquals(2, resolvedState.players[0].hand.size)
        assertEquals(1, resolvedState.players[1].hand.size)
        assertEquals(1, resolvedState.players[2].hand.size)

        // Turn advanced
        assertEquals(1, resolvedState.currentPlayerIndex)
    }

    @Test
    fun testCustomWild_EveryonePlusFourWithStack() {
        val top = UnoCard("top", UnoColor.RED, UnoValue.DRAW_TWO)
        val customWild = UnoCard("cw", UnoColor.WILD, UnoValue.CUSTOM_WILD)

        val p0 = Player(id = "p0", name = "Player 1", avatar = "🦁", isHuman = true, hand = listOf(customWild, UnoCard("extra", UnoColor.BLUE, UnoValue.ONE)))
        val p1 = Player(id = "p1", name = "Player 2", avatar = "🦊", isHuman = false, hand = emptyList())
        val p2 = Player(id = "p2", name = "Player 3", avatar = "🐼", isHuman = false, hand = emptyList())

        val drawDeck = (1..30).map { UnoCard("draw_$it", UnoColor.RED, UnoValue.FIVE) }

        val state = UnoGameState(
            players = listOf(p0, p1, p2),
            currentPlayerIndex = 0,
            drawPile = drawDeck,
            discardPile = listOf(top),
            activeColor = UnoColor.RED,
            pendingDrawStack = 2, // Active stack of +2 from previous play!
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        // Player plays Custom Wild
        val phaseState = UnoGameEngine.playCard(state, 0, customWild)
        // Select EVERYONE_PLUS_FOUR
        val resolvedState = UnoGameEngine.completeCustomWildSelection(phaseState, CustomWildEffect.EVERYONE_PLUS_FOUR)

        // Player 0 (who played it) receives 0 cards: had 2, played 1 -> 1 left
        assertEquals(1, resolvedState.players[0].hand.size)

        // Player 1 (next player) absorbs stack: 4 + 2 = 6 cards!
        assertEquals(6, resolvedState.players[1].hand.size)

        // Player 2 (other player) receives 4 cards!
        assertEquals(4, resolvedState.players[2].hand.size)

        // Stack reset to 0
        assertEquals(0, resolvedState.pendingDrawStack)

        // Player 1 absorbed penalty and was skipped, turn advances to Player 2
        assertEquals(2, resolvedState.currentPlayerIndex)
    }
}
