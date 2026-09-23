package com.example.network

import com.example.engine.UnoGameState
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
import org.json.JSONArray
import org.json.JSONObject

object UnoNetworkProtocol {

    const val DEFAULT_PORT = 8888
    const val UDP_DISCOVERY_PORT = 8889

    const val MSG_JOIN_LOBBY = "JOIN_LOBBY"
    const val MSG_LOBBY_UPDATE = "LOBBY_UPDATE"
    const val MSG_START_GAME = "START_GAME"
    const val MSG_PLAYER_ACTION = "PLAYER_ACTION"
    const val MSG_SYNC_STATE = "SYNC_STATE"
    const val MSG_PING = "PING"
    const val MSG_PONG = "PONG"
    const val MSG_LEAVE = "LEAVE"
    const val MSG_RECONNECT = "RECONNECT"

    // Action types
    const val ACTION_PLAY_CARD = "PLAY_CARD"
    const val ACTION_DRAW_CARD = "DRAW_CARD"
    const val ACTION_PASS_TURN = "PASS_TURN"
    const val ACTION_CALL_UNO = "CALL_UNO"
    const val ACTION_CATCH_UNO = "CATCH_UNO"
    const val ACTION_CHOOSE_COLOR = "CHOOSE_COLOR"
    const val ACTION_CHOOSE_CUSTOM_WILD = "CHOOSE_CUSTOM_WILD"
    const val ACTION_CHOOSE_SEVEN_SWAP = "CHOOSE_SEVEN_SWAP"
    const val ACTION_JUMP_IN = "JUMP_IN"

    // Card serialization
    fun cardToJson(card: UnoCard): JSONObject {
        return JSONObject().apply {
            put("id", card.id)
            put("color", card.color.name)
            put("value", card.value.name)
        }
    }

    fun jsonToCard(json: JSONObject): UnoCard {
        return UnoCard(
            id = json.getString("id"),
            color = UnoColor.valueOf(json.getString("color")),
            value = UnoValue.valueOf(json.getString("value"))
        )
    }

    // Player serialization
    fun playerToJson(player: Player): JSONObject {
        val handArray = JSONArray()
        player.hand.forEach { handArray.put(cardToJson(it)) }

        return JSONObject().apply {
            put("id", player.id)
            put("name", player.name)
            put("avatar", player.avatar)
            put("isHuman", player.isHuman)
            put("hasCalledUno", player.hasCalledUno)
            put("canBePenalizedUno", player.canBePenalizedUno)
            put("score", player.score)
            put("isEliminated", player.isEliminated)
            put("pingMs", player.pingMs)
            put("isHost", player.isHost)
            put("isConnected", player.isConnected)
            put("isReconnecting", player.isReconnecting)
            if (player.finishRank != null) put("finishRank", player.finishRank)
            put("hand", handArray)
        }
    }

    fun jsonToPlayer(json: JSONObject): Player {
        val hand = mutableListOf<UnoCard>()
        val handArray = json.optJSONArray("hand")
        if (handArray != null) {
            for (i in 0 until handArray.length()) {
                hand.add(jsonToCard(handArray.getJSONObject(i)))
            }
        }

        return Player(
            id = json.getString("id"),
            name = json.getString("name"),
            avatar = json.getString("avatar"),
            isHuman = json.optBoolean("isHuman", true),
            hand = hand,
            hasCalledUno = json.optBoolean("hasCalledUno", false),
            canBePenalizedUno = json.optBoolean("canBePenalizedUno", false),
            score = json.optInt("score", 0),
            isEliminated = json.optBoolean("isEliminated", false),
            pingMs = json.optInt("pingMs", 0),
            isHost = json.optBoolean("isHost", false),
            isConnected = json.optBoolean("isConnected", true),
            isReconnecting = json.optBoolean("isReconnecting", false),
            finishRank = if (json.has("finishRank") && !json.isNull("finishRank")) json.getInt("finishRank") else null
        )
    }

    // GameRules serialization
    fun rulesToJson(rules: GameRules): JSONObject {
        return JSONObject().apply {
            put("playerCount", rules.playerCount)
            put("initialCardsPerPlayer", rules.initialCardsPerPlayer)
            put("stackingDrawTwos", rules.stackingDrawTwos)
            put("stackingDrawFours", rules.stackingDrawFours)
            put("stackingDrawFourOnTwo", rules.stackingDrawFourOnTwo)
            put("sevenZeroRule", rules.sevenZeroRule)
            put("jumpInRule", rules.jumpInRule)
            put("includeCustomWilds", rules.includeCustomWilds)
        }
    }

    fun jsonToRules(json: JSONObject): GameRules {
        return GameRules(
            playerCount = json.optInt("playerCount", 4),
            initialCardsPerPlayer = json.optInt("initialCardsPerPlayer", 7),
            stackingDrawTwos = json.optBoolean("stackingDrawTwos", true),
            stackingDrawFours = json.optBoolean("stackingDrawFours", true),
            stackingDrawFourOnTwo = json.optBoolean("stackingDrawFourOnTwo", true),
            sevenZeroRule = json.optBoolean("sevenZeroRule", false),
            jumpInRule = json.optBoolean("jumpInRule", true),
            includeCustomWilds = json.optBoolean("includeCustomWilds", true)
        )
    }

    // Full Game State serialization
    fun stateToJson(state: UnoGameState): JSONObject {
        val playersArray = JSONArray()
        state.players.forEach { playersArray.put(playerToJson(it)) }

        val discardArray = JSONArray()
        state.discardPile.forEach { discardArray.put(cardToJson(it)) }

        val logsArray = JSONArray()
        state.logs.takeLast(10).forEach {
            logsArray.put(JSONObject().apply {
                put("id", it.id)
                put("text", it.text)
                put("isAlert", it.isAlert)
            })
        }

        return JSONObject().apply {
            put("currentPlayerIndex", state.currentPlayerIndex)
            put("direction", state.direction.name)
            put("activeColor", state.activeColor.name)
            put("pendingDrawStack", state.pendingDrawStack)
            put("gamePhase", state.gamePhase.name)
            put("mode", state.mode.name)
            put("roundNumber", state.roundNumber)
            put("roomCode", state.roomCode ?: "")
            put("drawPileSize", state.drawPile.size)
            put("drawnThisTurn", state.drawnThisTurn)
            state.cardDrawnThisTurn?.let { put("cardDrawnThisTurn", cardToJson(it)) }
            put("unplayableDrawnNotice", state.unplayableDrawnNotice ?: "")
            put("players", playersArray)
            put("discardPile", discardArray)
            put("rules", rulesToJson(state.rules))
            put("logs", logsArray)
            state.winner?.let { put("winner", playerToJson(it)) }
        }
    }

    fun jsonToState(json: JSONObject, originalDrawPile: List<UnoCard> = emptyList()): UnoGameState {
        val players = mutableListOf<Player>()
        val playersArray = json.getJSONArray("players")
        for (i in 0 until playersArray.length()) {
            players.add(jsonToPlayer(playersArray.getJSONObject(i)))
        }

        val discard = mutableListOf<UnoCard>()
        val discardArray = json.getJSONArray("discardPile")
        for (i in 0 until discardArray.length()) {
            discard.add(jsonToCard(discardArray.getJSONObject(i)))
        }

        val logs = mutableListOf<GameLogEntry>()
        val logsArray = json.optJSONArray("logs")
        if (logsArray != null) {
            for (i in 0 until logsArray.length()) {
                val logObj = logsArray.getJSONObject(i)
                logs.add(GameLogEntry(
                    id = logObj.optString("id", java.util.UUID.randomUUID().toString()),
                    text = logObj.getString("text"),
                    isAlert = logObj.optBoolean("isAlert", false)
                ))
            }
        }

        val cardDrawn = if (json.has("cardDrawnThisTurn") && !json.isNull("cardDrawnThisTurn")) {
            jsonToCard(json.getJSONObject("cardDrawnThisTurn"))
        } else null

        val unplayableNotice = json.optString("unplayableDrawnNotice").takeIf { it.isNotEmpty() }

        val winner = if (json.has("winner") && !json.isNull("winner")) {
            jsonToPlayer(json.getJSONObject("winner"))
        } else null

        return UnoGameState(
            players = players,
            currentPlayerIndex = json.getInt("currentPlayerIndex"),
            direction = TurnDirection.valueOf(json.getString("direction")),
            drawPile = originalDrawPile,
            discardPile = discard,
            activeColor = UnoColor.valueOf(json.getString("activeColor")),
            pendingDrawStack = json.getInt("pendingDrawStack"),
            gamePhase = GamePhase.valueOf(json.getString("gamePhase")),
            rules = jsonToRules(json.getJSONObject("rules")),
            mode = GameMode.valueOf(json.getString("mode")),
            logs = logs,
            winner = winner,
            roundNumber = json.optInt("roundNumber", 1),
            drawnThisTurn = json.optBoolean("drawnThisTurn", false),
            cardDrawnThisTurn = cardDrawn,
            unplayableDrawnNotice = unplayableNotice,
            roomCode = json.optString("roomCode").takeIf { it.isNotEmpty() }
        )
    }
}
