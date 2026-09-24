package com.example.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import com.example.model.DeckType
import com.example.model.GameEndingMode
import com.example.model.GameRules
import kotlinx.coroutines.flow.Flow

// --- ROOM DATABASE SCHEMA ---

/**
 * Historical summary record for a played match.
 */
@Entity(tableName = "match_records")
data class MatchRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long = System.currentTimeMillis(),
    val playerCount: Int,
    val winnerName: String,
    val winnerIsHuman: Boolean,
    val roundScore: Int,
    val totalRounds: Int,
    val rulesSummary: String
)

/**
 * Lifetime player statistics.
 */
@Entity(tableName = "player_stats")
data class PlayerStat(
    @PrimaryKey val playerId: String,
    val name: String,
    val gamesPlayed: Int = 0,
    val gamesWon: Int = 0,
    val unosCalled: Int = 0,
    val totalScore: Int = 0
)

/**
 * Game Configuration Settings entity.
 * Configurable at match time (deck composition, No Mercy mode, house rules, presets, sound).
 * Persisted in the local Room database across launches.
 */
@Entity(tableName = "game_configurations")
data class GameConfigEntity(
    @PrimaryKey val id: String = "active_config",
    val configName: String = "Spicy House Rules",
    val deckType: String = "MODERN_112",
    val noMercy: Boolean = false,
    val stackingDrawTwos: Boolean = true,
    val stackingDrawFours: Boolean = true,
    val stackingDrawFourOnTwo: Boolean = true,
    val sevenZeroRule: Boolean = true,
    val jumpInRule: Boolean = true,
    val drawUntilPlayable: Boolean = false,
    val forcePlay: Boolean = false,
    val wildDrawFourChallenge: Boolean = false,
    val mercyRule: Boolean = false,
    val mercyLimit: Int = 25,
    val unoPenaltyCards: Int = 2,
    val targetScore: Int = 250,
    val botSpeedMs: Long = 900L,
    val hapticsEnabled: Boolean = true,
    val soundEnabled: Boolean = true,
    val includeCustomWilds: Boolean = true,
    val gameEndingMode: String = "FIRST_PLAYER_WINS",
    val lastUpdated: Long = System.currentTimeMillis()
) {
    fun toGameRules(): GameRules {
        val dType = try {
            DeckType.valueOf(deckType)
        } catch (_: Exception) {
            DeckType.MODERN_112
        }
        val endMode = try {
            GameEndingMode.valueOf(gameEndingMode)
        } catch (_: Exception) {
            GameEndingMode.FIRST_PLAYER_WINS
        }
        return GameRules(
            playerCount = 4,
            initialCardsPerPlayer = 7,
            stackingDrawTwos = stackingDrawTwos,
            stackingDrawFours = stackingDrawFours,
            stackingDrawFourOnTwo = stackingDrawFourOnTwo,
            sevenZeroRule = sevenZeroRule,
            jumpInRule = jumpInRule,
            drawUntilPlayable = drawUntilPlayable,
            forcePlay = forcePlay,
            wildDrawFourChallenge = wildDrawFourChallenge,
            mercyRule = mercyRule || noMercy,
            mercyLimit = mercyLimit,
            unoPenaltyCards = unoPenaltyCards,
            targetScore = targetScore,
            botSpeedMs = botSpeedMs,
            hapticsEnabled = hapticsEnabled,
            soundEnabled = soundEnabled,
            includeCustomWilds = includeCustomWilds && (dType == DeckType.MODERN_112),
            gameEndingMode = endMode,
            noMercy = noMercy,
            deckType = dType
        )
    }

    companion object {
        fun fromGameRules(rules: GameRules, configName: String = "Custom"): GameConfigEntity {
            return GameConfigEntity(
                id = "active_config",
                configName = configName,
                deckType = rules.deckType.name,
                noMercy = rules.noMercy,
                stackingDrawTwos = rules.stackingDrawTwos,
                stackingDrawFours = rules.stackingDrawFours,
                stackingDrawFourOnTwo = rules.stackingDrawFourOnTwo,
                sevenZeroRule = rules.sevenZeroRule,
                jumpInRule = rules.jumpInRule,
                drawUntilPlayable = rules.drawUntilPlayable,
                forcePlay = rules.forcePlay,
                wildDrawFourChallenge = rules.wildDrawFourChallenge,
                mercyRule = rules.mercyRule,
                mercyLimit = rules.mercyLimit,
                unoPenaltyCards = rules.unoPenaltyCards,
                targetScore = rules.targetScore,
                botSpeedMs = rules.botSpeedMs,
                hapticsEnabled = rules.hapticsEnabled,
                soundEnabled = rules.soundEnabled,
                includeCustomWilds = rules.includeCustomWilds,
                gameEndingMode = rules.gameEndingMode.name,
                lastUpdated = System.currentTimeMillis()
            )
        }
    }
}

/**
 * Detailed per-player score and match tracking record.
 */
@Entity(tableName = "match_scores")
data class MatchScoreRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val matchId: String,
    val roomCode: String?,
    val playerId: String,
    val playerName: String,
    val avatar: String,
    val isHuman: Boolean,
    val isWinner: Boolean,
    val score: Int,
    val placement: Int,
    val finalCards: Int,
    val cardsPlayed: Int,
    val unosCalled: Int,
    val unosCaught: Int,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Authoritative match session tracking record.
 */
@Entity(tableName = "matches")
data class MatchEntity(
    @PrimaryKey val matchId: String,
    val roomCode: String?,
    val gameMode: String,
    val gameEndingMode: String,
    val playerCount: Int,
    val winnerId: String,
    val winnerName: String,
    val noMercy: Boolean,
    val deckType: String,
    val startedAt: Long,
    val finishedAt: Long,
    val rulesSummary: String
)

/**
 * Authoritative room record for multiplayer matches.
 */
@Entity(tableName = "rooms")
data class RoomRecordEntity(
    @PrimaryKey val roomCode: String,
    val hostPlayerId: String,
    val hostName: String,
    val maxPlayers: Int = 10,
    val status: String = "WAITING",
    val noMercy: Boolean = false,
    val deckType: String = "MODERN_112",
    val rulesJson: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

// --- ROOM DATA ACCESS OBJECT (DAO) ---

@Dao
interface UnoDao {
    // Recent matches legacy
    @Query("SELECT * FROM match_records ORDER BY timestamp DESC LIMIT 50")
    fun getRecentMatches(): Flow<List<MatchRecord>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMatch(record: MatchRecord): Long

    // Player stats
    @Query("SELECT * FROM player_stats ORDER BY gamesWon DESC, gamesPlayed DESC")
    fun getAllPlayerStats(): Flow<List<PlayerStat>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPlayerStat(stat: PlayerStat)

    @Query("SELECT * FROM player_stats WHERE playerId = :id")
    suspend fun getPlayerStat(id: String): PlayerStat?

    // Game Configuration Settings
    @Query("SELECT * FROM game_configurations WHERE id = :id")
    suspend fun getGameConfig(id: String = "active_config"): GameConfigEntity?

    @Query("SELECT * FROM game_configurations WHERE id = :id")
    fun observeGameConfig(id: String = "active_config"): Flow<GameConfigEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveGameConfig(config: GameConfigEntity)

    // Detailed Match Scores
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMatchScores(scores: List<MatchScoreRecord>)

    @Query("SELECT * FROM match_scores WHERE matchId = :matchId ORDER BY placement ASC")
    suspend fun getMatchScores(matchId: String): List<MatchScoreRecord>

    @Query("SELECT * FROM match_scores WHERE playerId = :playerId ORDER BY timestamp DESC LIMIT 30")
    fun getPlayerMatchScores(playerId: String): Flow<List<MatchScoreRecord>>

    // Matches
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMatchEntity(match: MatchEntity)

    @Query("SELECT * FROM matches ORDER BY finishedAt DESC LIMIT 30")
    fun getAllMatches(): Flow<List<MatchEntity>>

    // Rooms
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveRoomRecord(room: RoomRecordEntity)

    @Query("SELECT * FROM rooms WHERE roomCode = :code")
    suspend fun getRoomRecord(code: String): RoomRecordEntity?

    @Query("DELETE FROM match_records")
    suspend fun clearHistory()
}

// --- DATABASE CLASS ---

@Database(
    entities = [
        MatchRecord::class,
        PlayerStat::class,
        GameConfigEntity::class,
        MatchScoreRecord::class,
        MatchEntity::class,
        RoomRecordEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class UnoDatabase : RoomDatabase() {
    abstract fun unoDao(): UnoDao

    companion object {
        @Volatile
        private var INSTANCE: UnoDatabase? = null

        fun getDatabase(context: Context): UnoDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    UnoDatabase::class.java,
                    "uno_game_db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

// --- REPOSITORY ---

class UnoRepository(private val dao: UnoDao) {
    val recentMatches: Flow<List<MatchRecord>> = dao.getRecentMatches()
    val playerStats: Flow<List<PlayerStat>> = dao.getAllPlayerStats()
    val allMatches: Flow<List<MatchEntity>> = dao.getAllMatches()

    suspend fun saveMatch(record: MatchRecord) = dao.insertMatch(record)

    suspend fun saveGameConfig(rules: GameRules, name: String = "Custom") {
        dao.saveGameConfig(GameConfigEntity.fromGameRules(rules, name))
    }

    suspend fun loadGameConfig(): GameRules? {
        return dao.getGameConfig("active_config")?.toGameRules()
    }

    fun observeGameConfig(): Flow<GameConfigEntity?> = dao.observeGameConfig("active_config")

    suspend fun saveMatchScores(scores: List<MatchScoreRecord>) {
        dao.insertMatchScores(scores)
    }

    suspend fun saveMatchEntity(match: MatchEntity) {
        dao.insertMatchEntity(match)
    }

    suspend fun saveRoomRecord(room: RoomRecordEntity) {
        dao.saveRoomRecord(room)
    }

    suspend fun recordWinner(winnerId: String, winnerName: String, score: Int, isHuman: Boolean, unosCalled: Int) {
        val current = dao.getPlayerStat(winnerId) ?: PlayerStat(playerId = winnerId, name = winnerName)
        dao.upsertPlayerStat(
            current.copy(
                gamesPlayed = current.gamesPlayed + 1,
                gamesWon = current.gamesWon + 1,
                totalScore = current.totalScore + score,
                unosCalled = current.unosCalled + unosCalled
            )
        )
    }

    suspend fun recordParticipant(playerId: String, playerName: String, unosCalled: Int) {
        val current = dao.getPlayerStat(playerId) ?: PlayerStat(playerId = playerId, name = playerName)
        dao.upsertPlayerStat(
            current.copy(
                gamesPlayed = current.gamesPlayed + 1,
                unosCalled = current.unosCalled + unosCalled
            )
        )
    }

    suspend fun clearHistory() = dao.clearHistory()
}
