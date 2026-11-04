package com.store.inventory.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * بند حجز واحد داخل قائمة بنود الحجز.
 *
 * Embeddable يعني: لا يوجد جدول منفصل لهذا الكيان،
 * بل يُخزَّن كجزء من جدول reservations (عادة بـ@ElementCollection).
 */
@Embeddable
public class ReservationItem {

    @Column(name = "product_id", length = 36, nullable = false)
    private String productId;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    public ReservationItem() {}

    public ReservationItem(String productId, Integer quantity) {
        this.productId = productId;
        this.quantity = quantity;
    }

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
}
