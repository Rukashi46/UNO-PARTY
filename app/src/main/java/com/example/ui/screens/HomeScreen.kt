package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Leaderboard
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.engine.UnoDeck
import com.example.model.GameMode
import com.example.model.GameRules
import com.example.ui.components.UnoCardBackView

@Composable
fun HomeScreen(
    activeRules: GameRules,
    onStartGame: (Int, GameMode, GameRules, String?) -> Unit,
    onOpenRules: () -> Unit,
    onOpenStats: () -> Unit,
    modifier: Modifier = Modifier
) {
    var playerCount by remember { mutableFloatStateOf(4f) }
    var selectedMode by remember { mutableStateOf(GameMode.ONLINE_ROOM) }
    var selectedPresetName by remember { mutableStateOf("Spicy House Rules") }
    var currentRules by remember(activeRules) { mutableStateOf(activeRules) }
    var roomCode by remember { mutableStateOf("UNO-${(1000..9999).random()}") }
    var onlineTabIndex by remember { mutableIntStateOf(0) } // 0: Host Room, 1: Join Room

    val scrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF0F172A),
                        Color(0xFF1E293B),
                        Color(0xFF0A0F1D)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header Hero Banner
            HeaderHeroBanner()

            Spacer(modifier = Modifier.height(20.dp))

            // Game Mode Selection
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0x33FFFFFF))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Wifi,
                            contentDescription = null,
                            tint = Color(0xFF64B5F6),
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Game Mode",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))

                    val modes = listOf(
                        GameMode.ONLINE_ROOM,
                        GameMode.WLAN_MULTIPLAYER,
                        GameMode.SOLO_BOTS,
                        GameMode.PASS_AND_PLAY,
                        GameMode.ALL_BOTS
                    )

                    modes.forEach { mode ->
                        val isSelected = selectedMode == mode
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) Color(0xFF0D47A1) else Color(0xFF0F172A),
                            border = BorderStroke(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) Color(0xFF64B5F6) else Color(0x22FFFFFF)
                            ),
                            onClick = { selectedMode = mode }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = mode.label,
                                        color = if (isSelected) Color(0xFFFFD54F) else Color.White,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = mode.description,
                                        color = Color(0xFF94A3B8),
                                        fontSize = 12.sp
                                    )
                                }
                                if (mode == GameMode.ONLINE_ROOM) {
                                    Surface(
                                        color = Color(0xFF1B5E20),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            text = "ONLINE",
                                            color = Color(0xFFA5D6A7),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Black,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                } else if (mode == GameMode.WLAN_MULTIPLAYER) {
                                    Surface(
                                        color = Color(0xFF4A148C),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            text = "WLAN",
                                            color = Color(0xFFCE93D8),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Black,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Online / WLAN Room Lobby Card
            if (selectedMode == GameMode.ONLINE_ROOM || selectedMode == GameMode.WLAN_MULTIPLAYER) {
                val isWlan = selectedMode == GameMode.WLAN_MULTIPLAYER
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = if (isWlan) Color(0xFF1E1B4B) else Color(0xFF132F4C)),
                    border = BorderStroke(1.5.dp, if (isWlan) Color(0xFF818CF8) else Color(0xFF1E88E5))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        TabRow(
                            selectedTabIndex = onlineTabIndex,
                            containerColor = Color.Transparent,
                            contentColor = Color(0xFFFFD54F),
                            indicator = { tabPositions ->
                                TabRowDefaults.Indicator(
                                    modifier = Modifier.tabIndicatorOffset(tabPositions[onlineTabIndex]),
                                    color = Color(0xFFFFD54F),
                                    height = 3.dp
                                )
                            }
                        ) {
                            Tab(
                                selected = onlineTabIndex == 0,
                                onClick = { onlineTabIndex = 0 },
                                text = { Text(if (isWlan) "Host WLAN Room" else "Host Online Room", fontWeight = FontWeight.Bold) }
                            )
                            Tab(
                                selected = onlineTabIndex == 1,
                                onClick = { onlineTabIndex = 1 },
                                text = { Text(if (isWlan) "Join WLAN Room" else "Join Room Code", fontWeight = FontWeight.Bold) }
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        if (onlineTabIndex == 0) {
                            // Host view
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(if (isWlan) "WLAN Room Code:" else "Room Code:", color = Color(0xFF90CAF9), fontSize = 12.sp)
                                    Text(
                                        text = roomCode,
                                        color = Color(0xFFFFD54F),
                                        fontSize = 22.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 1.sp
                                    )
                                }
                                IconButton(onClick = {
                                    roomCode = if (isWlan) "WLAN-${(1000..9999).random()}" else "UNO-${(1000..9999).random()}"
                                }) {
                                    Icon(Icons.Default.Refresh, contentDescription = "Regenerate Code", tint = Color.White)
                                }
                            }
                            Text(
                                text = if (isWlan)
                                    "Host room on local Wi-Fi / Hotspot. Friends connected to the same Wi-Fi can join instantly."
                                else
                                    "Share this code with friends to join your match.",
                                color = Color(0xFFB0BEC5),
                                fontSize = 11.sp
                            )
                        } else {
                            // Join view
                            OutlinedTextField(
                                value = roomCode,
                                onValueChange = { roomCode = it.uppercase() },
                                label = { Text(if (isWlan) "Enter WLAN Room Code or Host IP" else "Enter 8-digit Room Code") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFFFFD54F),
                                    unfocusedBorderColor = Color(0x66FFFFFF),
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                )
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Connected players slots preview
                        Text(
                            text = "Lobby Slots (${playerCount.toInt()} Connected):",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val count = playerCount.toInt().coerceAtMost(5)
                            for (i in 0 until count) {
                                Surface(
                                    modifier = Modifier.weight(1f),
                                    color = if (i == 0) Color(0xFF0D47A1) else Color(0xFF1E293B),
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(1.dp, if (i == 0) Color(0xFFFFD54F) else Color(0x33FFFFFF))
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = UnoDeck.AVATAR_LIST[i % UnoDeck.AVATAR_LIST.size],
                                            fontSize = 18.sp
                                        )
                                        Text(
                                            text = if (i == 0) "Host" else "P${i + 1}",
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Text(
                                            text = "🟢 ${20 + (i * 7) % 30}ms",
                                            color = Color(0xFFA5D6A7),
                                            fontSize = 9.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Player Count Selector (2 to 10 Players)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("player_count_card"),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0x33FFFFFF))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Group,
                                contentDescription = "Players",
                                tint = Color(0xFFFFD54F),
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Player Count (2-10)",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Surface(
                            color = Color(0xFFE53935),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = "${playerCount.toInt()} Players",
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Slider(
                        value = playerCount,
                        onValueChange = { playerCount = it },
                        valueRange = 2f..10f,
                        steps = 7,
                        colors = SliderDefaults.colors(
                            thumbColor = Color(0xFFFFD54F),
                            activeTrackColor = Color(0xFFE53935),
                            inactiveTrackColor = Color(0xFF475569)
                        ),
                        modifier = Modifier.testTag("player_count_slider")
                    )

                    // Quick chip selectors
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        listOf(2, 3, 4, 6, 8, 10).forEach { count ->
                            FilterChip(
                                selected = playerCount.toInt() == count,
                                onClick = { playerCount = count.toFloat() },
                                label = { Text("$count P", fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFFE53935),
                                    selectedLabelColor = Color.White,
                                    containerColor = Color(0xFF0F172A),
                                    labelColor = Color(0xFF94A3B8)
                                )
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Rules & Custom Wild Card Preview Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0x33FFFFFF))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Rules Variant & Wild Card",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        OutlinedButton(
                            onClick = onOpenRules,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFFD54F))
                        ) {
                            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Rules & Wild", fontSize = 12.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Custom Wild rule badge
                    if (currentRules.includeCustomWilds) {
                        Surface(
                            color = Color(0xFF311B92),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFFFFD54F)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.ElectricBolt,
                                    contentDescription = null,
                                    tint = Color(0xFFFFD54F),
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = "Custom Wild: 3× in Deck (Dynamic Choice)",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                    Text(
                                        text = "Choose 🔀 Shuffle Hands or ➕ Everyone +4 when card is played",
                                        color = Color(0xFFB39DDB),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                    }

                    val presets = listOf(
                        Pair("Spicy House Rules", GameRules.SPICY_HOUSE_RULES),
                        Pair("Official Standard", GameRules.OFFICIAL_RULES),
                        Pair("Stack Attack", GameRules.STACK_ATTACK),
                        Pair("Chaos Party", GameRules.CHAOS_PARTY)
                    )

                    presets.forEach { (name, ruleSet) ->
                        val isSelected = selectedPresetName == name
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 3.dp),
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) Color(0xFF1B5E20) else Color(0xFF0F172A),
                            border = BorderStroke(
                                width = if (isSelected) 1.5.dp else 1.dp,
                                color = if (isSelected) Color(0xFF81C784) else Color(0x22FFFFFF)
                            ),
                            onClick = {
                                selectedPresetName = name
                                currentRules = ruleSet
                            }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = name,
                                    color = if (isSelected) Color(0xFFFFD54F) else Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = when (name) {
                                        "Spicy House Rules" -> "Stacking + 7-0 + Jump-In"
                                        "Official Standard" -> "Classic No-Stacking"
                                        "Stack Attack" -> "+2 & +4 Stacking"
                                        else -> "All Features On"
                                    },
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Primary Start Button
            Button(
                onClick = {
                    onStartGame(
                        playerCount.toInt(),
                        selectedMode,
                        currentRules,
                        if (selectedMode == GameMode.ONLINE_ROOM) roomCode else null
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .testTag("start_game_button"),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Start",
                    modifier = Modifier.size(28.dp),
                    tint = Color.White
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (selectedMode == GameMode.ONLINE_ROOM)
                        "PLAY ONLINE (${playerCount.toInt()} PLAYERS)"
                    else "START ${playerCount.toInt()}-PLAYER GAME",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    letterSpacing = 0.5.sp
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Secondary Buttons: Rules Guide & Stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onOpenRules,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("rules_button"),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = BorderStroke(1.dp, Color(0x66FFFFFF))
                ) {
                    Icon(Icons.Default.MenuBook, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Rules & Wild")
                }

                OutlinedButton(
                    onClick = onOpenStats,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("stats_button"),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = BorderStroke(1.dp, Color(0x66FFFFFF))
                ) {
                    Icon(Icons.Default.Leaderboard, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Match Stats")
                }
            }
        }
    }
}

@Composable
private fun HeaderHeroBanner() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Overlapping card fan
        Box(
            modifier = Modifier
                .height(120.dp)
                .width(220.dp),
            contentAlignment = Alignment.Center
        ) {
            UnoCardBackView(
                modifier = Modifier
                    .rotate(-24f)
                    .offset(x = (-40).dp, y = 8.dp),
                width = 65.dp,
                height = 100.dp
            )
            UnoCardBackView(
                modifier = Modifier
                    .rotate(24f)
                    .offset(x = 40.dp, y = 8.dp),
                width = 65.dp,
                height = 100.dp
            )
            UnoCardBackView(
                modifier = Modifier.rotate(0f),
                width = 75.dp,
                height = 115.dp
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Title
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "UNO",
                fontSize = 38.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFFFFD54F),
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "ONLINE",
                fontSize = 38.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFFE53935),
                letterSpacing = 2.sp
            )
        }

        // Subtitle badge
        Surface(
            color = Color(0xFF1E293B),
            shape = RoundedCornerShape(20.dp),
            border = BorderStroke(1.dp, Color(0x44FFFFFF))
        ) {
            Text(
                text = "2 to 10 Players • Online Multiplayer & Custom Wilds",
                color = Color(0xFF94A3B8),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)
            )
        }
    }
}
