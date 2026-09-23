package com.example.network

import android.util.Log
import com.example.engine.UnoGameState
import com.example.model.CustomWildEffect
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
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket

data class DiscoveredRoom(
    val roomCode: String,
    val hostName: String,
    val hostIp: String,
    val port: Int,
    val playerCount: Int,
    val timestamp: Long = System.currentTimeMillis()
)

class UnoWlanClient(
    private val scope: CoroutineScope,
    private val onStateUpdated: (UnoGameState) -> Unit,
    private val onGameStarted: (UnoGameState) -> Unit
) {
    private val tag = "UnoWlanClient"
    private var socket: Socket? = null
    private var writer: PrintWriter? = null
    private var reader: BufferedReader? = null
    private var receiveJob: Job? = null
    private var discoveryJob: Job? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _isReconnecting = MutableStateFlow(false)
    val isReconnecting: StateFlow<Boolean> = _isReconnecting.asStateFlow()

    private val _lobbyPlayers = MutableStateFlow<List<Player>>(emptyList())
    val lobbyPlayers: StateFlow<List<Player>> = _lobbyPlayers.asStateFlow()

    private val _currentRoomCode = MutableStateFlow("")
    val currentRoomCode: StateFlow<String> = _currentRoomCode.asStateFlow()

    private val _discoveredRooms = MutableStateFlow<List<DiscoveredRoom>>(emptyList())
    val discoveredRooms: StateFlow<List<DiscoveredRoom>> = _discoveredRooms.asStateFlow()

    private var localPlayer: Player? = null
    private var lastHostIp: String = ""
    private var lastPort: Int = UnoNetworkProtocol.DEFAULT_PORT

    fun startDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = scope.launch(Dispatchers.IO) {
            var udpSocket: DatagramSocket? = null
            try {
                udpSocket = DatagramSocket(null).apply {
                    reuseAddress = true
                    bind(InetSocketAddress(UnoNetworkProtocol.UDP_DISCOVERY_PORT))
                }
                val buffer = ByteArray(1024)

                while (isActive) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    udpSocket.receive(packet)
                    val message = String(packet.data, 0, packet.length)

                    if (message.startsWith("UNO_ROOM|")) {
                        val parts = message.split("|")
                        if (parts.size >= 6) {
                            val room = DiscoveredRoom(
                                roomCode = parts[1],
                                hostName = parts[2],
                                hostIp = parts[3],
                                port = parts[4].toIntOrNull() ?: UnoNetworkProtocol.DEFAULT_PORT,
                                playerCount = parts[5].toIntOrNull() ?: 1
                            )
                            val now = System.currentTimeMillis()
                            val updated = _discoveredRooms.value
                                .filter { it.roomCode != room.roomCode && (now - it.timestamp < 6000) }
                                .plus(room)
                            _discoveredRooms.value = updated
                        }
                    }
                }
            } catch (e: Exception) {
                if (isActive) Log.e(tag, "Discovery error: ${e.message}")
            } finally {
                try { udpSocket?.close() } catch (_: Exception) {}
            }
        }
    }

    fun stopDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = null
        _discoveredRooms.value = emptyList()
    }

    fun connectToHost(hostIp: String, port: Int = UnoNetworkProtocol.DEFAULT_PORT, player: Player) {
        disconnect()
        localPlayer = player
        lastHostIp = hostIp
        lastPort = port

        receiveJob = scope.launch(Dispatchers.IO) {
            try {
                Log.d(tag, "Connecting to host at $hostIp:$port...")
                val sock = Socket()
                sock.connect(InetSocketAddress(hostIp, port), 5000)
                socket = sock
                writer = PrintWriter(sock.getOutputStream(), true)
                reader = BufferedReader(InputStreamReader(sock.getInputStream()))

                _isConnected.value = true
                _isReconnecting.value = false

                // Send join request
                val joinMsg = JSONObject().apply {
                    put("type", UnoNetworkProtocol.MSG_JOIN_LOBBY)
                    put("playerId", player.id)
                    put("name", player.name)
                    put("avatar", player.avatar)
                }
                writer?.println(joinMsg.toString())

                // Listen loop
                while (isActive) {
                    val line = reader?.readLine() ?: break
                    val json = JSONObject(line)
                    val type = json.getString("type")

                    when (type) {
                        UnoNetworkProtocol.MSG_LOBBY_UPDATE -> {
                            val roomCode = json.optString("roomCode", "")
                            _currentRoomCode.value = roomCode
                            val playersArr = json.getJSONArray("players")
                            val players = mutableListOf<Player>()
                            for (i in 0 until playersArr.length()) {
                                players.add(UnoNetworkProtocol.jsonToPlayer(playersArr.getJSONObject(i)))
                            }
                            _lobbyPlayers.value = players
                        }

                        UnoNetworkProtocol.MSG_START_GAME -> {
                            val stateJson = json.getJSONObject("gameState")
                            val state = UnoNetworkProtocol.jsonToState(stateJson)
                            scope.launch(Dispatchers.Main) {
                                onGameStarted(state)
                            }
                        }

                        UnoNetworkProtocol.MSG_SYNC_STATE -> {
                            val stateJson = json.getJSONObject("gameState")
                            val state = UnoNetworkProtocol.jsonToState(stateJson)
                            scope.launch(Dispatchers.Main) {
                                onStateUpdated(state)
                            }
                        }

                        UnoNetworkProtocol.MSG_PING -> {
                            val timestamp = json.optLong("timestamp", System.currentTimeMillis())
                            val pongMsg = JSONObject().apply {
                                put("type", UnoNetworkProtocol.MSG_PONG)
                                put("timestamp", timestamp)
                            }
                            writer?.println(pongMsg.toString())
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(tag, "Connection error: ${e.message}")
            } finally {
                _isConnected.value = false
                if (isActive && lastHostIp.isNotEmpty()) {
                    triggerReconnect()
                }
            }
        }
    }

    private fun triggerReconnect() {
        scope.launch(Dispatchers.IO) {
            _isReconnecting.value = true
            delay(2000)
            localPlayer?.let { player ->
                if (lastHostIp.isNotEmpty()) {
                    connectToHost(lastHostIp, lastPort, player)
                }
            }
        }
    }

    fun sendAction(
        actionType: String,
        card: UnoCard? = null,
        chosenColor: UnoColor? = null,
        targetIndex: Int? = null,
        effect: CustomWildEffect? = null
    ) {
        val player = localPlayer ?: return
        val json = JSONObject().apply {
            put("type", UnoNetworkProtocol.MSG_PLAYER_ACTION)
            put("actionType", actionType)
            put("playerId", player.id)
            card?.let { put("card", UnoNetworkProtocol.cardToJson(it)) }
            chosenColor?.let { put("chosenColor", it.name) }
            targetIndex?.let { put("targetIndex", it) }
            effect?.let { put("effect", it.name) }
        }

        scope.launch(Dispatchers.IO) {
            try {
                writer?.println(json.toString())
            } catch (e: Exception) {
                Log.e(tag, "Failed to send action: ${e.message}")
            }
        }
    }

    fun disconnect() {
        receiveJob?.cancel()
        receiveJob = null
        try {
            val leaveMsg = JSONObject().apply { put("type", UnoNetworkProtocol.MSG_LEAVE) }
            writer?.println(leaveMsg.toString())
        } catch (_: Exception) {}

        try { socket?.close() } catch (_: Exception) {}
        socket = null
        writer = null
        reader = null
        _isConnected.value = false
        _isReconnecting.value = false
        _lobbyPlayers.value = emptyList()
    }
}
