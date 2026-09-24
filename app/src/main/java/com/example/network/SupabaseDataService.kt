package com.example.network

import android.util.Log
import com.example.model.GameRules
import com.example.model.Player
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Data model representing real-time lobby state fetched from Supabase.
 */
data class SupabaseLobbyState(
    val roomCode: String = "",
    val hostPlayerId: String = "",
    val mode: String = "ONLINE_ROOM",
    val status: String = "LOBBY",
    val hostAddress: String? = null,
    val rules: GameRules = GameRules(),
    val players: List<Player> = emptyList(),
    val isHost: Boolean = false,
    val lastUpdated: Long = System.currentTimeMillis()
)

/**
 * SupabaseDataService:
 * Remote HTTP & Real-Time polling service communicating with Supabase PostgREST endpoints.
 * Handles:
 * - Upserting rooms and player registrations in `rooms` and `room_players`
 * - Polling lobby state and participant presence in real-time
 * - Host-authenticated match settings updates
 * - Heartbeats and heartbeat pruning
 */
class SupabaseDataService(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .build()
) {
    private val tag = "SupabaseDataService"
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val isConfigured: Boolean get() = SupabaseManager.isConfigured

    suspend fun registerHostRoom(
        roomCode: String,
        hostPlayer: Player,
        mode: String,
        rules: GameRules,
        hostAddress: String?
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext false
        try {
            val rulesJson = UnoNetworkProtocol.rulesToJson(rules)
            val body = JSONObject().apply {
                put("room_code", roomCode)
                put("host_player_id", hostPlayer.id)
                put("mode", mode)
                put("status", "LOBBY")
                put("max_players", 10)
                put("rules", rulesJson)
                if (!hostAddress.isNullOrBlank()) {
                    put("host_address", hostAddress)
                }
                put("updated_at", System.currentTimeMillis())
            }

            val request = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/rooms?on_conflict=room_code")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates")
                .post(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                Log.d(tag, "[LOBBY] registerHostRoom code=${response.code} room=$roomCode")
                if (response.isSuccessful) {
                    upsertPlayerPresence(roomCode, hostPlayer, isHost = true)
                    return@withContext true
                }
            }
        } catch (e: Exception) {
            Log.w(tag, "[LOBBY] Failed to register host room in Supabase: ${e.message}")
        }
        false
    }

    suspend fun upsertPlayerPresence(
        roomCode: String,
        player: Player,
        isHost: Boolean
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext false
        try {
            val body = JSONObject().apply {
                put("room_code", roomCode)
                put("player_id", player.id)
                put("name", player.name)
                put("avatar", player.avatar)
                put("is_host", isHost)
                put("last_seen", System.currentTimeMillis())
            }

            val request = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/room_players?on_conflict=room_code,player_id")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates")
                .post(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                return@withContext response.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(tag, "[LOBBY] upsertPlayerPresence error: ${e.message}")
        }
        false
    }

    suspend fun fetchLobbySnapshot(roomCode: String, currentUserId: String): SupabaseLobbyState? = withContext(Dispatchers.IO) {
        if (!isConfigured || roomCode.isBlank()) return@withContext null
        try {
            // Fetch Room Details
            val roomReq = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/rooms?room_code=eq.$roomCode")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .get()
                .build()

            var hostPlayerId = ""
            var mode = "ONLINE_ROOM"
            var status = "LOBBY"
            var hostAddress: String? = null
            var rules = GameRules()

            client.newCall(roomReq).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val bodyStr = response.body?.string().orEmpty()
                val arr = JSONArray(bodyStr)
                if (arr.length() == 0) return@withContext null
                val roomObj = arr.getJSONObject(0)
                hostPlayerId = roomObj.optString("host_player_id")
                mode = roomObj.optString("mode", "ONLINE_ROOM")
                status = roomObj.optString("status", "LOBBY")
                hostAddress = roomObj.optString("host_address").takeIf { it.isNotBlank() }
                val rulesJson = roomObj.optJSONObject("rules")
                if (rulesJson != null) {
                    rules = UnoNetworkProtocol.jsonToRules(rulesJson)
                }
            }

            // Fetch Connected Players in Room (active within last 20 seconds)
            val playersReq = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/room_players?room_code=eq.$roomCode&order=is_host.desc")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .get()
                .build()

            val playersList = mutableListOf<Player>()
            client.newCall(playersReq).execute().use { response ->
                if (response.isSuccessful) {
                    val pBody = response.body?.string().orEmpty()
                    val pArr = JSONArray(pBody)
                    val now = System.currentTimeMillis()
                    for (i in 0 until pArr.length()) {
                        val pObj = pArr.getJSONObject(i)
                        val pId = pObj.getString("player_id")
                        val pName = pObj.optString("name", "Player")
                        val pAvatar = pObj.optString("avatar", "😎")
                        val isPlayerHost = pObj.optBoolean("is_host", pId == hostPlayerId)
                        val lastSeen = pObj.optLong("last_seen", now)
                        val isOnline = (now - lastSeen) < 30_000L // 30s threshold

                        playersList.add(
                            Player(
                                id = pId,
                                name = pName,
                                avatar = pAvatar,
                                isHuman = true,
                                isHost = isPlayerHost,
                                isConnected = isOnline,
                                isReconnecting = !isOnline && (now - lastSeen) < 60_000L
                            )
                        )
                    }
                }
            }

            return@withContext SupabaseLobbyState(
                roomCode = roomCode,
                hostPlayerId = hostPlayerId,
                mode = mode,
                status = status,
                hostAddress = hostAddress,
                rules = rules,
                players = playersList,
                isHost = (currentUserId == hostPlayerId)
            )
        } catch (e: Exception) {
            Log.w(tag, "[LOBBY] fetchLobbySnapshot exception: ${e.message}")
        }
        null
    }

    suspend fun updateMatchRules(
        roomCode: String,
        requestingPlayerId: String,
        rules: GameRules
    ): Result<Unit> = withContext(Dispatchers.IO) {
        if (!isConfigured) {
            return@withContext Result.failure(IllegalStateException("Supabase not configured"))
        }

        try {
            // Security verification: Check if requestingPlayerId is the authoritative host
            val roomReq = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/rooms?room_code=eq.$roomCode&select=host_player_id")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .get()
                .build()

            var verifiedHostId = ""
            client.newCall(roomReq).execute().use { response ->
                if (response.isSuccessful) {
                    val arr = JSONArray(response.body?.string().orEmpty())
                    if (arr.length() > 0) {
                        verifiedHostId = arr.getJSONObject(0).optString("host_player_id")
                    }
                }
            }

            if (verifiedHostId.isNotBlank() && verifiedHostId != requestingPlayerId) {
                Log.w(tag, "[SECURITY] Player $requestingPlayerId attempted to modify room $roomCode settings, but host is $verifiedHostId")
                return@withContext Result.failure(SecurityException("Only the room host can modify match settings."))
            }

            val rulesJson = UnoNetworkProtocol.rulesToJson(rules)
            val body = JSONObject().apply {
                put("rules", rulesJson)
                put("updated_at", System.currentTimeMillis())
            }

            val patchReq = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/rooms?room_code=eq.$roomCode&host_player_id=eq.$requestingPlayerId")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .header("Content-Type", "application/json")
                .patch(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(patchReq).execute().use { response ->
                if (response.isSuccessful) {
                    Log.d(tag, "[RULES] Successfully updated Supabase match settings for room $roomCode")
                    return@withContext Result.success(Unit)
                } else {
                    return@withContext Result.failure(Exception("HTTP error ${response.code} updating rules"))
                }
            }
        } catch (e: Exception) {
            Log.w(tag, "[RULES] updateMatchRules error: ${e.message}")
            return@withContext Result.failure(e)
        }
    }

    suspend fun removePlayerFromRoom(roomCode: String, playerId: String) = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext
        try {
            val req = Request.Builder()
                .url("${SupabaseManager.supabaseUrl}/rest/v1/room_players?room_code=eq.$roomCode&player_id=eq.$playerId")
                .header("apikey", SupabaseManager.supabaseKey)
                .header("Authorization", "Bearer ${SupabaseManager.supabaseKey}")
                .delete()
                .build()

            client.newCall(req).execute().use { response ->
                Log.d(tag, "[LOBBY] removePlayerFromRoom code=${response.code}")
            }
        } catch (e: Exception) {
            Log.w(tag, "[LOBBY] removePlayerFromRoom failed: ${e.message}")
        }
    }
}
