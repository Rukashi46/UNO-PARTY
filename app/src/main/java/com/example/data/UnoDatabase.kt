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
import kotlinx.coroutines.flow.Flow

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

@Entity(tableName = "player_stats")
data class PlayerStat(
    @PrimaryKey val playerId: String,
    val name: String,
    val gamesPlayed: Int = 0,
    val gamesWon: Int = 0,
    val unosCalled: Int = 0,
    val totalScore: Int = 0
)

@Dao
interface UnoDao {
    @Query("SELECT * FROM match_records ORDER BY timestamp DESC LIMIT 50")
    fun getRecentMatches(): Flow<List<MatchRecord>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMatch(record: MatchRecord): Long

    @Query("SELECT * FROM player_stats ORDER BY gamesWon DESC, gamesPlayed DESC")
    fun getAllPlayerStats(): Flow<List<PlayerStat>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPlayerStat(stat: PlayerStat)

    @Query("SELECT * FROM player_stats WHERE playerId = :id")
    suspend fun getPlayerStat(id: String): PlayerStat?

    @Query("DELETE FROM match_records")
    suspend fun clearHistory()
}

@Database(entities = [MatchRecord::class, PlayerStat::class], version = 1, exportSchema = false)
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
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}

class UnoRepository(private val dao: UnoDao) {
    val recentMatches: Flow<List<MatchRecord>> = dao.getRecentMatches()
    val playerStats: Flow<List<PlayerStat>> = dao.getAllPlayerStats()

    suspend fun saveMatch(record: MatchRecord) = dao.insertMatch(record)

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
