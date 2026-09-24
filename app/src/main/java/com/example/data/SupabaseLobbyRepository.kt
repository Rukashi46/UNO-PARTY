package com.example.data

import android.util.Log
import com.example.model.GameRules
import com.example.model.Player
import com.example.network.SupabaseDataService
import com.example.network.SupabaseLobbyState
import com.example.network.SupabaseManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * SupabaseLobbyRepository:
 * Central repository managing real-time game lobby synchronization and persistent configuration storage.
 * Enforces authoritative rules:
 * - ONLY the verified host can modify match settings.
 * - Non-host / client requests are rejected with explicit feedback.
 * - Polls lobby state in real-time and provides reactive StateFlows to the UI and ViewModel.
 * - Persists match settings locally and in the Supabase cloud.
 */
class SupabaseLobbyRepository(
    private val localRepository: UnoRepository,
    private val dataService: SupabaseDataService = SupabaseDataService(),
    private val scope: CoroutineScope
) {
    private val tag = "SupabaseLobbyRepo"

    private val _lobbyState = MutableStateFlow(SupabaseLobbyState())
    val lobbyState: StateFlow<SupabaseLobbyState> = _lobbyState.asStateFlow()

    private val _errorMessage = MutableSharedFlow<String>(extraBufferCapacity = 5)
    val errorMessage: SharedFlow<String> = _errorMessage.asSharedFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private var pollingJob: Job? = null
    private var heartbeatJob: Job? = null
    private var activeRoomCode: String = ""
    private var currentUserId: String = ""

    /**
     * Start hosting a room with real-time Supabase coordination.
     */
    fun startHosting(
        roomCode: String,
        hostPlayer: Player,
        mode: String,
        rules: GameRules,
        hostAddress: String?
    ) {
        stopSync()
        activeRoomCode = roomCode
        currentUserId = hostPlayer.id

        _lobbyState.value = SupabaseLobbyState(
            roomCode = roomCode,
            hostPlayerId = hostPlayer.id,
            mode = mode,
            status = "LOBBY",
            hostAddress = hostAddress,
            rules = rules,
            players = listOf(hostPlayer),
            isHost = true
        )

        scope.launch(Dispatchers.IO) {
            _isSyncing.value = true
            val registered = dataService.registerHostRoom(
                roomCode = roomCode,
                hostPlayer = hostPlayer,
                mode = mode,
                rules = rules,
                hostAddress = hostAddress
            )
            Log.d(tag, "[HOST] Room $roomCode registered with Supabase: $registered")
            localRepository.saveGameConfig(rules, "Host_Active_Lobby")
            startPollingAndHeartbeat(roomCode, hostPlayer, isHost = true)
        }
    }

    /**
     * Join an existing room and start real-time lobby synchronization.
     */
    fun joinRoom(
        roomCode: String,
        clientPlayer: Player
    ) {
        stopSync()
        activeRoomCode = roomCode
        currentUserId = clientPlayer.id

        _lobbyState.value = SupabaseLobbyState(
            roomCode = roomCode,
            players = listOf(clientPlayer),
            isHost = false
        )

        scope.launch(Dispatchers.IO) {
            _isSyncing.value = true
            dataService.upsertPlayerPresence(roomCode, clientPlayer, isHost = false)
            startPollingAndHeartbeat(roomCode, clientPlayer, isHost = false)
        }
    }

    /**
     * Modify match settings & house rules.
     * Enforces that ONLY the host can modify settings!
     */
    suspend fun updateMatchSettings(
        roomCode: String,
        requestingPlayerId: String,
        newRules: GameRules,
        configName: String = "Custom"
    ): Boolean {
        // Enforce host permission check locally before network call
        val currentState = _lobbyState.value
        val isVerifiedHost = (requestingPlayerId == currentState.hostPlayerId) || currentState.isHost

        if (!isVerifiedHost) {
            val msg = "⚠️ Only the host can modify match settings."
            Log.w(tag, "[SECURITY] $msg (User: $requestingPlayerId)")
            _errorMessage.emit(msg)
            return false
        }

        // Host is verified: update local state & Room database persistence
        _lobbyState.value = currentState.copy(rules = newRules)
        localRepository.saveGameConfig(newRules, configName)

        // Persist to Supabase
        if (SupabaseManager.isConfigured && roomCode.isNotBlank()) {
            val result = dataService.updateMatchRules(roomCode, requestingPlayerId, newRules)
            result.onFailure { error ->
                Log.w(tag, "[SETTINGS] Failed to push rules to Supabase: ${error.message}")
                if (error is SecurityException) {
                    _errorMessage.emit(error.message ?: "Permission denied")
                    return false
                }
            }
        }
        return true
    }

    /**
     * Leave the lobby and clean up network resources.
     */
    fun leaveLobby(roomCode: String, playerId: String) {
        val wasHost = _lobbyState.value.isHost
        stopSync()
        scope.launch(Dispatchers.IO) {
            if (wasHost) {
                SupabaseManager.closeRoom(roomCode)
            } else {
                dataService.removePlayerFromRoom(roomCode, playerId)
            }
        }
        _lobbyState.value = SupabaseLobbyState()
    }

    private fun startPollingAndHeartbeat(
        roomCode: String,
        player: Player,
        isHost: Boolean
    ) {
        // 1. Polling Job: sync lobby participants and rules every 2.5 seconds
        pollingJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val snapshot = dataService.fetchLobbySnapshot(roomCode, currentUserId)
                    if (snapshot != null) {
                        _lobbyState.value = snapshot
                    }
                } catch (e: Exception) {
                    Log.w(tag, "[POLL] Error polling lobby snapshot: ${e.message}")
                }
                delay(2500L)
            }
        }

        // 2. Heartbeat Job: refresh presence every 10 seconds
        heartbeatJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(10_000L)
                try {
                    dataService.upsertPlayerPresence(roomCode, player, isHost)
                } catch (e: Exception) {
                    Log.w(tag, "[HEARTBEAT] Error sending presence heartbeat: ${e.message}")
                }
            }
        }
    }

    private fun stopSync() {
        pollingJob?.cancel()
        pollingJob = null
        heartbeatJob?.cancel()
        heartbeatJob = null
        _isSyncing.value = false
    }
}
