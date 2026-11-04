package com.store.inventory.repository;

import com.store.inventory.entity.StockItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * مستودع بيانات المخزون.
 *
 * يحوي الاستعلام الذرّي الذّي يحمي من Race Condition:
 *
 *   UPDATE stock_items
 *   SET quantity = quantity - :qty
 *   WHERE product_id = :id AND quantity >= :qty
 *
 * لو كانت الكمية غير كافية، لا يُحدَّث أي صف ويعود 0 من affected rows.
 */
@Repository
public interface StockItemRepository extends JpaRepository<StockItem, String> {

    @Modifying
    @Query("UPDATE StockItem s SET s.quantity = s.quantity - :qty " +
           "WHERE s.productId = :id AND s.quantity >= :qty")
    int decrementIfAvailable(@Param("id") String productId, @Param("qty") int quantity);

    @Modifying
    @Query("UPDATE StockItem s SET s.quantity = s.quantity + :qty WHERE s.productId = :id")
    int addQuantity(@Param("id") String productId, @Param("qty") int quantity);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM StockItem s WHERE s.productId IN :ids")
    List<StockItem> lockByProductIds(@Param("ids") List<String> productIds);

    Optional<StockItem> findByProductId(String productId);
}
