package com.polyshop.catalog;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// All the HTTP endpoints for products and orders live here.
@RestController
public class CatalogController {

    private final ProductRepository products;
    private final OrderRepository orders;

    public CatalogController(ProductRepository products, OrderRepository orders) {
        this.products = products;
        this.orders = orders;
    }

    @GetMapping("/products")
    public List<Product> allProducts() {
        return products.findAll();
    }

    @GetMapping("/products/{id}")
    public ResponseEntity<Product> oneProduct(@PathVariable Long id) {
        return products.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // Body shape: { "name": "...", "category": "...", "emoji": "...", "priceCents": 1234, "description": "..." }
    @PostMapping("/products")
    public ResponseEntity<?> createProduct(@RequestBody ProductRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        if (req.priceCents() < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "priceCents must be positive"));
        }

        Product product = new Product(req.name(), req.category(), req.emoji(), req.priceCents(), req.description());
        Product saved = products.save(product);
        return ResponseEntity.ok(saved);
    }

    // Body shape: { "items": [ { "productId": 1, "quantity": 2 }, ... ] }
    @PostMapping("/orders")
    public ResponseEntity<?> placeOrder(@RequestBody OrderRequest req) {
        if (req.items() == null || req.items().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "cart is empty"));
        }

        Order order = new Order();
        int total = 0;

        var lineItems = new java.util.ArrayList<OrderItem>();
        for (var line : req.items()) {
            var product = products.findById(line.productId()).orElse(null);
            if (product == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "unknown product " + line.productId()));
            }
            OrderItem item = new OrderItem();
            item.setProductId(product.getId());
            item.setName(product.getName());
            item.setQuantity(line.quantity());
            item.setPriceCents(product.getPriceCents());
            total += product.getPriceCents() * line.quantity();
            lineItems.add(item);
        }

        order.setItems(lineItems);
        order.setTotalCents(total);
        Order saved = orders.save(order);

        return ResponseEntity.ok(Map.of(
                "orderId", saved.getId(),
                "totalCents", saved.getTotalCents(),
                "itemCount", lineItems.size()
        ));
    }

    // Java records = compact DTOs for parsing the request body
    public record OrderRequest(List<LineItem> items) {}
    public record LineItem(Long productId, int quantity) {}
    public record ProductRequest(String name, String category, String emoji, int priceCents, String description) {}
}
