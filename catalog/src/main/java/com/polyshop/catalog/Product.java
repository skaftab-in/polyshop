package com.polyshop.catalog;

import jakarta.persistence.*;

// A JPA entity. Each field becomes a column. JPA creates/reads the table for us.
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String category;
    private String emoji;        // used by the UI as a simple visual, no image files needed
    private int priceCents;      // store money as integer cents, never floats
    private String description;

    // JPA needs a no-args constructor
    public Product() {}

    public Product(String name, String category, String emoji, int priceCents, String description) {
        this.name = name;
        this.category = category;
        this.emoji = emoji;
        this.priceCents = priceCents;
        this.description = description;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getEmoji() { return emoji; }
    public int getPriceCents() { return priceCents; }
    public String getDescription() { return description; }
}
