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
import org.junit.Assert.assertNull
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
    fun testDeckContainsExactlyThreeCustomWildsAndOneShuffleHands() {
        val deckWithCustom = com.example.engine.UnoDeck.generateDeck(deckCount = 1, includeCustomWilds = true)
        val customWildCount = deckWithCustom.count { it.value == UnoValue.CUSTOM_WILD }
        val shuffleHandsCount = deckWithCustom.count { it.value == UnoValue.SHUFFLE_HANDS }
        assertEquals("Deck must contain exactly 3 Custom Wild cards", 3, customWildCount)
        assertEquals("Deck must contain exactly 1 Shuffle Hands card", 1, shuffleHandsCount)
        assertEquals("Total special cards must be exactly 4", 4, customWildCount + shuffleHandsCount)

        val deckWithoutCustom = com.example.engine.UnoDeck.generateDeck(deckCount = 1, includeCustomWilds = false)
        val zeroCustom = deckWithoutCustom.count { it.value == UnoValue.CUSTOM_WILD }
        val zeroShuffle = deckWithoutCustom.count { it.value == UnoValue.SHUFFLE_HANDS }
        assertEquals("Deck without custom wilds must have 0 Custom Wilds", 0, zeroCustom)
        assertEquals("Deck without custom wilds must have 0 Shuffle Hands", 0, zeroShuffle)
    }

    @Test
    fun testDedicatedShuffleHandsCard_PlaysDirectlyWithoutModal() {
        val top = UnoCard("top", UnoColor.RED, UnoValue.SEVEN)
        val dedicatedShuffle = UnoCard("sh", UnoColor.WILD, UnoValue.SHUFFLE_HANDS)
        val c1 = UnoCard("c1", UnoColor.BLUE, UnoValue.ONE)
        val c2 = UnoCard("c2", UnoColor.GREEN, UnoValue.TWO)
        val c3 = UnoCard("c3", UnoColor.YELLOW, UnoValue.THREE)
        val c4 = UnoCard("c4", UnoColor.RED, UnoValue.FOUR)

        val p0 = Player(id = "p0", name = "Player 1", avatar = "🦁", isHuman = true, hand = listOf(dedicatedShuffle, c1, c2)) // 3 cards
        val p1 = Player(id = "p1", name = "Player 2", avatar = "🦊", isHuman = false, hand = listOf(c3)) // 1 card
        val p2 = Player(id = "p2", name = "Player 3", avatar = "🐼", isHuman = false, hand = listOf(c4)) // 1 card

        val state = UnoGameState(
            players = listOf(p0, p1, p2),
            currentPlayerIndex = 0,
            drawPile = emptyList(),
            discardPile = listOf(top),
            activeColor = UnoColor.RED,
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        // Playing dedicated Shuffle Hands immediately triggers Shuffle Hands (NO modal!)
        val nextState = UnoGameEngine.playCard(state, 0, dedicatedShuffle)
        assertEquals(GamePhase.PLAYING, nextState.gamePhase)
        assertNull(nextState.pendingCustomWildCard)

        // Preserves card counts: p0 had 3, played 1 -> 2; p1 has 1; p2 has 1
        assertEquals(2, nextState.players[0].hand.size)
        assertEquals(1, nextState.players[1].hand.size)
        assertEquals(1, nextState.players[2].hand.size)

        // Turn advanced normally to Player 2 (index 1)
        assertEquals(1, nextState.currentPlayerIndex)
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
    fun testExample1_CustomWildEveryonePlusFour_StackRemainsIntactAndAccumulates() {
        // Example 1:
        // P1 plays +2 -> stack = 2
        // P2 plays +2 -> stack = 4
        // P3 plays +4 -> stack = 8
        // P4 plays Custom Wild ⚡ and selects "Everyone +4"
        // P5 is the next active player.
        // Result:
        // - P5 draws 12 cards = existing stack 8 + Custom Wild 4.
        // - Every other active player except P4 and P5 draws 4 cards (P1, P2, P3).
        // - P4, the Custom Wild player, draws 0.
        // - P5's turn ends after drawing 12.
        // - Then the next active player (P1) gets a normal turn.
        // - Clear the stack only after this effect has been fully resolved (pendingDrawStack = 0).

        val testRules = rules.copy(
            playerCount = 5,
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            includeCustomWilds = true
        )

        val p1Card = UnoCard("c_p1", UnoColor.RED, UnoValue.DRAW_TWO)
        val p2Card = UnoCard("c_p2", UnoColor.BLUE, UnoValue.DRAW_TWO)
        val p3Card = UnoCard("c_p3", UnoColor.WILD, UnoValue.WILD_DRAW_FOUR)
        val p4Card = UnoCard("c_p4", UnoColor.WILD, UnoValue.CUSTOM_WILD)

        val p1 = Player(id = "p1", name = "P1", avatar = "🦁", isHuman = false, hand = listOf(p1Card, UnoCard("x1", UnoColor.RED, UnoValue.ONE)))
        val p2 = Player(id = "p2", name = "P2", avatar = "🦊", isHuman = false, hand = listOf(p2Card, UnoCard("x2", UnoColor.RED, UnoValue.TWO)))
        val p3 = Player(id = "p3", name = "P3", avatar = "🐼", isHuman = false, hand = listOf(p3Card, UnoCard("x3", UnoColor.RED, UnoValue.THREE)))
        val p4 = Player(id = "p4", name = "P4", avatar = "🐯", isHuman = false, hand = listOf(p4Card, UnoCard("x4", UnoColor.RED, UnoValue.FOUR)))
        val p5 = Player(id = "p5", name = "P5", avatar = "🐻", isHuman = false, hand = listOf(UnoCard("x5", UnoColor.RED, UnoValue.FIVE)))

        val drawDeck = (1..60).map { UnoCard("draw_$it", UnoColor.RED, UnoValue.NINE) }

        var state = UnoGameState(
            players = listOf(p1, p2, p3, p4, p5),
            currentPlayerIndex = 0,
            drawPile = drawDeck,
            discardPile = listOf(UnoCard("start", UnoColor.RED, UnoValue.SEVEN)),
            activeColor = UnoColor.RED,
            pendingDrawStack = 0,
            gamePhase = GamePhase.PLAYING,
            rules = testRules
        )

        // P1 plays Red +2 -> stack = 2
        state = UnoGameEngine.playCard(state, 0, p1Card)
        assertEquals(2, state.pendingDrawStack)
        assertEquals(1, state.currentPlayerIndex)

        // P2 plays Blue +2 -> stack = 4
        state = UnoGameEngine.playCard(state, 1, p2Card)
        assertEquals(4, state.pendingDrawStack)
        assertEquals(2, state.currentPlayerIndex)

        // P3 plays +4 -> stack = 8
        state = UnoGameEngine.playCard(state, 2, p3Card, chosenColor = UnoColor.RED)
        assertEquals(8, state.pendingDrawStack)
        assertEquals(3, state.currentPlayerIndex)

        // P4 plays Custom Wild ⚡ and selects "Everyone +4"
        state = UnoGameEngine.playCard(state, 3, p4Card)
        // If human, completes via completeCustomWildSelection. For bot, engine resolves with EVERYONE_PLUS_FOUR.
        if (state.gamePhase == GamePhase.CUSTOM_WILD_EFFECT_SELECTION) {
            state = UnoGameEngine.completeCustomWildSelection(state, CustomWildEffect.EVERYONE_PLUS_FOUR)
        }

        // Verify exact outcomes:
        // - P5 draws 12 cards = existing stack 8 + Custom Wild 4.
        // Initially P5 had 1 card -> 1 + 12 = 13 cards!
        assertEquals("P5 must draw 12 cards (8 stack + 4 custom wild) -> 13 total", 13, state.players[4].hand.size)

        // - Every other active player except P4 and P5 draws 4 cards (P1, P2, P3).
        // P1 initially had 2, played 1 -> 1 left + 4 drawn = 5 cards!
        assertEquals("P1 must receive 4 cards -> 5 total", 5, state.players[0].hand.size)
        // P2 initially had 2, played 1 -> 1 left + 4 drawn = 5 cards!
        assertEquals("P2 must receive 4 cards -> 5 total", 5, state.players[1].hand.size)
        // P3 initially had 2, played 1 -> 1 left + 4 drawn = 5 cards!
        assertEquals("P3 must receive 4 cards -> 5 total", 5, state.players[2].hand.size)

        // - P4, the Custom Wild player, draws 0.
        // P4 initially had 2, played 1 -> 1 left + 0 drawn = 1 card!
        assertEquals("P4 must draw 0 cards -> 1 total", 1, state.players[3].hand.size)

        // - Clear the stack only after this effect has been fully resolved:
        assertEquals("pendingDrawStack must be 0 after resolution", 0, state.pendingDrawStack)

        // - P5's turn ends after drawing 12. Then the next active player (P1, index 0) gets a normal turn.
        assertEquals("Turn must advance past P5 to P1 (index 0)", 0, state.currentPlayerIndex)
    }

    @Test
    fun testExample2_StackingCalculation_TwoPlusTwoPlusFourPlusFourEqualsTwelve() {
        // Example 2:
        // P1 → Red +2 (stack = 2)
        // P2 → Yellow +2 (stack = 4)
        // P3 → +4 (stack = 8)
        // P4 → +4 (stack = 12)
        // P5 → draws 12 cards.
        // Stack calculation: 2 + 2 + 4 + 4 = 12

        val testRules = rules.copy(
            playerCount = 5,
            stackingDrawTwos = true,
            stackingDrawFours = true,
            stackingDrawFourOnTwo = true,
            includeCustomWilds = true
        )

        val p1Card = UnoCard("c_p1", UnoColor.RED, UnoValue.DRAW_TWO)
        val p2Card = UnoCard("c_p2", UnoColor.YELLOW, UnoValue.DRAW_TWO)
        val p3Card = UnoCard("c_p3", UnoColor.WILD, UnoValue.WILD_DRAW_FOUR)
        val p4Card = UnoCard("c_p4", UnoColor.WILD, UnoValue.WILD_DRAW_FOUR)

        val p1 = Player(id = "p1", name = "P1", avatar = "🦁", isHuman = false, hand = listOf(p1Card, UnoCard("x1", UnoColor.RED, UnoValue.ONE)))
        val p2 = Player(id = "p2", name = "P2", avatar = "🦊", isHuman = false, hand = listOf(p2Card, UnoCard("x2", UnoColor.RED, UnoValue.TWO)))
        val p3 = Player(id = "p3", name = "P3", avatar = "🐼", isHuman = false, hand = listOf(p3Card, UnoCard("x3", UnoColor.RED, UnoValue.THREE)))
        val p4 = Player(id = "p4", name = "P4", avatar = "🐯", isHuman = false, hand = listOf(p4Card, UnoCard("x4", UnoColor.RED, UnoValue.FOUR)))
        // P5 has NO +2, +4, or Custom Wild, so P5 cannot stack
        val p5 = Player(id = "p5", name = "P5", avatar = "🐻", isHuman = false, hand = listOf(UnoCard("x5", UnoColor.RED, UnoValue.FIVE)))

        val drawDeck = (1..60).map { UnoCard("draw_$it", UnoColor.RED, UnoValue.NINE) }

        var state = UnoGameState(
            players = listOf(p1, p2, p3, p4, p5),
            currentPlayerIndex = 0,
            drawPile = drawDeck,
            discardPile = listOf(UnoCard("start", UnoColor.RED, UnoValue.SEVEN)),
            activeColor = UnoColor.RED,
            pendingDrawStack = 0,
            gamePhase = GamePhase.PLAYING,
            rules = testRules
        )

        // P1 plays Red +2 -> stack = 2
        state = UnoGameEngine.playCard(state, 0, p1Card)
        assertEquals(2, state.pendingDrawStack)
        assertEquals(1, state.currentPlayerIndex)

        // P2 plays Yellow +2 -> stack = 2 + 2 = 4
        state = UnoGameEngine.playCard(state, 1, p2Card)
        assertEquals(4, state.pendingDrawStack)
        assertEquals(2, state.currentPlayerIndex)

        // P3 plays +4 -> stack = 4 + 4 = 8
        state = UnoGameEngine.playCard(state, 2, p3Card, chosenColor = UnoColor.RED)
        assertEquals(8, state.pendingDrawStack)
        assertEquals(3, state.currentPlayerIndex)

        // P4 plays +4 -> stack = 8 + 4 = 12
        // Since P5 cannot stack, P5 immediately absorbs the entire 12-card stack!
        state = UnoGameEngine.playCard(state, 3, p4Card, chosenColor = UnoColor.RED)

        // P5 had 1 card, drew 12 cards -> 1 + 12 = 13 cards!
        assertEquals("P5 must draw all 12 stacked cards (2 + 2 + 4 + 4 = 12)", 13, state.players[4].hand.size)

        // Stack reset to 0 after penalty is absorbed
        assertEquals(0, state.pendingDrawStack)

        // P5's turn was skipped, turn advances to P1 (index 0)
        assertEquals(0, state.currentPlayerIndex)
    }
}
