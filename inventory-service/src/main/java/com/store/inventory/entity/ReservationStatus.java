package com.store.inventory.entity;

/**
 * حالة الحجز - تتحكم في Idempotency.
 *
 * RESERVED  : الحجز نشط، الكمية محجوزة
 * RELEASED  : الحجز مُلغى، الكمية أُرجعت
 */
public enum ReservationStatus {
    RESERVED,
    RELEASED
}
