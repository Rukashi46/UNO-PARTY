package com.example.engine

import com.example.model.DeckType
import com.example.model.UnoCard
import com.example.model.UnoColor
import com.example.model.UnoValue
import java.util.UUID

object UnoDeck {

    /**
     * Generates a complete, validated UNO deck according to the specified DeckType.
     *
     * 1. CLASSIC_108: Exactly 108 cards (76 number + 24 action + 8 wild)
     * 2. MODERN_112: Exactly 112 cards (108 classic + 1 Shuffle Hands + 3 Custom Wild)
     * 3. NO_MERCY_168: Exactly 168 cards (144 colored cards + 24 cutthroat wild cards)
     */
    fun generateDeck(
        deckCount: Int = 1,
        includeCustomWilds: Boolean = true,
        deckType: DeckType = DeckType.MODERN_112
    ): MutableList<UnoCard> {
        val cards = mutableListOf<UnoCard>()
        val playableColors = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)

        for (d in 0 until deckCount) {
            when (deckType) {
                DeckType.NO_MERCY_168 -> {
                    val noMercyDeck = generateNoMercyDeck()
                    // Validate exactly 168 cards
                    validateNoMercyDeck(noMercyDeck)
                    cards.addAll(noMercyDeck)
                }
                DeckType.CLASSIC_108 -> {
                    val classicDeck = generateClassicDeck(playableColors)
                    validateClassicDeck(classicDeck)
                    cards.addAll(classicDeck)
                }
                DeckType.MODERN_112 -> {
                    val modernDeck = generateModernDeck(playableColors, includeCustomWilds)
                    validateModernDeck(modernDeck)
                    cards.addAll(modernDeck)
                }
            }
        }

        cards.shuffle()
        return cards
    }

    private fun generateClassicDeck(playableColors: List<UnoColor>): MutableList<UnoCard> {
        val deck = mutableListOf<UnoCard>()
        for (color in playableColors) {
            // One '0' per color
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.ZERO))

            // Two each of 1 through 9
            for (numberVal in listOf(
                UnoValue.ONE, UnoValue.TWO, UnoValue.THREE, UnoValue.FOUR,
                UnoValue.FIVE, UnoValue.SIX, UnoValue.SEVEN, UnoValue.EIGHT, UnoValue.NINE
            )) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numberVal))
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numberVal))
            }

            // Two each of Skip, Reverse, Draw Two
            for (actionVal in listOf(UnoValue.SKIP, UnoValue.REVERSE, UnoValue.DRAW_TWO)) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = actionVal))
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = actionVal))
            }
        }

        // 4 Wild and 4 Wild Draw Four
        for (i in 0 until 4) {
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD))
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_DRAW_FOUR))
        }
        return deck
    }

    private fun generateModernDeck(playableColors: List<UnoColor>, includeCustomWilds: Boolean): MutableList<UnoCard> {
        val deck = generateClassicDeck(playableColors)
        if (includeCustomWilds) {
            // 3 Customizable Wild cards and 1 Wild Shuffle Hands card
            for (i in 0 until 3) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.CUSTOM_WILD))
            }
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.SHUFFLE_HANDS))
        }
        return deck
    }

    /**
     * Generates the official UNO Show 'Em No Mercy 168-card composition:
     * - 4 colors × 36 cards = 144 colored cards
     * - 24 cutthroat wild cards
     * Total = 168 cards.
     */
    private fun generateNoMercyDeck(): MutableList<UnoCard> {
        val deck = mutableListOf<UnoCard>()
        val colors = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)

        for (color in colors) {
            // Number cards: 2 of each 0 through 9 (20 cards per color)
            for (numVal in listOf(
                UnoValue.ZERO, UnoValue.ONE, UnoValue.TWO, UnoValue.THREE, UnoValue.FOUR,
                UnoValue.FIVE, UnoValue.SIX, UnoValue.SEVEN, UnoValue.EIGHT, UnoValue.NINE
            )) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numVal))
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = numVal))
            }

            // Draw 2: 3 cards
            repeat(3) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.DRAW_TWO))
            }

            // Colored Draw 4: 2 cards
            repeat(2) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.DRAW_FOUR))
            }

            // Skip: 3 cards
            repeat(3) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.SKIP))
            }

            // Colored Skip Everyone: 2 cards
            repeat(2) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.SKIP_EVERYONE))
            }

            // Reverse: 3 cards
            repeat(3) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.REVERSE))
            }

            // Colored Discard All: 3 cards
            repeat(3) {
                deck.add(UnoCard(id = UUID.randomUUID().toString(), color = color, value = UnoValue.DISCARD_ALL))
            }
        }

        // Wild Cards (24 total):
        // Wild Reverse Draw 4: 8 cards
        repeat(8) {
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_REVERSE_DRAW_FOUR))
        }

        // Wild Draw 6: 4 cards
        repeat(4) {
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_DRAW_SIX))
        }

        // Wild Draw 10: 4 cards
        repeat(4) {
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_DRAW_TEN))
        }

        // Wild Color Roulette: 8 cards
        repeat(8) {
            deck.add(UnoCard(id = UUID.randomUUID().toString(), color = UnoColor.WILD, value = UnoValue.WILD_COLOR_ROULETTE))
        }

        return deck
    }

    /**
     * Automated validator for No Mercy 168-card deck.
     */
    fun validateNoMercyDeck(deck: List<UnoCard>) {
        require(deck.size == 168) { "No Mercy deck must have exactly 168 cards, but found ${deck.size}" }

        val colors = listOf(UnoColor.RED, UnoColor.YELLOW, UnoColor.GREEN, UnoColor.BLUE)
        val numberValues = listOf(
            UnoValue.ZERO, UnoValue.ONE, UnoValue.TWO, UnoValue.THREE, UnoValue.FOUR,
            UnoValue.FIVE, UnoValue.SIX, UnoValue.SEVEN, UnoValue.EIGHT, UnoValue.NINE
        )

        for (color in colors) {
            val colorCards = deck.filter { it.color == color }
            require(colorCards.size == 36) { "Each color in No Mercy must have 36 cards, $color has ${colorCards.size}" }

            for (v in numberValues) {
                val count = colorCards.count { it.value == v }
                require(count == 2) { "Color $color must have 2 of ${v.symbol}, found $count" }
            }
            require(colorCards.count { it.value == UnoValue.DRAW_TWO } == 3) { "Color $color must have 3 Draw 2 cards" }
            require(colorCards.count { it.value == UnoValue.DRAW_FOUR } == 2) { "Color $color must have 2 Draw 4 cards" }
            require(colorCards.count { it.value == UnoValue.SKIP } == 3) { "Color $color must have 3 Skip cards" }
            require(colorCards.count { it.value == UnoValue.SKIP_EVERYONE } == 2) { "Color $color must have 2 Skip Everyone cards" }
            require(colorCards.count { it.value == UnoValue.REVERSE } == 3) { "Color $color must have 3 Reverse cards" }
            require(colorCards.count { it.value == UnoValue.DISCARD_ALL } == 3) { "Color $color must have 3 Discard All cards" }
        }

        val wildCards = deck.filter { it.color == UnoColor.WILD }
        require(wildCards.size == 24) { "No Mercy must have 24 Wild cards, found ${wildCards.size}" }
        require(wildCards.count { it.value == UnoValue.WILD_REVERSE_DRAW_FOUR } == 8) { "Must have 8 Wild Reverse Draw 4 cards" }
        require(wildCards.count { it.value == UnoValue.WILD_DRAW_SIX } == 4) { "Must have 4 Wild Draw 6 cards" }
        require(wildCards.count { it.value == UnoValue.WILD_DRAW_TEN } == 4) { "Must have 4 Wild Draw 10 cards" }
        require(wildCards.count { it.value == UnoValue.WILD_COLOR_ROULETTE } == 8) { "Must have 8 Wild Color Roulette cards" }
    }

    fun validateClassicDeck(deck: List<UnoCard>) {
        require(deck.size == 108) { "Classic deck must have exactly 108 cards, but found ${deck.size}" }
    }

    fun validateModernDeck(deck: List<UnoCard>) {
        require(deck.size == 112 || deck.size == 108) { "Modern deck must have 112 cards, but found ${deck.size}" }
    }

    val AVATAR_LIST = listOf(
        "🦁", "🦊", "🐼", "🐯", "🐻", "🐨", "🦄", "🦅", "🐺", "🐲"
    )

    val BOT_NAMES = listOf(
        "Leo", "Clever Fox", "Chill Panda", "Fast Tiger", "Big Bear",
        "Cozy Koala", "Mystic Nova", "Eagle Eye", "Alpha Wolf", "Dragon Ace"
    )
}
