package com.example.network

object RoomCodeUtil {

    /**
     * Encodes an IPv4 address and port into a clean, 6-8 character alphanumeric room code.
     * When port is DEFAULT_PORT (8888), encodes the 32-bit IP directly in Base-36.
     * For example, 192.168.1.15 -> "WLAN-1NJZ8VF".
     * If port is non-default, encodes both IP (32 bits) and port (16 bits).
     */
    fun encodeIpToRoomCode(ip: String, port: Int = UnoNetworkProtocol.DEFAULT_PORT, prefix: String = "WLAN-"): String {
        return try {
            val parts = ip.trim().split(".")
            if (parts.size != 4) return "$prefix${(1000..9999).random()}"
            val b0 = parts[0].toLongOrNull() ?: return "$prefix${(1000..9999).random()}"
            val b1 = parts[1].toLongOrNull() ?: return "$prefix${(1000..9999).random()}"
            val b2 = parts[2].toLongOrNull() ?: return "$prefix${(1000..9999).random()}"
            val b3 = parts[3].toLongOrNull() ?: return "$prefix${(1000..9999).random()}"
            if (b0 !in 1..255 || b1 !in 0..255 || b2 !in 0..255 || b3 !in 0..255) {
                return "$prefix${(1000..9999).random()}"
            }
            val ipPart = ((b0 and 0xFF) shl 24) or ((b1 and 0xFF) shl 16) or ((b2 and 0xFF) shl 8) or (b3 and 0xFF)

            if (port == UnoNetworkProtocol.DEFAULT_PORT) {
                prefix + ipPart.toString(36).uppercase()
            } else {
                val combined = (ipPart shl 16) or (port.toLong() and 0xFFFF)
                prefix + combined.toString(36).uppercase()
            }
        } catch (_: Exception) {
            "$prefix${(1000..9999).random()}"
        }
    }

    /**
     * Decodes a room code or direct IP string into a Pair<ip, port>.
     * Supports:
     * 1. Direct IP: "192.168.1.15" or "192.168.1.15:8888"
     * 2. Encoded room code with prefix: "WLAN-1NJZ8VF", "UNO-1NJZ8VF"
     * 3. Raw encoded code: "1NJZ8VF"
     * Returns null if the code cannot be mathematically decoded as a direct IP encoding
     * (e.g. 4-digit codes like "WLAN-9472" or "9472", which must be resolved via UDP discovery).
     */
    fun decodeRoomCodeToIp(input: String): Pair<String, Int>? {
        val trimmed = input.trim().uppercase()
        if (trimmed.isEmpty()) return null

        // Direct IP check (e.g. 192.168.1.15 or 192.168.1.15:8888)
        if (trimmed.contains(".") && trimmed.count { it == '.' } == 3) {
            val parts = trimmed.split(":")
            val ip = parts[0].trim()
            val port = if (parts.size > 1) parts[1].toIntOrNull() ?: UnoNetworkProtocol.DEFAULT_PORT else UnoNetworkProtocol.DEFAULT_PORT
            return Pair(ip, port)
        }

        // Base36 decoded room code check
        return try {
            val cleanCode = trimmed
                .removePrefix("WLAN-")
                .removePrefix("UNO-")
                .removePrefix("ONLINE-")
                .trim()

            val num = cleanCode.toLongOrNull(36) ?: return null

            // If num is in 32-bit IPv4 range (first octet >= 1):
            if (num in 0x01000000L..0xFFFFFFFFL) {
                val b0 = ((num shr 24) and 0xFF).toInt()
                val b1 = ((num shr 16) and 0xFF).toInt()
                val b2 = ((num shr 8) and 0xFF).toInt()
                val b3 = (num and 0xFF).toInt()
                if (b0 in 1..255 && b1 in 0..255 && b2 in 0..255 && b3 in 0..255) {
                    return Pair("$b0.$b1.$b2.$b3", UnoNetworkProtocol.DEFAULT_PORT)
                }
            } else if (num > 0xFFFFFFFFL) {
                // 48-bit combination with port
                val portPart = (num and 0xFFFFL).toInt()
                val ipPart = num shr 16
                val b0 = ((ipPart shr 24) and 0xFF).toInt()
                val b1 = ((ipPart shr 16) and 0xFF).toInt()
                val b2 = ((ipPart shr 8) and 0xFF).toInt()
                val b3 = (ipPart and 0xFF).toInt()
                if (b0 in 1..255 && b1 in 0..255 && b2 in 0..255 && b3 in 0..255 && portPart in 1024..65535) {
                    return Pair("$b0.$b1.$b2.$b3", portPart)
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }
}
