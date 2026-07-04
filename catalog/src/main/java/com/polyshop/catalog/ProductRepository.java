package com.polyshop.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

// Extending JpaRepository gives findAll, findById, save, etc. with zero code.
public interface ProductRepository extends JpaRepository<Product, Long> {
}
