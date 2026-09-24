package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Leaderboard
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.engine.UnoDeck
import com.example.model.GameMode
import com.example.model.GameRules
import com.example.ui.components.UnoCardBackView
import com.example.viewmodel.UnoViewModel

@Composable
fun HomeScreen(
    viewModel: UnoViewModel,
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
    var roomCode by remember { mutableStateOf("") }
    var onlineTabIndex by remember { mutableIntStateOf(0) } // 0: Host Room, 1: Join Room

    val clipboardManager = LocalClipboardManager.current
    val lobbyPlayers by viewModel.lobbyPlayers.collectAsStateWithLifecycle()
    val hostIpAddress by viewModel.hostIpAddress.collectAsStateWithLifecycle()
    val discoveredRooms by viewModel.discoveredRooms.collectAsStateWithLifecycle()
    val isClientConnected by viewModel.isClientConnected.collectAsStateWithLifecycle()
    val connectionStatus by viewModel.connectionStatus.collectAsStateWithLifecycle()
    val networkErrorMessage by viewModel.networkErrorMessage.collectAsStateWithLifecycle()
    val currentUsername by viewModel.currentUsername.collectAsStateWithLifecycle()
    val currentAvatar by viewModel.currentAvatar.collectAsStateWithLifecycle()
    var showEditProfileDialog by remember { mutableStateOf(false) }
    var codeCopied by remember { mutableStateOf(false) }

    // Initialize or regenerate host room code when switching mode or tab
    LaunchedEffect(selectedMode, onlineTabIndex) {
        val isWlan = selectedMode == GameMode.WLAN_MULTIPLAYER
        if (onlineTabIndex == 0 && (roomCode.isEmpty() || roomCode.startsWith("UNO-") || roomCode.startsWith("WLAN-") || roomCode.startsWith("ONLINE-"))) {
            roomCode = viewModel.generateHostRoomCode(isWlan)
        }
    }

    LaunchedEffect(selectedMode, onlineTabIndex, roomCode, currentUsername, currentAvatar) {
        if (selectedMode == GameMode.ONLINE_ROOM || selectedMode == GameMode.WLAN_MULTIPLAYER) {
            if (onlineTabIndex == 0 && roomCode.isNotEmpty()) {
                viewModel.hostRoom(roomCode = roomCode, playerName = currentUsername, avatar = currentAvatar)
            } else if (selectedMode == GameMode.WLAN_MULTIPLAYER) {
                viewModel.startDiscovery()
            }
        } else {
            viewModel.leaveNetwork()
        }
    }

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

            Spacer(modifier = Modifier.height(14.dp))

            // Player Profile Bar
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("player_profile_card"),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0x33FFFFFF))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF0F172A),
                            border = BorderStroke(2.dp, Color(0xFFFFD54F)),
                            modifier = Modifier.size(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(text = currentAvatar, fontSize = 24.sp)
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = currentUsername,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(
                                    color = Color(0xFF1976D2),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        text = "YOU",
                                        color = Color.White,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                    )
                                }
                            }
                            Text(
                                text = "Device ID: ${viewModel.userPrefs.getPlayerId().take(12)}",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.sp
                            )
                        }
                    }

                    OutlinedButton(
                        onClick = { showEditProfileDialog = true },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFFD54F)),
                        border = BorderStroke(1.dp, Color(0xFFFFD54F).copy(alpha = 0.7f)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("edit_profile_button")
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Edit", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

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
                    modifier = Modifier.fillMaxWidth().testTag("multiplayer_lobby_card"),
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
                                text = { Text(if (isWlan) "Host WLAN Room" else "Host Friends Room", fontWeight = FontWeight.Bold) }
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
                                    Text(
                                        text = if (isWlan) "WLAN ROOM CODE:" else "ROOM CODE:",
                                        color = Color(0xFF90CAF9),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = roomCode,
                                            color = Color(0xFFFFD54F),
                                            fontSize = 24.sp,
                                            fontWeight = FontWeight.Black,
                                            letterSpacing = 1.sp
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        IconButton(
                                            onClick = {
                                                clipboardManager.setText(AnnotatedString(roomCode))
                                                codeCopied = true
                                            },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(
                                                imageVector = if (codeCopied) Icons.Default.Check else Icons.Default.ContentCopy,
                                                contentDescription = "Copy Code",
                                                tint = if (codeCopied) Color(0xFF81C784) else Color.White,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                    if (isWlan) {
                                        Text(
                                            text = "HOST IP: $hostIpAddress:8888",
                                            color = Color(0xFFA5B4FC),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                                IconButton(onClick = {
                                    roomCode = viewModel.generateHostRoomCode(isWlan)
                                    codeCopied = false
                                }) {
                                    Icon(Icons.Default.Refresh, contentDescription = "Regenerate Code", tint = Color.White)
                                }
                            }

                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (isWlan)
                                    "Host device acts as local network server. Friends on the same Wi-Fi/Hotspot join via Room Code or Host IP."
                                else
                                    "Share this code with friends. Real players only — bots will never be added.",
                                color = Color(0xFFB0BEC5),
                                fontSize = 11.sp
                            )
                        } else {
                            // Join view
                            OutlinedTextField(
                                value = roomCode,
                                onValueChange = { roomCode = it.uppercase().trim() },
                                label = { Text(if (isWlan) "Enter Room Code (e.g. WLAN-1NJZ8VF) or Host IP" else "Enter Room Code (e.g. ONLINE-1NJZ8VF)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFFFFD54F),
                                    unfocusedBorderColor = Color(0x66FFFFFF),
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                )
                            )

                            Spacer(modifier = Modifier.height(8.dp))

                            val isConnecting = connectionStatus == com.example.network.UnoNetworkProtocol.ConnectionStatus.CONNECTING ||
                                    connectionStatus == com.example.network.UnoNetworkProtocol.ConnectionStatus.JOINING

                            Button(
                                onClick = {
                                    if (roomCode.isNotEmpty()) {
                                        viewModel.joinRoom(roomCode, playerName = currentUsername, avatar = currentAvatar)
                                    }
                                },
                                enabled = !isConnecting && roomCode.isNotEmpty(),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(44.dp)
                                    .testTag("connect_room_button"),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = when {
                                        isClientConnected -> Color(0xFF2E7D32)
                                        isConnecting -> Color(0xFFE65100)
                                        else -> Color(0xFF1E88E5)
                                    }
                                )
                            ) {
                                if (isConnecting) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = if (connectionStatus == com.example.network.UnoNetworkProtocol.ConnectionStatus.JOINING) "JOINING ROOM..." else "CONNECTING TO HOST...",
                                        fontWeight = FontWeight.Bold
                                    )
                                } else {
                                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = when {
                                            isClientConnected -> "CONNECTED TO HOST LOBBY ✓"
                                            else -> "CONNECT TO ROOM"
                                        },
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            // Error status banner
                            if (networkErrorMessage != null && connectionStatus == com.example.network.UnoNetworkProtocol.ConnectionStatus.ERROR) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Surface(
                                    color = Color(0xFF7F1D1D),
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(1.dp, Color(0xFFEF4444)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Info, contentDescription = "Error", tint = Color(0xFFFCA5A5), modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = networkErrorMessage ?: "Connection failed. Verify host IP or room code.",
                                            color = Color(0xFFFEE2E2),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium
                                        )
                                    }
                                }
                            }

                            // Discovered Rooms on Local Wi-Fi
                            if (isWlan && discoveredRooms.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(10.dp))
                                Text(
                                    text = "📡 Discovered on Local Wi-Fi (Tap to Join):",
                                    color = Color(0xFFFFD54F),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    discoveredRooms.forEach { room ->
                                        Surface(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    roomCode = room.roomCode
                                                    viewModel.joinRoom("${room.hostIp}:${room.port}", playerName = currentUsername, avatar = currentAvatar)
                                                },
                                            shape = RoundedCornerShape(8.dp),
                                            color = Color(0xFF312E81),
                                            border = BorderStroke(1.dp, Color(0xFF818CF8))
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column {
                                                    Text(
                                                        text = "${room.hostName}'s Room (${room.roomCode})",
                                                        color = Color.White,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 12.sp
                                                    )
                                                    Text(
                                                        text = "${room.hostIp}:${room.port} • ${room.playerCount}/10 Players",
                                                        color = Color(0xFFC7D2FE),
                                                        fontSize = 10.sp
                                                    )
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = Color(0xFF4338CA)
                                                ) {
                                                    Text(
                                                        text = "JOIN",
                                                        color = Color.White,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 11.sp,
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Authoritative Real Players Header
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "PLAYERS ${lobbyPlayers.size}/10",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black
                            )
                            if (lobbyPlayers.size < 2) {
                                Text(
                                    text = "Waiting for players... (Min 2)",
                                    color = Color(0xFFFFD54F),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            } else {
                                Text(
                                    text = "Ready to start! (${lobbyPlayers.size} connected)",
                                    color = Color(0xFF81C784),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Real players list (strictly NO bots)
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            lobbyPlayers.forEach { player ->
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    color = if (player.isHost) Color(0xFF0D47A1) else Color(0xFF1E293B),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, if (player.isHost) Color(0xFFFFD54F) else Color(0x33FFFFFF))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(text = player.avatar, fontSize = 20.sp)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Column {
                                                Text(
                                                    text = player.name,
                                                    color = Color.White,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp
                                                )
                                                Text(
                                                    text = when {
                                                        player.isHost -> "HOST"
                                                        player.isReconnecting -> "RECONNECTING..."
                                                        !player.isConnected -> "OFFLINE"
                                                        else -> "CONNECTED"
                                                    },
                                                    color = when {
                                                        player.isHost -> Color(0xFFFFD54F)
                                                        player.isReconnecting -> Color(0xFFFF9800)
                                                        !player.isConnected -> Color(0xFFEF5350)
                                                        else -> Color(0xFF81C784)
                                                    },
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }

                                        if (player.pingMs > 0) {
                                            Text(
                                                text = "${player.pingMs}ms",
                                                color = Color(0xFF81C784),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        }
                                    }
                                }
                            }

                            // Visual empty slots indicators (up to 4 empty slots shown)
                            val emptySlotsToShow = (10 - lobbyPlayers.size).coerceIn(0, 4)
                            repeat(emptySlotsToShow) {
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    color = Color(0x11FFFFFF),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, Color(0x22FFFFFF))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(text = "👤", fontSize = 16.sp, color = Color(0x44FFFFFF))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Waiting for friend to join...",
                                            color = Color(0x55FFFFFF),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Normal
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Player Count Selector (Shown ONLY for Solo Bots and Pass & Play)
            if (selectedMode == GameMode.SOLO_BOTS || selectedMode == GameMode.PASS_AND_PLAY) {
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
                                    text = if (selectedMode == GameMode.SOLO_BOTS) "Player Count (vs Bots)" else "Player Count (Pass & Play)",
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
                                        labelColor = Color(0xFF90CAF9)
                                    )
                                )
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

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
            val isMultiplayer = selectedMode == GameMode.ONLINE_ROOM || selectedMode == GameMode.WLAN_MULTIPLAYER
            val isHost = onlineTabIndex == 0
            val canStart = when {
                isMultiplayer && isHost -> lobbyPlayers.size >= 2
                isMultiplayer && !isHost -> false // Client waits for host to initiate
                else -> true
            }

            Button(
                onClick = {
                    if (canStart) {
                        onStartGame(
                            if (isMultiplayer) lobbyPlayers.size else playerCount.toInt(),
                            selectedMode,
                            currentRules,
                            if (isMultiplayer) roomCode else null
                        )
                    }
                },
                enabled = canStart,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .testTag("start_game_button"),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFE53935),
                    disabledContainerColor = Color(0xFF334155),
                    disabledContentColor = Color(0xFF94A3B8)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Start",
                    modifier = Modifier.size(28.dp),
                    tint = if (canStart) Color.White else Color(0xFF94A3B8)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = when {
                        isMultiplayer && isHost && lobbyPlayers.size < 2 -> "WAITING FOR PLAYERS (1/2 MINIMUM)"
                        isMultiplayer && isHost -> "START GAME (${lobbyPlayers.size} REAL PLAYERS)"
                        isMultiplayer && !isHost -> if (isClientConnected) "WAITING FOR HOST TO START GAME..." else "CONNECT TO JOIN LOBBY"
                        selectedMode == GameMode.SOLO_BOTS -> "PLAY VS BOTS (${playerCount.toInt()} PLAYERS)"
                        selectedMode == GameMode.PASS_AND_PLAY -> "START PASS & PLAY (${playerCount.toInt()} PLAYERS)"
                        else -> "START GAME"
                    },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = if (canStart) Color.White else Color(0xFF94A3B8),
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

        if (showEditProfileDialog) {
            EditProfileDialog(
                initialUsername = currentUsername,
                initialAvatar = currentAvatar,
                onDismiss = { showEditProfileDialog = false },
                onSave = { newName, newAvatar ->
                    val nameSuccess = viewModel.saveUsername(newName)
                    if (nameSuccess) {
                        viewModel.saveAvatar(newAvatar)
                        true
                    } else {
                        false
                    }
                },
                validate = { name -> viewModel.validateUsername(name) }
            )
        }
    }
}

@Composable
fun EditProfileDialog(
    initialUsername: String,
    initialAvatar: String,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Boolean,
    validate: (String) -> String?
) {
    var username by remember { mutableStateOf(initialUsername) }
    var selectedAvatar by remember { mutableStateOf(initialAvatar) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val avatars = listOf("🦁", "🦊", "🐯", "🐼", "🐵", "🐸", "🦄", "🐲", "🐺", "🦅", "🦉", "🐙")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Player Profile",
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Choose Your Avatar:",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    avatars.take(6).forEach { av ->
                        Surface(
                            shape = CircleShape,
                            color = if (selectedAvatar == av) Color(0xFFE53935) else Color(0x22FFFFFF),
                            border = if (selectedAvatar == av) BorderStroke(2.dp, Color(0xFFFFD54F)) else null,
                            modifier = Modifier
                                .size(38.dp)
                                .clickable { selectedAvatar = av }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(text = av, fontSize = 20.sp)
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    avatars.drop(6).forEach { av ->
                        Surface(
                            shape = CircleShape,
                            color = if (selectedAvatar == av) Color(0xFFE53935) else Color(0x22FFFFFF),
                            border = if (selectedAvatar == av) BorderStroke(2.dp, Color(0xFFFFD54F)) else null,
                            modifier = Modifier
                                .size(38.dp)
                                .clickable { selectedAvatar = av }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(text = av, fontSize = 20.sp)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Display Name:",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(6.dp))

                OutlinedTextField(
                    value = username,
                    onValueChange = {
                        username = it
                        errorMessage = validate(it)
                    },
                    singleLine = true,
                    isError = errorMessage != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("username_input_field"),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF64B5F6),
                        unfocusedBorderColor = Color(0x44FFFFFF),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )

                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = errorMessage ?: "",
                        color = Color(0xFFEF5350),
                        fontSize = 11.sp
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val err = validate(username)
                    if (err == null) {
                        val saved = onSave(username, selectedAvatar)
                        if (saved) onDismiss()
                    } else {
                        errorMessage = err
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935)),
                modifier = Modifier.testTag("save_profile_button")
            ) {
                Text("Save Profile")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Color(0xFF94A3B8))
            }
        },
        containerColor = Color(0xFF1E293B)
    )
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
                text = "PARTY",
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
                text = "2 to 10 Players • Party Card Game & Custom Wilds",
                color = Color(0xFF94A3B8),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)
            )
        }
    }
}
