package com.example.data

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/**
 * Manages device-level persistent settings, including username/display name,
 * stable persistent player ID (UUID), avatar, and onboarding state.
 */
class UserPreferencesManager(context: Context) {

    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )

    companion object {
        private const val PREFS_NAME = "uno_party_user_prefs"
        private const val KEY_USERNAME = "pref_user_display_name"
        private const val KEY_PLAYER_ID = "pref_device_player_id"
        private const val KEY_AVATAR = "pref_user_avatar"
        private const val KEY_FIRST_TIME_COMPLETE = "pref_first_time_setup_done"

        const val DEFAULT_AVATAR = "🦁"
        const val MIN_USERNAME_LENGTH = 2
        const val MAX_USERNAME_LENGTH = 16

        @Volatile
        private var instance: UserPreferencesManager? = null

        fun getInstance(context: Context): UserPreferencesManager {
            return instance ?: synchronized(this) {
                instance ?: UserPreferencesManager(context).also { instance = it }
            }
        }
    }

    /**
     * Validates a candidate username.
     * @return null if valid, or an error string describing why it's invalid.
     */
    fun validateUsername(rawName: String): String? {
        val trimmed = rawName.trim()
        if (trimmed.isEmpty()) {
            return "Username cannot be empty."
        }
        if (trimmed.length < MIN_USERNAME_LENGTH) {
            return "Username must be at least $MIN_USERNAME_LENGTH characters."
        }
        if (trimmed.length > MAX_USERNAME_LENGTH) {
            return "Username cannot exceed $MAX_USERNAME_LENGTH characters."
        }
        // Allow alphanumeric characters, spaces, underscores, and hyphens
        val validRegex = Regex("^[a-zA-Z0-9 _-]+$")
        if (!validRegex.matches(trimmed)) {
            return "Only letters, numbers, spaces, and hyphens/underscores are allowed."
        }
        return null
    }

    /**
     * Gets the device's persistent display name.
     */
    fun getUsername(): String {
        val saved = prefs.getString(KEY_USERNAME, null)?.takeIf { it.isNotBlank() }
        if (saved != null) return saved
        // Generate a unique non-hardcoded default player name per device
        val generated = "Player_${(1000..9999).random()}"
        prefs.edit().putString(KEY_USERNAME, generated).apply()
        return generated
    }

    /**
     * Saves the username if valid.
     * @return true if successfully saved, false if invalid.
     */
    fun saveUsername(rawName: String): Boolean {
        val error = validateUsername(rawName)
        if (error != null) return false
        val cleanName = rawName.trim()
        prefs.edit().putString(KEY_USERNAME, cleanName).apply()
        return true
    }

    /**
     * Retrieves the stable unique UUID for this device.
     * Guaranteed to persist across app launches and network matches.
     * Standard UUID format compliant with PostgreSQL/Supabase UUID types.
     */
    fun getPlayerId(): String {
        var playerId = prefs.getString(KEY_PLAYER_ID, null)
        val isValidUuid = try {
            if (playerId != null) {
                UUID.fromString(playerId)
                true
            } else false
        } catch (_: Exception) {
            false
        }

        if (!isValidUuid || playerId.isNullOrBlank()) {
            playerId = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_PLAYER_ID, playerId).apply()
        }
        return playerId
    }

    /**
     * Gets the chosen avatar emoji.
     */
    fun getAvatar(): String {
        return prefs.getString(KEY_AVATAR, null)?.takeIf { it.isNotBlank() } ?: DEFAULT_AVATAR
    }

    /**
     * Saves the chosen avatar emoji.
     */
    fun saveAvatar(avatar: String) {
        prefs.edit().putString(KEY_AVATAR, avatar).apply()
    }

    /**
     * Checks if first-time onboarding has been shown.
     */
    fun isFirstTimeSetupComplete(): Boolean {
        return prefs.getBoolean(KEY_FIRST_TIME_COMPLETE, false)
    }

    /**
     * Marks onboarding setup complete.
     */
    fun setFirstTimeSetupComplete(complete: Boolean = true) {
        prefs.edit().putBoolean(KEY_FIRST_TIME_COMPLETE, complete).apply()
    }
}
