package com.polyshop.catalog;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

// Runs once on startup. If there are no products yet, insert the seed catalog.
// This is our "seed data" - kept in code so it is version-controlled and simple.
@Component
public class DataSeeder implements CommandLineRunner {

    private final ProductRepository products;

    public DataSeeder(ProductRepository products) {
        this.products = products;
    }

    @Override
    public void run(String... args) {
        if (products.count() > 0) return;

        products.saveAll(List.of(
            new Product("Aurora Desk Lamp", "Home", "\uD83D\uDCA1", 3200, "Warm dimmable LED lamp with a matte aluminium arm."),
            new Product("Trailhead Backpack", "Outdoor", "\uD83C\uDF92", 6800, "28L weather-resistant pack with a padded laptop sleeve."),
            new Product("Ember Coffee Mug", "Kitchen", "\u2615", 1500, "Double-walled ceramic mug that keeps drinks hot longer."),
            new Product("Pulse Wireless Earbuds", "Audio", "\uD83C\uDFA7", 4900, "Low-latency earbuds with 30 hours of battery life."),
            new Product("Drift Mechanical Keyboard", "Tech", "\u2328\uFE0F", 8900, "Hot-swappable 75% keyboard with tactile switches."),
            new Product("Sol Sunglasses", "Apparel", "\uD83D\uDD76\uFE0F", 2600, "Polarised lenses in a lightweight recycled frame."),
            new Product("Grove Plant Pot", "Home", "\uD83E\uDEB4", 1900, "Self-watering pot with a natural terracotta finish."),
            new Product("Tempo Running Shoes", "Apparel", "\uD83D\uDC5F", 7200, "Breathable knit upper with a responsive foam sole.")
        ));

        System.out.println("Seeded " + products.count() + " products.");
    }
}
