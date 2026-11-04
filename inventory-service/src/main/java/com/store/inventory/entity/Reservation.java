package com.store.inventory.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * جدول الحجوزات - سجل لكل عملية reserve.
 *
 * الحقول:
 *  - reservationId: UUID يولّده NestJS، مفتاح أساسي + Idempotency key
 *  - status:        حالة الحجز (RESERVED أو RELEASED)
 *  - items:         بنود الحجز (productId + quantity) - تُخزَّن في جدول فرعي
 *  - createdAt:     وقت إنشاء الحجز
 *
 * Idempotency:
 *  - تكرار reserve بنفس reservationId يُرجع النتيجة السابقة دون حجز مرة ثانية.
 *  - تكرار release بنفس reservationId لا يُرجع الكمية مرتين.
 */
@Entity
@Table(name = "reservations")
public class Reservation {

    @Id
    @Column(name = "reservation_id", length = 36)
    private String reservationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ReservationStatus status;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
        name = "reservation_items",
        joinColumns = @JoinColumn(name = "reservation_id")
    )
    private List<ReservationItem> items = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public Reservation() {}

    public Reservation(String reservationId, ReservationStatus status, List<ReservationItem> items) {
        this.reservationId = reservationId;
        this.status = status;
        this.items = items;
        this.createdAt = Instant.now();
    }

    public String getReservationId() { return reservationId; }
    public void setReservationId(String reservationId) { this.reservationId = reservationId; }

    public ReservationStatus getStatus() { return status; }
    public void setStatus(ReservationStatus status) { this.status = status; }

    public List<ReservationItem> getItems() { return items; }
    public void setItems(List<ReservationItem> items) { this.items = items; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
