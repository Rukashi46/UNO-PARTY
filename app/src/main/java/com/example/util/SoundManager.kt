package com.example.util

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * High-performance, zero-asset audio manager for UNO gameplay.
 * Synthesizes crisp, arcade-quality 16-bit PCM sound effects in memory.
 * Features dedicated audio feedback for:
 * - Card dealing (rapid flutter swish)
 * - Card playing (satisfying snap / slap pop)
 * - UNO calls (triumphant ascending two-tone fanfare)
 * - Card drawing (smooth slide)
 * - Unplayable card reject (gentle double bloop)
 * - Victory celebration fanfare
 */
class SoundManager private constructor(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.Default)
    var isSoundEnabled: Boolean = true

    companion object {
        private const val TAG = "SoundManager"
        private const val SAMPLE_RATE = 22050

        @Volatile
        private var instance: SoundManager? = null

        fun getInstance(context: Context): SoundManager {
            return instance ?: synchronized(this) {
                instance ?: SoundManager(context.applicationContext).also { instance = it }
            }
        }
    }

    // Pre-synthesized PCM audio tracks for instantaneous, low-latency playback
    private val dealTrack: AudioTrack? by lazy { createStaticTrack(generateCardDealPcm()) }
    private val playCardTrack: AudioTrack? by lazy { createStaticTrack(generateCardPlayPcm()) }
    private val unoCallTrack: AudioTrack? by lazy { createStaticTrack(generateUnoCallPcm()) }
    private val drawCardTrack: AudioTrack? by lazy { createStaticTrack(generateCardDrawPcm()) }
    private val invalidCardTrack: AudioTrack? by lazy { createStaticTrack(generateInvalidCardPcm()) }
    private val winTrack: AudioTrack? by lazy { createStaticTrack(generateWinFanfarePcm()) }

    /**
     * Plays a crisp rapid flutter/swish sound for card dealing.
     */
    fun playCardDealSound() {
        playTrack(dealTrack)
    }

    /**
     * Plays a snappy slap/pop sound when a card is played onto the discard pile.
     */
    fun playCardPlaySound() {
        playTrack(playCardTrack)
    }

    /**
     * Plays a triumphant, energetic two-tone ascending fanfare when UNO is called.
     */
    fun playUnoCallSound() {
        playTrack(unoCallTrack)
    }

    /**
     * Plays a smooth sliding swoosh when a player draws from the deck.
     */
    fun playDrawCardSound() {
        playTrack(drawCardTrack)
    }

    /**
     * Plays a soft double-bloop when an unplayable card is clicked and floats back.
     */
    fun playInvalidCardSound() {
        playTrack(invalidCardTrack)
    }

    /**
     * Plays a triumphant arpeggio fanfare when a player wins the round/match.
     */
    fun playWinSound() {
        playTrack(winTrack)
    }

    private fun playTrack(track: AudioTrack?) {
        if (!isSoundEnabled || track == null) return
        scope.launch {
            try {
                if (track.playState == AudioTrack.PLAYSTATE_PLAYING) {
                    track.stop()
                }
                track.reloadStaticData()
                track.play()
            } catch (e: Exception) {
                Log.w(TAG, "Audio playback error: ${e.message}")
            }
        }
    }

    private fun createStaticTrack(pcmData: ShortArray): AudioTrack? {
        return try {
            val bufferSize = pcmData.size * 2
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val format = AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build()
            val track = AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
            track.write(pcmData, 0, pcmData.size)
            track
        } catch (e: Exception) {
            Log.w(TAG, "Failed to initialize static AudioTrack: ${e.message}")
            null
        }
    }

    // --- PCM Waveform Synthesis Algorithms ---

    /**
     * Deal card: Rapid white-noise burst modulated with descending frequency flutter (120ms).
     */
    private fun generateCardDealPcm(): ShortArray {
        val durationMs = 120
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        var phase = 0.0

        for (i in 0 until numSamples) {
            val t = i.toDouble() / SAMPLE_RATE
            val progress = i.toDouble() / numSamples
            // Frequency sweep from 650Hz down to 220Hz
            val freq = 650.0 - 430.0 * progress
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val sine = sin(phase)
            val noise = (Math.random() * 2.0 - 1.0) * 0.35
            val envelope = (1.0 - progress) * exp(-progress * 3.0)
            val sample = ((sine * 0.65 + noise) * envelope * 24000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }

    /**
     * Play card: Crisp slap / snap click with fast exponential decay (85ms).
     */
    private fun generateCardPlayPcm(): ShortArray {
        val durationMs = 85
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        var phase = 0.0

        for (i in 0 until numSamples) {
            val progress = i.toDouble() / numSamples
            // Quick punchy pitch drop from 1100Hz to 160Hz
            val freq = 1100.0 * exp(-progress * 8.0) + 160.0
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val tone = sin(phase)
            val snapNoise = if (progress < 0.25) (Math.random() * 2.0 - 1.0) * (0.25 - progress) * 4.0 else 0.0
            val envelope = exp(-progress * 6.5)
            val sample = ((tone * 0.7 + snapNoise * 0.3) * envelope * 28000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }

    /**
     * UNO Call: High-energy two-note ascending fanfare ("U-NO!" - 587Hz D5 -> 880Hz A5, 380ms).
     */
    private fun generateUnoCallPcm(): ShortArray {
        val durationMs = 380
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        val note1Samples = (SAMPLE_RATE * 150 / 1000)
        var phase = 0.0

        for (i in 0 until numSamples) {
            val freq = if (i < note1Samples) 587.33 else 880.0 // D5 -> A5
            val noteProgress = if (i < note1Samples) {
                i.toDouble() / note1Samples
            } else {
                (i - note1Samples).toDouble() / (numSamples - note1Samples)
            }
            phase += 2.0 * PI * freq / SAMPLE_RATE
            // Bell-like harmonic rich tone (fundamental + 2nd harmonic)
            val tone = sin(phase) * 0.75 + sin(phase * 2.0) * 0.25
            val envelope = (1.0 - noteProgress * 0.3) * exp(-noteProgress * 2.2)
            val sample = (tone * envelope * 27000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }

    /**
     * Draw card: Smooth card sliding sound (100ms).
     */
    private fun generateCardDrawPcm(): ShortArray {
        val durationMs = 100
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        var phase = 0.0

        for (i in 0 until numSamples) {
            val progress = i.toDouble() / numSamples
            val freq = 420.0 + 350.0 * progress
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val sine = sin(phase)
            val noise = (Math.random() * 2.0 - 1.0) * 0.4
            val envelope = sin(progress * PI)
            val sample = ((sine * 0.6 + noise * 0.4) * envelope * 20000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }

    /**
     * Unplayable card: Soft low double-bloop (140ms).
     */
    private fun generateInvalidCardPcm(): ShortArray {
        val durationMs = 140
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        val half = numSamples / 2
        var phase = 0.0

        for (i in 0 until numSamples) {
            val isFirstBloop = i < half
            val freq = if (isFirstBloop) 260.0 else 200.0
            val noteProgress = if (isFirstBloop) i.toDouble() / half else (i - half).toDouble() / half
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val tone = sin(phase)
            val envelope = exp(-noteProgress * 5.0)
            val sample = (tone * envelope * 22000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }

    /**
     * Win fanfare: Uplifting 4-note ascending chord arpeggio (C5-E5-G5-C6, 500ms).
     */
    private fun generateWinFanfarePcm(): ShortArray {
        val durationMs = 500
        val numSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(numSamples)
        val noteLength = numSamples / 4
        val freqs = doubleArrayOf(523.25, 659.25, 783.99, 1046.50) // C5, E5, G5, C6
        var phase = 0.0

        for (i in 0 until numSamples) {
            val noteIdx = (i / noteLength).coerceIn(0, 3)
            val freq = freqs[noteIdx]
            val noteProgress = (i % noteLength).toDouble() / noteLength
            phase += 2.0 * PI * freq / SAMPLE_RATE
            val tone = sin(phase) * 0.8 + sin(phase * 2.0) * 0.2
            val envelope = (1.0 - noteProgress * 0.2) * exp(-noteProgress * 2.0)
            val sample = (tone * envelope * 26000).toInt().coerceIn(-32767, 32767)
            buffer[i] = sample.toShort()
        }
        return buffer
    }
}
