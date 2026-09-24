package com.example.network

import android.util.Log
import com.example.BuildConfig
import com.example.model.GameRules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Authoritative Supabase REST client for:
 * - Persistent Player Profiles (id UUID, username, avatar)
 * - Cloud Room Coordination (rooms, room_players)
 * - Match history recording
 *
 * Safely falls back to local operation if Supabase credentials are not configured.
 */
object SupabaseManager {

    private const val TAG = "SupabaseManager"
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .build()

    // Configured via BuildConfig or fallback system properties
    private val supabaseUrl: String by lazy {
        try {
            // Check for SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL via reflection from BuildConfig
            val buildConfigClass = BuildConfig::class.java
            val urlField = runCatching { buildConfigClass.getField("SUPABASE_URL").get(null) as? String }.getOrNull()
                ?: runCatching { buildConfigClass.getField("EXPO_PUBLIC_SUPABASE_URL").get(null) as? String }.getOrNull()
            urlField?.takeIf { it.isNotBlank() } ?: System.getenv("EXPO_PUBLIC_SUPABASE_URL") ?: System.getenv("SUPABASE_URL") ?: ""
        } catch (_: Exception) {
            ""
        }
    }

    private val supabaseKey: String by lazy {
        try {
            val buildConfigClass = BuildConfig::class.java
            val keyField = runCatching { buildConfigClass.getField("SUPABASE_KEY").get(null) as? String }.getOrNull()
                ?: runCatching { buildConfigClass.getField("SUPABASE_ANON_KEY").get(null) as? String }.getOrNull()
                ?: runCatching { buildConfigClass.getField("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY").get(null) as? String }.getOrNull()
            keyField?.takeIf { it.isNotBlank() } ?: System.getenv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?: System.getenv("SUPABASE_KEY") ?: ""
        } catch (_: Exception) {
            ""
        }
    }

    val isConfigured: Boolean get() = supabaseUrl.isNotBlank() && supabaseKey.isNotBlank()

    data class CloudRoom(
        val id: String,
        val roomCode: String,
        val hostPlayerId: String,
        val hostAddress: String?,
        val mode: String,
        val status: String,
        val maxPlayers: Int
    )

    /**
     * Upsert player profile in Supabase `profiles` table.
     */
    suspend fun syncProfile(playerId: String, username: String, avatar: String) = withContext(Dispatchers.IO) {
        if (!isConfigured) {
            Log.d(TAG, "[AUTH] Supabase credentials not set, local identity preserved ($playerId: $username)")
            return@withContext
        }

        try {
            val body = JSONObject().apply {
                put("id", playerId)
                put("username", username)
                put("avatar", avatar)
                put("updated_at", "now()")
            }

            val request = Request.Builder()
                .url("$supabaseUrl/rest/v1/profiles")
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates")
                .post(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                Log.d(TAG, "[AUTH] syncProfile response code=${response.code}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "[AUTH] Failed to sync profile to Supabase: ${e.message}")
        }
    }

    /**
     * Registers or updates a room in Supabase `rooms` table.
     */
    suspend fun registerRoom(
        roomCode: String,
        hostPlayerId: String,
        mode: String,
        rules: GameRules,
        hostAddress: String?
    ): CloudRoom? = withContext(Dispatchers.IO) {
        if (!isConfigured) {
            Log.d(TAG, "[ROOM] Supabase not configured, room managed via host peer socket ($roomCode)")
            return@withContext null
        }

        try {
            val rulesJson = JSONObject().apply {
                put("stackingDrawTwos", rules.stackingDrawTwos)
                put("stackingDrawFours", rules.stackingDrawFours)
                put("jumpInRule", rules.jumpInRule)
                put("sevenZeroRule", rules.sevenZeroRule)
                put("includeCustomWilds", rules.includeCustomWilds)
            }

            val body = JSONObject().apply {
                put("room_code", roomCode)
                put("host_player_id", hostPlayerId)
                put("mode", mode)
                put("status", "LOBBY")
                put("max_players", 10)
                put("rules", rulesJson)
                if (!hostAddress.isNullOrBlank()) {
                    put("host_address", hostAddress)
                }
            }

            val request = Request.Builder()
                .url("$supabaseUrl/rest/v1/rooms?on_conflict=room_code")
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates,return=representation")
                .post(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                val respString = response.body?.string() ?: ""
                Log.d(TAG, "[ROOM] registerRoom code=${response.code} resp=$respString")
                if (response.isSuccessful && respString.isNotBlank()) {
                    val arr = JSONArray(respString)
                    if (arr.length() > 0) {
                        val obj = arr.getJSONObject(0)
                        return@withContext CloudRoom(
                            id = obj.getString("id"),
                            roomCode = obj.getString("room_code"),
                            hostPlayerId = obj.getString("host_player_id"),
                            hostAddress = obj.optString("host_address").takeIf { it.isNotBlank() },
                            mode = obj.getString("mode"),
                            status = obj.getString("status"),
                            maxPlayers = obj.optInt("max_players", 10)
                        )
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[ROOM] Failed to register room in Supabase: ${e.message}")
        }
        null
    }

    /**
     * Looks up room details by room_code from Supabase `rooms` table.
     */
    suspend fun lookupRoom(roomCode: String): CloudRoom? = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext null

        try {
            val url = "$supabaseUrl/rest/v1/rooms?room_code=eq.$roomCode&select=id,room_code,host_player_id,host_address,mode,status,max_players"
            val request = Request.Builder()
                .url(url)
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val respString = response.body?.string() ?: ""
                if (response.isSuccessful && respString.isNotBlank()) {
                    val arr = JSONArray(respString)
                    if (arr.length() > 0) {
                        val obj = arr.getJSONObject(0)
                        return@withContext CloudRoom(
                            id = obj.getString("id"),
                            roomCode = obj.getString("room_code"),
                            hostPlayerId = obj.getString("host_player_id"),
                            hostAddress = obj.optString("host_address").takeIf { it.isNotBlank() },
                            mode = obj.getString("mode"),
                            status = obj.getString("status"),
                            maxPlayers = obj.optInt("max_players", 10)
                        )
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[ROOM] Failed to lookup room in Supabase: ${e.message}")
        }
        null
    }

    /**
     * Closes a room in Supabase `rooms` table.
     */
    suspend fun closeRoom(roomCode: String) = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext

        try {
            val body = JSONObject().apply {
                put("status", "CLOSED")
            }

            val request = Request.Builder()
                .url("$supabaseUrl/rest/v1/rooms?room_code=eq.$roomCode")
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .header("Content-Type", "application/json")
                .patch(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                Log.d(TAG, "[ROOM] closeRoom code=${response.code}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "[ROOM] Failed to close room in Supabase: ${e.message}")
        }
    }

    /**
     * Records match history in Supabase `game_history` table.
     */
    suspend fun recordHistory(
        roomCode: String,
        winnerId: String?,
        winnerName: String,
        playerCount: Int,
        mode: String,
        rounds: Int = 1
    ) = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext

        try {
            val body = JSONObject().apply {
                put("room_code", roomCode)
                if (!winnerId.isNullOrBlank()) put("winner_id", winnerId)
                put("winner_name", winnerName)
                put("player_count", playerCount)
                put("mode", mode)
                put("rounds_played", rounds)
            }

            val request = Request.Builder()
                .url("$supabaseUrl/rest/v1/game_history")
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                Log.d(TAG, "[GAME] recordHistory code=${response.code}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "[GAME] Failed to record history in Supabase: ${e.message}")
        }
    }
}
