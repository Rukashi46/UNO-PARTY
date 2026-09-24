package com.example

import com.example.engine.UnoGameEngine
import com.example.engine.UnoGameState
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.Player
import com.example.model.TurnDirection
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue
import com.example.network.RoomCodeUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MultiplayerAndDrawnCardTest {

    private val rules = GameRules()

    @Test
    fun testDrawnPlayableCardAllowsPlayOrEndTurn() {
        val dummyCard = UnoCard("c_dummy", UnoColor.BLUE, UnoValue.TWO)
        val player0 = Player("p0", "Alice", "🦁", isHuman = true, hand = listOf(dummyCard))
        val player1 = Player("p1", "Bob", "🦊", isHuman = true, hand = listOf(UnoCard("c_b1", UnoColor.GREEN, UnoValue.ONE)))

        val topDiscard = UnoCard("c_discard", UnoColor.RED, UnoValue.SEVEN)
        val playableDrawCard = UnoCard("c_drawn_play", UnoColor.RED, UnoValue.FIVE)

        val initialState = UnoGameState(
            players = listOf(player0, player1),
            currentPlayerIndex = 0,
            activeColor = UnoColor.RED,
            discardPile = listOf(topDiscard),
            drawPile = listOf(playableDrawCard),
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        // Draw card with autoAdvanceIfUnplayable = false
        val drawnState = UnoGameEngine.drawCard(initialState, playerIndex = 0, autoAdvanceIfUnplayable = false)

        // Must be marked as drawnThisTurn and have cardDrawnThisTurn populated
        assertTrue("drawnThisTurn must be true", drawnState.drawnThisTurn)
        assertNotNull("cardDrawnThisTurn must NOT be null", drawnState.cardDrawnThisTurn)
        assertEquals(playableDrawCard.id, drawnState.cardDrawnThisTurn?.id)
        assertEquals("Player turn must not advance yet", 0, drawnState.currentPlayerIndex)

        // Choice 1: Player decides to play the drawn card
        val playedState = UnoGameEngine.playCard(drawnState, 0, drawnState.cardDrawnThisTurn!!)
        assertEquals("Top discard must be the played card", playableDrawCard.id, playedState.topDiscardCard?.id)
        assertEquals("Turn must advance to player 1 after play", 1, playedState.currentPlayerIndex)
        assertFalse("drawnThisTurn must reset", playedState.drawnThisTurn)
        assertNull("cardDrawnThisTurn must reset", playedState.cardDrawnThisTurn)

        // Choice 2: Player decides to pass/end turn instead
        val passedState = UnoGameEngine.passTurn(drawnState, 0)
        assertEquals("Both cards must stay in player 0 hand", 2, passedState.players[0].hand.size)
        assertEquals("Turn must advance to player 1", 1, passedState.currentPlayerIndex)
        assertFalse("drawnThisTurn must reset", passedState.drawnThisTurn)
        assertNull("cardDrawnThisTurn must reset", passedState.cardDrawnThisTurn)
    }

    @Test
    fun testDrawnUnplayableCardGoesToHandAndSetsNotice() {
        val player0 = Player("p0", "Alice", "🦁", isHuman = true, hand = emptyList())
        val player1 = Player("p1", "Bob", "🦊", isHuman = true, hand = emptyList())

        val topDiscard = UnoCard("c_discard", UnoColor.RED, UnoValue.SEVEN)
        val unplayableDrawCard = UnoCard("c_drawn_unplay", UnoColor.BLUE, UnoValue.THREE)

        val initialState = UnoGameState(
            players = listOf(player0, player1),
            currentPlayerIndex = 0,
            activeColor = UnoColor.RED,
            discardPile = listOf(topDiscard),
            drawPile = listOf(unplayableDrawCard),
            gamePhase = GamePhase.PLAYING,
            rules = rules
        )

        // Draw card
        val drawnState = UnoGameEngine.drawCard(initialState, playerIndex = 0, autoAdvanceIfUnplayable = false)

        // Should NOT have cardDrawnThisTurn set since it is not playable
        assertNull("cardDrawnThisTurn must be null for unplayable card", drawnState.cardDrawnThisTurn)
        assertNotNull("unplayableDrawnNotice should be set to notify player", drawnState.unplayableDrawnNotice)
        assertEquals("Card must enter player 0 hand", 1, drawnState.players[0].hand.size)
        assertEquals(unplayableDrawCard.id, drawnState.players[0].hand[0].id)
    }

    @Test
    fun testStrictlyNoBotsInOnlineOrWlanMatch() {
        // Test Online Room creation
        val onlineState = UnoGameEngine.startNewGame(
            playerCount = 1,
            mode = GameMode.ONLINE_ROOM,
            rules = rules,
            roomCode = "X7K9PQ"
        )

        assertEquals("Online room must have exactly 1 initial player", 1, onlineState.players.size)
        assertTrue("Player must be human", onlineState.players[0].isHuman)
        assertTrue("Player must be host", onlineState.players[0].isHost)
        assertFalse("Game must not auto start without minimum players", onlineState.gamePhase == GamePhase.PLAYING)

        // Test WLAN Room creation
        val wlanState = UnoGameEngine.startNewGame(
            playerCount = 1,
            mode = GameMode.WLAN_MULTIPLAYER,
            rules = rules,
            roomCode = "WLAN-1234"
        )

        assertEquals("WLAN room must have exactly 1 initial player", 1, wlanState.players.size)
        assertTrue("Player must be human", wlanState.players[0].isHuman)
        assertTrue("Player must be host", wlanState.players[0].isHost)
    }

    @Test
    fun testStartNewGameWithOnlyAuthoritativeConnectedPlayers() {
        val host = Player("host_1", "HostPlayer", "🦁", isHuman = true, isHost = true)
        val p2 = Player("client_1", "PlayerTwo", "🦊", isHuman = true, isHost = false)
        val p3 = Player("client_2", "PlayerThree", "🐼", isHuman = true, isHost = false)

        val connectedPlayers = listOf(host, p2, p3)

        val gameState = UnoGameEngine.startNewGameWithPlayers(
            players = connectedPlayers,
            mode = GameMode.ONLINE_ROOM,
            rules = rules,
            roomCode = "X7K9PQ"
        )

        assertEquals("Game must have exactly 3 players", 3, gameState.players.size)
        assertEquals("HostPlayer", gameState.players[0].name)
        assertEquals("PlayerTwo", gameState.players[1].name)
        assertEquals("PlayerThree", gameState.players[2].name)

        // Verify zero bots
        for (player in gameState.players) {
            assertTrue("Every player in online match must be human", player.isHuman)
            assertEquals("Each player must receive 7 initial cards", 7, player.hand.size)
        }

        assertEquals(GamePhase.PLAYING, gameState.gamePhase)
    }

    @Test
    fun testRoomCodeUtilEncodesAndDecodesCorrectly() {
        val testIp = "192.168.1.42"
        val testPort = 8888

        val code = RoomCodeUtil.encodeIpToRoomCode(testIp, testPort)
        assertNotNull(code)
        assertTrue("Code should start with WLAN-", code.startsWith("WLAN-"))

        val decoded = RoomCodeUtil.decodeRoomCodeToIp(code)
        assertNotNull(decoded)
        assertEquals(testIp, decoded?.first)
        assertEquals(testPort, decoded?.second)
    }

    @Test
    fun testPersonalizedStateSerializationHidesOpponentHands() {
        val host = Player("host_id", "HostAlice", "🦁", isHuman = true, isHost = true, hand = listOf(
            UnoCard("h1", UnoColor.RED, UnoValue.ONE),
            UnoCard("h2", UnoColor.BLUE, UnoValue.TWO),
            UnoCard("h3", UnoColor.GREEN, UnoValue.THREE)
        ))
        val client = Player("client_id", "ClientBob", "🦊", isHuman = true, isHost = false, hand = listOf(
            UnoCard("c1", UnoColor.YELLOW, UnoValue.FOUR),
            UnoCard("c2", UnoColor.RED, UnoValue.FIVE)
        ))

        val fullState = UnoGameState(
            players = listOf(host, client),
            currentPlayerIndex = 0,
            activeColor = UnoColor.RED,
            discardPile = listOf(UnoCard("d1", UnoColor.RED, UnoValue.ZERO)),
            drawPile = listOf(UnoCard("dp1", UnoColor.BLUE, UnoValue.ONE)),
            gamePhase = GamePhase.PLAYING,
            rules = rules,
            roomCode = "WLAN-1234"
        )

        // Generate JSON specifically for clientBob
        val jsonForClient = com.example.network.UnoNetworkProtocol.stateToJsonForPlayer(fullState, "client_id")
        val parsedStateForClient = com.example.network.UnoNetworkProtocol.jsonToState(jsonForClient)

        assertNotNull(parsedStateForClient)
        val clientViewHost = parsedStateForClient.players.first { it.id == "host_id" }
        val clientViewSelf = parsedStateForClient.players.first { it.id == "client_id" }

        // Host's private hand MUST be empty in client's view
        assertTrue("Host hand must be empty in client view", clientViewHost.hand.isEmpty())
        assertEquals("Host networkCardCount must match real hand size", 3, clientViewHost.cardCount)

        // Client's own hand MUST be preserved
        assertEquals("Client own hand must have 2 cards", 2, clientViewSelf.hand.size)
        assertEquals("Client own card count must be 2", 2, clientViewSelf.cardCount)
        assertEquals("c1", clientViewSelf.hand[0].id)
        assertEquals("c2", clientViewSelf.hand[1].id)
    }

    @Test
    fun testRuleSyncMessageSerialization() {
        val customRules = GameRules(
            stackingDrawTwos = false,
            sevenZeroRule = false,
            jumpInRule = false
        )
        val rulesJson = com.example.network.UnoNetworkProtocol.rulesToJson(customRules)
        val parsedRules = com.example.network.UnoNetworkProtocol.jsonToRules(rulesJson)

        assertNotNull(parsedRules)
        assertFalse(parsedRules.stackingDrawTwos)
        assertFalse(parsedRules.sevenZeroRule)
        assertFalse(parsedRules.jumpInRule)
    }
}
