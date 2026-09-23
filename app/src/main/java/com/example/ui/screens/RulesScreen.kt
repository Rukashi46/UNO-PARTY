package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.GameRules

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RulesScreen(
    currentRules: GameRules,
    onSaveRules: (GameRules) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var rules by remember { mutableStateOf(currentRules) }
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Game Rules & Presets", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            onSaveRules(rules)
                            onBack()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Save,
                            contentDescription = "Save Rules",
                            tint = Color(0xFFFFD54F)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A),
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { paddingValues ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            // Note banner for rules
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0xFF64B5F6))
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Info",
                        tint = Color(0xFF64B5F6),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Customize your house rules below! Toggle stacking, 7-0 swaps, jump-in, and more anytime.",
                        color = Color(0xFFE2E8F0),
                        fontSize = 13.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Presets row
            Text(
                text = "Quick Presets",
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = rules == GameRules.SPICY_HOUSE_RULES,
                    onClick = { rules = GameRules.SPICY_HOUSE_RULES },
                    label = { Text("Spicy House") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFE53935),
                        selectedLabelColor = Color.White
                    )
                )
                FilterChip(
                    selected = rules == GameRules.OFFICIAL_RULES,
                    onClick = { rules = GameRules.OFFICIAL_RULES },
                    label = { Text("Official Rules") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFF1976D2),
                        selectedLabelColor = Color.White
                    )
                )
                FilterChip(
                    selected = rules == GameRules.STACK_ATTACK,
                    onClick = { rules = GameRules.STACK_ATTACK },
                    label = { Text("Stack Attack") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFF388E3C),
                        selectedLabelColor = Color.White
                    )
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Section: Card Stacking
            RulesCategoryCard(title = "🃏 Card Stacking Rules") {
                RuleToggleItem(
                    title = "Stack Draw Two (+2)",
                    description = "When a +2 is played, next player can play another +2, passing the penalty (+4, +6...)",
                    checked = rules.stackingDrawTwos,
                    onCheckedChange = { rules = rules.copy(stackingDrawTwos = it) }
                )
                RuleToggleItem(
                    title = "Stack Wild Draw Four (+4)",
                    description = "When a +4 is played, next player can respond with another +4 to pass the draw penalty (+8...)",
                    checked = rules.stackingDrawFours,
                    onCheckedChange = { rules = rules.copy(stackingDrawFours = it) }
                )
                RuleToggleItem(
                    title = "Stack +4 onto +2",
                    description = "Allow playing a Wild Draw Four directly on top of a Draw Two",
                    checked = rules.stackingDrawFourOnTwo,
                    onCheckedChange = { rules = rules.copy(stackingDrawFourOnTwo = it) }
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Section: Special Action Rules
            RulesCategoryCard(title = "🌪️ Action & Chaos Rules") {
                RuleToggleItem(
                    title = "7-0 Hand Swap & Rotation",
                    description = "Playing 7 lets you swap hands with ANY player; Playing 0 passes all hands in direction of play",
                    checked = rules.sevenZeroRule,
                    onCheckedChange = { rules = rules.copy(sevenZeroRule = it) }
                )
                RuleToggleItem(
                    title = "Jump-In Rule",
                    description = "If you hold an EXACT match (same color & symbol), you can play it immediately even out of turn!",
                    checked = rules.jumpInRule,
                    onCheckedChange = { rules = rules.copy(jumpInRule = it) }
                )
                RuleToggleItem(
                    title = "Draw Until Playable",
                    description = "Keep drawing cards until you find a card you can play, instead of drawing just 1 card",
                    checked = rules.drawUntilPlayable,
                    onCheckedChange = { rules = rules.copy(drawUntilPlayable = it) }
                )
                RuleToggleItem(
                    title = "Force Play",
                    description = "If you draw a card that is playable, you MUST play it immediately",
                    checked = rules.forcePlay,
                    onCheckedChange = { rules = rules.copy(forcePlay = it) }
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Section: Penalties & Elimination
            RulesCategoryCard(title = "⚖️ Penalties & Limits") {
                RuleToggleItem(
                    title = "Mercy Rule",
                    description = "Players who accumulate 25 or more cards in hand are eliminated from the round",
                    checked = rules.mercyRule,
                    onCheckedChange = { rules = rules.copy(mercyRule = it) }
                )
                RuleToggleItem(
                    title = "Wild Draw 4 Challenge",
                    description = "Allows challenged opponent to check if previous player had matching color card",
                    checked = rules.wildDrawFourChallenge,
                    onCheckedChange = { rules = rules.copy(wildDrawFourChallenge = it) }
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Section: Custom Wild Cards
            RulesCategoryCard(title = "⚡ Custom Wild Cards (3× in Deck)") {
                RuleToggleItem(
                    title = "Enable Custom Wild Cards (3× ⚡)",
                    description = "When ON, the deck contains exactly 3 physical Custom Wild cards. When played, the player dynamically chooses between '🔀 Shuffle Hands' and '➕ Everyone +4'.",
                    checked = rules.includeCustomWilds,
                    onCheckedChange = { rules = rules.copy(includeCustomWilds = it) }
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Section: Setup & Pace
            RulesCategoryCard(title = "⚙️ Hand Size & Game Settings") {
                // Initial hand size
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Starting Hand Size", color = Color.White, fontWeight = FontWeight.Bold)
                        Text("Number of cards dealt to each player", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(5, 7, 10).forEach { size ->
                            FilterChip(
                                selected = rules.initialCardsPerPlayer == size,
                                onClick = { rules = rules.copy(initialCardsPerPlayer = size) },
                                label = { Text("$size") },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFFE53935),
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }
                }

                // Bot Speed
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Bot Turn Speed", color = Color.White, fontWeight = FontWeight.Bold)
                        Text("Delay for bot turns", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(Pair("Fast", 450L), Pair("Normal", 900L), Pair("Slow", 1500L)).forEach { (label, ms) ->
                            FilterChip(
                                selected = rules.botSpeedMs == ms,
                                onClick = { rules = rules.copy(botSpeedMs = ms) },
                                label = { Text(label) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFF1976D2),
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }
                }

                RuleToggleItem(
                    title = "Haptic Vibrations",
                    description = "Vibration feedback on card plays, turns, and UNO shouts",
                    checked = rules.hapticsEnabled,
                    onCheckedChange = { rules = rules.copy(hapticsEnabled = it) }
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Save & Apply Button
            Button(
                onClick = {
                    onSaveRules(rules)
                    onBack()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("save_rules_button"),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
            ) {
                Icon(Icons.Default.Save, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("APPLY & SAVE RULES", fontWeight = FontWeight.Black, fontSize = 15.sp)
            }

            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun RulesCategoryCard(
    title: String,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        border = BorderStroke(1.dp, Color(0x33FFFFFF))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                color = Color(0xFFFFD54F),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun RuleToggleItem(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = description,
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                lineHeight = 14.sp
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = Color(0xFFE53935),
                uncheckedTrackColor = Color(0xFF334155)
            )
        )
    }
}
