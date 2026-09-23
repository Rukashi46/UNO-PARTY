package com.example.network

import java.net.InetAddress
import java.nio.ByteBuffer

object RoomCodeUtil {

    /**
     * Encodes an IPv4 address and port into a clean, 6-8 character alphanumeric room code.
     */
    fun encodeIpToRoomCode(ip: String, port: Int = UnoNetworkProtocol.DEFAULT_PORT): String {
        return try {
            val parts = ip.split(".")
            if (parts.size != 4) return "UNO-${(1000..9999).random()}"
            val b0 = parts[0].toLong() and 0xFF
            val b1 = parts[1].toLong() and 0xFF
            val b2 = parts[2].toLong() and 0xFF
            val b3 = parts[3].toLong() and 0xFF
            val ipPart = (b0 shl 24) or (b1 shl 16) or (b2 shl 8) or b3
            val portPart = port.toLong() and 0xFFFF
            val combined = (ipPart shl 16) or portPart
            "UNO-" + combined.toString(36).uppercase().padStart(8, '0')
        } catch (_: Exception) {
            "UNO-${(1000..9999).random()}"
        }
    }

    /**
     * Decodes a room code back into IP and port.
     * If the input is already an IP (e.g. "192.168.1.15" or "192.168.1.15:8888"), parses directly.
     */
    fun decodeRoomCodeToIp(input: String): Pair<String, Int>? {
        val trimmed = input.trim().uppercase()
        if (trimmed.isEmpty()) return null

        // Direct IP check (e.g. 192.168.1.15 or 192.168.1.15:8888)
        if (trimmed.contains(".") && trimmed.count { it == '.' } == 3) {
            val parts = trimmed.split(":")
            val ip = parts[0]
            val port = if (parts.size > 1) parts[1].toIntOrNull() ?: UnoNetworkProtocol.DEFAULT_PORT else UnoNetworkProtocol.DEFAULT_PORT
            return Pair(ip, port)
        }

        // Base36 decoded room code check
        return try {
            val cleanCode = trimmed.removePrefix("UNO-").removePrefix("WLAN-")
            val num = cleanCode.toLong(36)
            val portPart = (num and 0xFFFFL).toInt()
            val ipPart = num shr 16

            val b0 = ((ipPart shr 24) and 0xFF).toInt()
            val b1 = ((ipPart shr 16) and 0xFF).toInt()
            val b2 = ((ipPart shr 8) and 0xFF).toInt()
            val b3 = (ipPart and 0xFF).toInt()

            val ip = "$b0.$b1.$b2.$b3"
            val port = if (portPart in 1024..65535) portPart else UnoNetworkProtocol.DEFAULT_PORT
            Pair(ip, port)
        } catch (_: Exception) {
            null
        }
    }
}
