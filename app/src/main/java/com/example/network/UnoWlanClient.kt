package com.example.network

import android.util.Log
import com.example.engine.UnoGameState
import com.example.model.CustomWildEffect
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
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

data class DiscoveredRoom(
    val roomCode: String,
    val hostName: String,
    val hostIp: String,
    val port: Int,
    val playerCount: Int,
    val hostPlayerId: String = "",
    val timestamp: Long = System.currentTimeMillis()
)

class UnoWlanClient(
    private val scope: CoroutineScope,
    private val onStateUpdated: (UnoGameState) -> Unit,
    private val onGameStarted: (UnoGameState) -> Unit
) {
    private val tag = "UnoWlanClient"
    var onRulesUpdated: ((GameRules) -> Unit)? = null
    private var socket: Socket? = null
    private var writer: PrintWriter? = null
    private var reader: BufferedReader? = null
    private var receiveJob: Job? = null
    private var discoveryJob: Job? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _connectionStatus = MutableStateFlow(UnoNetworkProtocol.ConnectionStatus.DISCONNECTED)
    val connectionStatus: StateFlow<UnoNetworkProtocol.ConnectionStatus> = _connectionStatus.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

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
    private var targetRoomCode: String = ""

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
                    val message = String(packet.data, 0, packet.length).trim()

                    if (message.startsWith("UNO_ROOM|")) {
                        val parts = message.split("|")
                        if (parts.size >= 6) {
                            val hostPlayerId = if (parts.size >= 7) parts[6] else ""
                            val myId = localPlayer?.id ?: ""
                            if (myId.isNotEmpty() && hostPlayerId == myId) {
                                // Do not show host's own room in Wi-Fi discovery on the host device
                                continue
                            }

                            val room = DiscoveredRoom(
                                roomCode = parts[1],
                                hostName = parts[2],
                                hostIp = parts[3],
                                port = parts[4].toIntOrNull() ?: UnoNetworkProtocol.DEFAULT_PORT,
                                playerCount = parts[5].toIntOrNull() ?: 1,
                                hostPlayerId = hostPlayerId
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

    fun connectToHost(hostIp: String, port: Int = UnoNetworkProtocol.DEFAULT_PORT, player: Player, roomCode: String = "") {
        disconnect()
        localPlayer = player
        lastHostIp = hostIp
        lastPort = port
        targetRoomCode = roomCode
        _errorMessage.value = null
        _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.CONNECTING

        receiveJob = scope.launch(Dispatchers.IO) {
            try {
                Log.d(tag, "[NETWORK] connecting to $hostIp:$port...")
                val sock = Socket()
                sock.connect(InetSocketAddress(hostIp, port), 4500)
                socket = sock
                writer = PrintWriter(sock.getOutputStream(), true)
                reader = BufferedReader(InputStreamReader(sock.getInputStream()))

                Log.d(tag, "[NETWORK] connected socketId=${sock.remoteSocketAddress}")
                _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.CONNECTED

                // Send join request
                Log.d(tag, "[ROOM] joining $roomCode (playerId=${player.id}, username=${player.name})")
                _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.JOINING

                val joinMsg = JSONObject().apply {
                    put("type", UnoNetworkProtocol.MSG_JOIN_REQUEST)
                    put("playerId", player.id)
                    put("name", player.name)
                    put("avatar", player.avatar)
                    put("roomCode", roomCode)
                }
                writer?.println(joinMsg.toString())

                // Listen loop
                while (isActive) {
                    val line = reader?.readLine() ?: break
                    val json = JSONObject(line)
                    val type = json.getString("type")

                    when (type) {
                        UnoNetworkProtocol.MSG_JOIN_ACCEPTED -> {
                            Log.d(tag, "[ROOM] join accepted")
                            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.JOINED
                            _isConnected.value = true
                            _isReconnecting.value = false
                            _errorMessage.value = null
                            val acceptedRoom = json.optString("roomCode", roomCode)
                            _currentRoomCode.value = acceptedRoom
                        }

                        UnoNetworkProtocol.MSG_JOIN_REJECTED -> {
                            val reason = json.optString("reason", UnoNetworkProtocol.ERR_SOCKET_CONNECTION_FAILED)
                            val message = json.optString("message", reason)
                            Log.w(tag, "[ROOM] join rejected reason=$reason ($message)")
                            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.ERROR
                            _errorMessage.value = "$reason: $message"
                            _isConnected.value = false
                            return@launch
                        }

                        UnoNetworkProtocol.MSG_LOBBY_UPDATE -> {
                            val receivedRoom = json.optString("roomCode", "")
                            if (receivedRoom.isNotEmpty()) _currentRoomCode.value = receivedRoom
                            val playersArr = json.getJSONArray("players")
                            val players = mutableListOf<Player>()
                            for (i in 0 until playersArr.length()) {
                                players.add(UnoNetworkProtocol.jsonToPlayer(playersArr.getJSONObject(i)))
                            }
                            _lobbyPlayers.value = players
                            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.JOINED
                            _isConnected.value = true
                            Log.d(tag, "[ROOM] room state received")
                            Log.d(tag, "[ROOM] players = ${players.map { it.name }}")
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

                        UnoNetworkProtocol.MSG_RULES_UPDATED -> {
                            val rulesJson = json.getJSONObject("rules")
                            val rules = UnoNetworkProtocol.jsonToRules(rulesJson)
                            scope.launch(Dispatchers.Main) {
                                onRulesUpdated?.invoke(rules)
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
                val errCode = when (e) {
                    is java.net.ConnectException -> UnoNetworkProtocol.ERR_SERVER_UNREACHABLE
                    is java.net.SocketTimeoutException -> UnoNetworkProtocol.ERR_JOIN_TIMEOUT
                    is java.net.UnknownHostException -> UnoNetworkProtocol.ERR_NETWORK_UNREACHABLE
                    else -> UnoNetworkProtocol.ERR_SOCKET_CONNECTION_FAILED
                }
                Log.e(tag, "[ROOM] join rejected reason=$errCode (${e.message})")
                _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.ERROR
                _errorMessage.value = "$errCode: Could not reach host at $hostIp:$port"
            } finally {
                _isConnected.value = false
                if (isActive && lastHostIp.isNotEmpty() && _connectionStatus.value != UnoNetworkProtocol.ConnectionStatus.ERROR) {
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

    fun resolveAndConnect(input: String, player: Player) {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) {
            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.ERROR
            _errorMessage.value = "${UnoNetworkProtocol.ERR_INVALID_ROOM_CODE}: Please enter a room code or IP address"
            return
        }

        // 1. Direct IP or Encoded Base36 IP check
        val decoded = RoomCodeUtil.decodeRoomCodeToIp(trimmed)
        if (decoded != null) {
            val (ip, port) = decoded
            connectToHost(ip, port, player, trimmed)
            return
        }

        // 2. Search active discovered rooms on local Wi-Fi
        val cleanInput = trimmed.removePrefix("WLAN-").removePrefix("UNO-").removePrefix("ONLINE-")
        val match = _discoveredRooms.value.firstOrNull { room ->
            val cleanRoom = room.roomCode.removePrefix("WLAN-").removePrefix("UNO-").removePrefix("ONLINE-")
            cleanRoom.equals(cleanInput, ignoreCase = true) || room.roomCode.equals(trimmed, ignoreCase = true)
        }
        if (match != null) {
            connectToHost(match.hostIp, match.port, player, match.roomCode)
            return
        }

        // 3. Supabase Cloud Room Lookup (Online Mode)
        if (SupabaseManager.isConfigured) {
            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.CONNECTING
            scope.launch(Dispatchers.IO) {
                val cloudRoom = SupabaseManager.lookupRoom(trimmed)
                if (cloudRoom != null && !cloudRoom.hostAddress.isNullOrBlank()) {
                    val decodedCloud = RoomCodeUtil.decodeRoomCodeToIp(cloudRoom.hostAddress)
                    if (decodedCloud != null) {
                        connectToHost(decodedCloud.first, decodedCloud.second, player, trimmed)
                        return@launch
                    }
                }
                performUdpRoomQuery(trimmed, player)
            }
            return
        }

        // 4. Active UDP Query across local broadcast
        performUdpRoomQuery(trimmed, player)
    }

    private fun performUdpRoomQuery(trimmed: String, player: Player) {
        _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.CONNECTING
        scope.launch(Dispatchers.IO) {
            try {
                val querySocket = DatagramSocket()
                querySocket.broadcast = true
                querySocket.soTimeout = 1200
                val broadcastAddr = InetAddress.getByName("255.255.255.255")
                val queryMsg = "UNO_FIND_ROOM|$trimmed"
                val qBytes = queryMsg.toByteArray()
                val qPacket = DatagramPacket(qBytes, qBytes.size, broadcastAddr, UnoNetworkProtocol.UDP_DISCOVERY_PORT)
                querySocket.send(qPacket)

                val rcvBuf = ByteArray(1024)
                val rcvPacket = DatagramPacket(rcvBuf, rcvBuf.size)
                querySocket.receive(rcvPacket)
                val respMsg = String(rcvPacket.data, 0, rcvPacket.length).trim()
                querySocket.close()

                if (respMsg.startsWith("UNO_ROOM|")) {
                    val parts = respMsg.split("|")
                    if (parts.size >= 5) {
                        val hostIp = parts[3]
                        val port = parts[4].toIntOrNull() ?: UnoNetworkProtocol.DEFAULT_PORT
                        connectToHost(hostIp, port, player, trimmed)
                        return@launch
                    }
                }
            } catch (_: Exception) {}

            // Failed to find room
            _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.ERROR
            _errorMessage.value = "${UnoNetworkProtocol.ERR_ROOM_NOT_FOUND}: Could not find room '$trimmed' on Wi-Fi. Ensure both devices are on the same Wi-Fi/Hotspot or use the host's IP address."
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
        _connectionStatus.value = UnoNetworkProtocol.ConnectionStatus.DISCONNECTED
        _errorMessage.value = null
    }
}
