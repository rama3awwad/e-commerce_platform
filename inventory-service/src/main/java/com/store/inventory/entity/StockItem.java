package com.store.inventory.entity;

import jakarta.persistence.*;

/**
 * جدول المخزون الرئيسي - كل منتج له سطر واحد.
 *
 * الحقول:
 *  - productId: نفس Product.id في تطبيق NestJS (UUID string)
 *  - quantity:  الكمية المتوفرة فعلاً (بعد خصم المحجوز)
 *
 * ملاحظات تصميمية:
 *  - لا يوجد "total" و "reserved" منفصلين، نحتفظ بالـمتاح فقط.
 *    لأن الحجز يُخصم من quantity مباشرة، والإرجاع يُزيدها.
 *  - @Version لـoptimistic locking كطبقة حماية إضافية فوق SELECT FOR UPDATE.
 */
@Entity
@Table(name = "stock_items")
public class StockItem {

    @Id
    @Column(name = "product_id", length = 36)
    private String productId;

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 0;

    @Version
    private Long version;

    public StockItem() {}

    public StockItem(String productId, Integer quantity) {
        this.productId = productId;
        this.quantity = quantity;
    }

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
}
