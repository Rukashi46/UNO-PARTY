package com.example.network

import android.util.Log
import com.example.engine.UnoGameEngine
import com.example.engine.UnoGameState
import com.example.model.GameLogEntry
import com.example.model.GameMode
import com.example.model.GamePhase
import com.example.model.GameRules
import com.example.model.Player
import com.example.model.UnoCard
import com.example.model.UnoColor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap

class UnoWlanServer(
    private val scope: CoroutineScope,
    private val onStateUpdated: (UnoGameState) -> Unit
) {
    private val tag = "UnoWlanServer"
    private var serverSocket: ServerSocket? = null
    private var udpSocket: DatagramSocket? = null
    private var acceptJob: Job? = null
    private var beaconJob: Job? = null
    private var pingJob: Job? = null

    var currentPort: Int = UnoNetworkProtocol.DEFAULT_PORT
        private set

    var currentRoomCode: String = "UNO-7777"
        private set

    var hostName: String = "Host"
        private set

    var hostPlayerId: String = ""
        private set

    private var serverRules: GameRules = GameRules()

    private val _connectedPlayers = MutableStateFlow<List<Player>>(emptyList())
    val connectedPlayers: StateFlow<List<Player>> = _connectedPlayers.asStateFlow()

    private val _isServerRunning = MutableStateFlow(false)
    val isServerRunning: StateFlow<Boolean> = _isServerRunning.asStateFlow()

    private val clientSockets = ConcurrentHashMap<String, ClientSession>()
    private var currentGameState: UnoGameState? = null

    data class ClientSession(
        val socket: Socket,
        val writer: PrintWriter,
        val player: Player,
        var lastPingSent: Long = 0L
    )

    fun getLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces().toList()
            // Prioritize Wi-Fi and hotspot interfaces: wlan, ap, softap, eth
            val sortedInterfaces = interfaces.sortedByDescending { nIf ->
                val name = nIf.name.lowercase()
                when {
                    name.startsWith("wlan") -> 4
                    name.startsWith("ap") || name.startsWith("softap") -> 3
                    name.startsWith("eth") -> 2
                    name.startsWith("rndis") -> 1
                    else -> 0
                }
            }
            for (nIf in sortedInterfaces) {
                val addresses = nIf.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val host = addr.hostAddress ?: continue
                        if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
                            return host
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to get local IP", e)
        }
        return "127.0.0.1"
    }

    fun startServer(
        roomCode: String,
        hostPlayer: Player,
        port: Int = UnoNetworkProtocol.DEFAULT_PORT
    ) {
        stopServer()
        currentRoomCode = roomCode
        hostName = hostPlayer.name
        hostPlayerId = hostPlayer.id
        currentPort = port

        val localIp = getLocalIpAddress()
        Log.d(tag, "[ROOM] createRoom roomCode=$roomCode host=${hostPlayer.name} ip=$localIp port=$port")

        val initialHost = hostPlayer.copy(
            isHost = true,
            isHuman = true,
            isConnected = true,
            isReconnecting = false,
            pingMs = 0
        )
        _connectedPlayers.value = listOf(initialHost)
        _isServerRunning.value = true

        acceptJob = scope.launch(Dispatchers.IO) {
            try {
                serverSocket = ServerSocket(port)
                Log.d(tag, "[ROOM] WLAN Server listening on $localIp:$port")

                startUdpBeacon()
                startPingLoop()

                while (isActive) {
                    val socket = serverSocket?.accept() ?: break
                    launch(Dispatchers.IO) {
                        handleIncomingConnection(socket)
                    }
                }
            } catch (e: Exception) {
                if (isActive) {
                    Log.e(tag, "[ROOM] Server error: ${e.message}")
                }
            }
        }
    }

    private fun handleIncomingConnection(socket: Socket) {
        var playerId = ""
        val socketAddress = socket.remoteSocketAddress?.toString() ?: "unknown"
        Log.d(tag, "[CONNECTION] socket connected socketId=$socketAddress")

        try {
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            val writer = PrintWriter(socket.getOutputStream(), true)

            // Read messages from client
            var line: String? = reader.readLine()
            while (line != null) {
                val json = JSONObject(line)
                val type = json.getString("type")

                when (type) {
                    UnoNetworkProtocol.MSG_JOIN_LOBBY, UnoNetworkProtocol.MSG_JOIN_REQUEST -> {
                        playerId = json.getString("playerId")
                        val playerName = json.getString("name")
                        val playerAvatar = json.optString("avatar", "😎")
                        val requestedCode = json.optString("roomCode", "")

                        Log.d(tag, "[JOIN] playerId=$playerId username=$playerName roomCode=$requestedCode")

                        // 1. Room Code Validation
                        if (requestedCode.isNotEmpty()) {
                            val cleanReq = requestedCode.removePrefix("WLAN-").removePrefix("UNO-").removePrefix("ONLINE-").trim()
                            val cleanCur = currentRoomCode.removePrefix("WLAN-").removePrefix("UNO-").removePrefix("ONLINE-").trim()
                            val matches = cleanReq.equals(cleanCur, ignoreCase = true) ||
                                    requestedCode.equals(currentRoomCode, ignoreCase = true) ||
                                    requestedCode.contains(getLocalIpAddress())
                            if (!matches) {
                                Log.w(tag, "[ROOM] join rejected reason=${UnoNetworkProtocol.ERR_INVALID_ROOM_CODE}")
                                val reject = JSONObject().apply {
                                    put("type", UnoNetworkProtocol.MSG_JOIN_REJECTED)
                                    put("reason", UnoNetworkProtocol.ERR_INVALID_ROOM_CODE)
                                    put("message", "Room code $requestedCode does not match host room $currentRoomCode")
                                }
                                writer.println(reject.toString())
                                return
                            }
                        }

                        // 2. Capacity Check (Max 10 players)
                        val currentList = _connectedPlayers.value
                        val isExisting = currentList.any { it.id == playerId }
                        if (!isExisting && currentList.size >= 10) {
                            Log.w(tag, "[ROOM] join rejected reason=${UnoNetworkProtocol.ERR_ROOM_FULL}")
                            val reject = JSONObject().apply {
                                put("type", UnoNetworkProtocol.MSG_JOIN_REJECTED)
                                put("reason", UnoNetworkProtocol.ERR_ROOM_FULL)
                                put("message", "Room is full (10/10 players)")
                            }
                            writer.println(reject.toString())
                            return
                        }

                        // 3. Game in-progress check
                        val activeGame = currentGameState
                        if (activeGame != null && !isExisting && activeGame.players.none { it.id == playerId }) {
                            Log.w(tag, "[ROOM] join rejected reason=${UnoNetworkProtocol.ERR_GAME_ALREADY_IN_PROGRESS}")
                            val reject = JSONObject().apply {
                                put("type", UnoNetworkProtocol.MSG_JOIN_REJECTED)
                                put("reason", UnoNetworkProtocol.ERR_GAME_ALREADY_IN_PROGRESS)
                                put("message", "Game already in progress")
                            }
                            writer.println(reject.toString())
                            return
                        }

                        // Player registration
                        val newPlayer = Player(
                            id = playerId,
                            name = playerName,
                            avatar = playerAvatar,
                            isHuman = true,
                            isHost = false,
                            isConnected = true,
                            isReconnecting = false,
                            pingMs = 15
                        )
                        clientSockets[playerId] = ClientSession(socket, writer, newPlayer)

                        val updatedList = _connectedPlayers.value.toMutableList()
                        val existingIdx = updatedList.indexOfFirst { it.id == playerId }
                        if (existingIdx >= 0) {
                            updatedList[existingIdx] = newPlayer
                        } else {
                            updatedList.add(newPlayer)
                        }
                        _connectedPlayers.value = updatedList

                        Log.d(tag, "[ROOM] player joined roomCode=$currentRoomCode playerCount=${updatedList.size}")

                        // Send JOIN_ACCEPTED to this client
                        val accept = JSONObject().apply {
                            put("type", UnoNetworkProtocol.MSG_JOIN_ACCEPTED)
                            put("roomCode", currentRoomCode)
                            put("hostName", hostName)
                            put("playerId", playerId)
                        }
                        writer.println(accept.toString())

                        // Broadcast authoritative room state to all clients
                        broadcastLobbyState()

                        // If reconnecting during an active match, synchronize state
                        if (activeGame != null) {
                            val syncPlayers = activeGame.players.map {
                                if (it.id == playerId) it.copy(isConnected = true, isReconnecting = false) else it
                            }
                            val reconnectedState = activeGame.copy(players = syncPlayers)
                            currentGameState = reconnectedState
                            scope.launch(Dispatchers.Main) { onStateUpdated(reconnectedState) }
                            broadcastGameState(reconnectedState)
                        }
                    }

                    UnoNetworkProtocol.MSG_PLAYER_ACTION -> {
                        handlePlayerAction(json)
                    }

                    UnoNetworkProtocol.MSG_UPDATE_ROOM_RULES -> {
                        Log.w(tag, "Client attempted to change room rules. Ignored.")
                    }

                    UnoNetworkProtocol.MSG_PONG -> {
                        val sentTime = json.optLong("timestamp", 0L)
                        if (sentTime > 0) {
                            val rtt = (System.currentTimeMillis() - sentTime).toInt().coerceAtLeast(1)
                            updatePlayerPing(playerId, rtt)
                        }
                    }

                    UnoNetworkProtocol.MSG_LEAVE -> {
                        break
                    }
                }
                line = reader.readLine()
            }
        } catch (e: Exception) {
            Log.d(tag, "[DISCONNECT] socketId=$socketAddress playerId=$playerId (${e.message})")
        } finally {
            if (playerId.isNotEmpty()) {
                handleClientDisconnect(playerId)
            }
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun handlePlayerAction(json: JSONObject) {
        val actionType = json.getString("actionType")
        val senderId = json.getString("playerId")
        val state = currentGameState ?: return

        val playerIdx = state.players.indexOfFirst { it.id == senderId }
        if (playerIdx < 0) return

        var nextState = state
        when (actionType) {
            UnoNetworkProtocol.ACTION_PLAY_CARD -> {
                val cardJson = json.getJSONObject("card")
                val card = UnoNetworkProtocol.jsonToCard(cardJson)
                val chosenColor = if (json.has("chosenColor") && !json.isNull("chosenColor")) {
                    UnoColor.valueOf(json.getString("chosenColor"))
                } else null
                nextState = UnoGameEngine.playCard(state, playerIdx, card, chosenColor)
            }
            UnoNetworkProtocol.ACTION_DRAW_CARD -> {
                nextState = UnoGameEngine.drawCard(state, playerIdx)
            }
            UnoNetworkProtocol.ACTION_PASS_TURN -> {
                nextState = UnoGameEngine.passTurn(state, playerIdx)
            }
            UnoNetworkProtocol.ACTION_CALL_UNO -> {
                nextState = UnoGameEngine.callUno(state, playerIdx)
            }
            UnoNetworkProtocol.ACTION_CATCH_UNO -> {
                val targetIndex = json.getInt("targetIndex")
                nextState = UnoGameEngine.catchUno(state, playerIdx, targetIndex)
            }
            UnoNetworkProtocol.ACTION_CHOOSE_COLOR -> {
                val colorStr = if (json.has("chosenColor")) json.getString("chosenColor") else json.getString("color")
                val color = UnoColor.valueOf(colorStr)
                nextState = UnoGameEngine.completeWildSelection(state, color)
            }
            UnoNetworkProtocol.ACTION_CHOOSE_CUSTOM_WILD -> {
                val effect = com.example.model.CustomWildEffect.valueOf(json.getString("effect"))
                nextState = UnoGameEngine.completeCustomWildSelection(state, effect)
            }
            UnoNetworkProtocol.ACTION_CHOOSE_SEVEN_SWAP -> {
                val targetIndex = json.getInt("targetIndex")
                nextState = UnoGameEngine.executeSevenSwap(state, playerIdx, targetIndex)
            }
            UnoNetworkProtocol.ACTION_CHOOSE_COLOR_ROULETTE -> {
                val colorStr = if (json.has("chosenColor")) json.getString("chosenColor") else json.getString("color")
                val color = UnoColor.valueOf(colorStr)
                nextState = UnoGameEngine.completeColorRouletteSelection(state, playerIdx, color)
            }
            UnoNetworkProtocol.ACTION_JUMP_IN -> {
                val cardJson = json.getJSONObject("card")
                val card = UnoNetworkProtocol.jsonToCard(cardJson)
                nextState = UnoGameEngine.jumpIn(state, playerIdx, card)
            }
        }

        currentGameState = nextState
        scope.launch(Dispatchers.Main) {
            onStateUpdated(nextState)
        }
        broadcastGameState(nextState)
    }

    private fun handleClientDisconnect(playerId: String) {
        val session = clientSockets.remove(playerId)
        val socketAddress = session?.socket?.remoteSocketAddress?.toString() ?: "unknown"
        Log.d(tag, "[DISCONNECT] socketId=$socketAddress playerId=$playerId")
        val gameState = currentGameState

        if (gameState == null) {
            // Still in lobby: remove player completely
            _connectedPlayers.value = _connectedPlayers.value.filter { it.id != playerId }
            Log.d(tag, "[ROOM] player left roomCode=$currentRoomCode playerCount=${_connectedPlayers.value.size}")
            broadcastLobbyState()
        } else {
            // During active game: mark player as disconnected / reconnecting (DO NOT replace with bot)
            val updatedPlayers = gameState.players.map {
                if (it.id == playerId) it.copy(isConnected = false, isReconnecting = true) else it
            }
            val updatedState = gameState.copy(players = updatedPlayers)
            currentGameState = updatedState
            scope.launch(Dispatchers.Main) {
                onStateUpdated(updatedState)
            }
            broadcastGameState(updatedState)
        }
    }

    private fun updatePlayerPing(playerId: String, ping: Int) {
        _connectedPlayers.value = _connectedPlayers.value.map {
            if (it.id == playerId) it.copy(pingMs = ping) else it
        }
        currentGameState?.let { state ->
            val updatedPlayers = state.players.map {
                if (it.id == playerId) it.copy(pingMs = ping) else it
            }
            val updated = state.copy(players = updatedPlayers)
            currentGameState = updated
            scope.launch(Dispatchers.Main) {
                onStateUpdated(updated)
            }
        }
    }

    fun broadcastLobbyState() {
        val clientCount = _connectedPlayers.value.size
        Log.d(tag, "[BROADCAST] room state sent to $clientCount clients")
        val json = JSONObject().apply {
            put("type", UnoNetworkProtocol.MSG_LOBBY_UPDATE)
            put("roomCode", currentRoomCode)
            put("hostIp", getLocalIpAddress())
            put("port", currentPort)
            val playersArr = JSONArray()
            _connectedPlayers.value.forEach { playersArr.put(UnoNetworkProtocol.playerToJson(it, includePrivateHand = false)) }
            put("players", playersArr)
            put("rules", UnoNetworkProtocol.rulesToJson(serverRules))
            put("canStart", clientCount >= 2)
        }
        sendToAllClients(json.toString())
    }

    fun updateRules(newRules: GameRules) {
        serverRules = newRules
        // If match is active, update rules on current game state and broadcast state update to all players
        val current = currentGameState
        if (current != null && current.gamePhase != GamePhase.NOT_STARTED) {
            val updatedState = current.copy(
                rules = newRules,
                logs = current.logs + GameLogEntry(text = "👑 Host updated House Rules", isAlert = true)
            )
            updateAndBroadcastHostState(updatedState)
        }

        val json = JSONObject().apply {
            put("type", UnoNetworkProtocol.MSG_RULES_UPDATED)
            put("rules", UnoNetworkProtocol.rulesToJson(newRules))
        }
        sendToAllClients(json.toString())
    }

    fun startGame(rules: GameRules, mode: GameMode): UnoGameState? {
        val players = _connectedPlayers.value
        if (players.size < 2) return null

        serverRules = rules
        val initialState = UnoGameEngine.startNewGameWithPlayers(
            players = players,
            mode = mode,
            rules = rules,
            roomCode = currentRoomCode
        )

        currentGameState = initialState
        scope.launch(Dispatchers.Main) {
            onStateUpdated(initialState)
        }

        // Broadcast personalized START_GAME to all clients (opponent private hands stripped server-side)
        scope.launch(Dispatchers.IO) {
            clientSockets.forEach { (playerId, session) ->
                try {
                    val personalizedJson = UnoNetworkProtocol.stateToJsonForPlayer(initialState, playerId)
                    val json = JSONObject().apply {
                        put("type", UnoNetworkProtocol.MSG_START_GAME)
                        put("gameState", personalizedJson)
                    }
                    session.writer.println(json.toString())
                } catch (e: Exception) {
                    Log.e(tag, "Failed to send START_GAME to client $playerId: ${e.message}")
                }
            }
        }

        return initialState
    }

    fun updateAndBroadcastHostState(state: UnoGameState) {
        currentGameState = state
        broadcastGameState(state)
    }

    fun broadcastGameState(state: UnoGameState) {
        currentGameState = state
        scope.launch(Dispatchers.IO) {
            clientSockets.forEach { (playerId, session) ->
                try {
                    val personalizedJson = UnoNetworkProtocol.stateToJsonForPlayer(state, playerId)
                    val json = JSONObject().apply {
                        put("type", UnoNetworkProtocol.MSG_SYNC_STATE)
                        put("gameState", personalizedJson)
                    }
                    session.writer.println(json.toString())
                } catch (e: Exception) {
                    Log.e(tag, "Failed to send SYNC_STATE to client $playerId: ${e.message}")
                }
            }
        }
    }

    private fun sendToAllClients(msg: String) {
        scope.launch(Dispatchers.IO) {
            clientSockets.values.forEach { session ->
                try {
                    session.writer.println(msg)
                } catch (e: Exception) {
                    Log.e(tag, "Failed to send to client: ${e.message}")
                }
            }
        }
    }

    private fun startUdpBeacon() {
        beaconJob?.cancel()
        beaconJob = scope.launch(Dispatchers.IO) {
            try {
                udpSocket = DatagramSocket()
                udpSocket?.broadcast = true
                val broadcastAddr = InetAddress.getByName("255.255.255.255")

                while (isActive) {
                    val message = "UNO_ROOM|$currentRoomCode|$hostName|${getLocalIpAddress()}|$currentPort|${_connectedPlayers.value.size}|$hostPlayerId"
                    val bytes = message.toByteArray()
                    val packet = DatagramPacket(bytes, bytes.size, broadcastAddr, UnoNetworkProtocol.UDP_DISCOVERY_PORT)
                    udpSocket?.send(packet)
                    delay(1500)
                }
            } catch (e: Exception) {
                if (isActive) Log.e(tag, "UDP Beacon error: ${e.message}")
            }
        }
    }

    private fun startPingLoop() {
        pingJob?.cancel()
        pingJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(3000)
                val now = System.currentTimeMillis()
                clientSockets.values.forEach { session ->
                    session.lastPingSent = now
                    try {
                        val pingMsg = JSONObject().apply {
                            put("type", UnoNetworkProtocol.MSG_PING)
                            put("timestamp", now)
                        }
                        session.writer.println(pingMsg.toString())
                    } catch (_: Exception) {}
                }
            }
        }
    }

    fun stopServer() {
        acceptJob?.cancel()
        beaconJob?.cancel()
        pingJob?.cancel()

        try {
            clientSockets.values.forEach { it.socket.close() }
            clientSockets.clear()
        } catch (_: Exception) {}

        try { serverSocket?.close() } catch (_: Exception) {}
        try { udpSocket?.close() } catch (_: Exception) {}

        serverSocket = null
        udpSocket = null
        currentGameState = null
        _isServerRunning.value = false
        _connectedPlayers.value = emptyList()
    }
}
