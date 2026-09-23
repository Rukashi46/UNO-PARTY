package com.example.engine

import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue
import java.util.UUID

object UnoDeck {

    fun generateDeck(deckCount: Int = 1, includeCustomWilds: Boolean = true): MutableList<UnoCard> {
        val cards = mutableListOf<UnoCard>()
        val playableColors = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)

        for (d in 0 until deckCount) {
            for (color in playableColors) {
                // One '0' per color
                cards.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.ZERO))

                // Two each of 1 through 9
                for (numberVal in listOf(
                    UnoValue.ONE, UnoValue.TWO, UnoValue.THREE, UnoValue.FOUR,
                    UnoValue.FIVE, UnoValue.SIX, UnoValue.SEVEN, UnoValue.EIGHT, UnoValue.NINE
                )) {
                    cards.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numberVal))
                    cards.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numberVal))
                }

                // Two each of Skip, Reverse, Draw Two
                for (actionVal in listOf(UnoValue.SKIP, UnoValue.REVERSE, UnoValue.DRAW_TWO)) {
                    cards.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = actionVal))
                    cards.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = actionVal))
                }
            }

            // 4 Wild and 4 Wild Draw Four
            for (i in 0 until 4) {
                cards.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD))
                cards.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_DRAW_FOUR))
            }
        }

        // Add EXACTLY 3 Custom Wild cards (3 × Custom Wild ⚡) and 1 Shuffle Hands (1 × Shuffle Hands 🔀)
        // Matching official physical card deck: exactly 4 special cards
        if (includeCustomWilds) {
            for (i in 0 until 3) {
                cards.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.CUSTOM_WILD))
            }
            cards.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.SHUFFLE_HANDS))
        }

        cards.shuffle()
        return cards
    }

    val AVATAR_LIST = listOf(
        "🦁", "🦊", "🐼", "🐯", "🐻", "🐨", "🦄", "🦅", "🐺", "🐲"
    )

    val BOT_NAMES = listOf(
        "Leo", "Clever Fox", "Chill Panda", "Fast Tiger", "Big Bear",
        "Cozy Koala", "Mystic Nova", "Eagle Eye", "Alpha Wolf", "Dragon Ace"
    )
}
