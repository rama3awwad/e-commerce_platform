package com.store.inventory.service;

import com.store.inventory.entity.Reservation;
import com.store.inventory.entity.ReservationItem;
import com.store.inventory.entity.ReservationStatus;
import com.store.inventory.entity.StockItem;
import com.store.inventory.repository.ReservationRepository;
import com.store.inventory.repository.StockItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * الخدمة الأساسية للمخزون - تحوي المنطق الذرّي للحجز والإرجاع.
 *
 * المسؤوليات:
 *  - getStock(productId): قراءة الكمية المتوفرة
 *  - setStock(productId, quantity): تعديل الكمية (نداء إداري من NestJS)
 *  - reserve(reservationId, items): حجز كله أو لا شيء
 *  - release(reservationId): إرجاع الكمية المحجوزة (Idempotent)
 *
 * ضمانات:
 *  - Atomicity: الـreserve كلها في معاملة واحدة، إما تنجح كلها أو تفشل كلها.
 *  - Idempotency: تكرار reserve/release بنفس reservationId آمن.
 *  - Race safety: تحديث ذرّي يحمي من سباق الطلبات المتزامنة على آخر قطعة.
 */
@Service
public class InventoryService {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    private final StockItemRepository stockRepo;
    private final ReservationRepository reservationRepo;

    public InventoryService(StockItemRepository stockRepo,
                           ReservationRepository reservationRepo) {
        this.stockRepo = stockRepo;
        this.reservationRepo = reservationRepo;
    }

    // ====================================================================
    // GET STOCK
    // ====================================================================

    @Transactional(readOnly = true)
    public int getStock(String productId) {
        return stockRepo.findByProductId(productId)
                .map(StockItem::getQuantity)
                .orElse(0);
    }

    // ====================================================================
    // SET STOCK
    // ====================================================================

    @Transactional
    public int setStock(String productId, int quantity) {
        if (quantity < 0) {
            throw new IllegalArgumentException("Quantity cannot be negative: " + quantity);
        }
        StockItem item = stockRepo.findByProductId(productId)
                .orElseGet(() -> new StockItem(productId, 0));
        item.setQuantity(quantity);
        stockRepo.save(item);
        return quantity;
    }

    // ====================================================================
    // RESERVE
    // ====================================================================

    @Transactional
    public ReserveResult reserve(String reservationId, List<ReservationItem> items) {

        // 1) Idempotency check
        Optional<Reservation> existing = reservationRepo.findByReservationId(reservationId);
        if (existing.isPresent() && existing.get().getStatus() == ReservationStatus.RESERVED) {
            log.info("Reserve idempotent hit: reservationId={} already RESERVED", reservationId);
            return ReserveResult.success();
        }

        // 2) Normalize + validate
        if (items == null || items.isEmpty()) {
            return ReserveResult.failure("Reservation must contain at least one item");
        }
        for (ReservationItem it : items) {
            if (it.getQuantity() == null || it.getQuantity() <= 0) {
                return ReserveResult.failure("Invalid quantity for product " + it.getProductId()
                        + ": " + it.getQuantity());
            }
        }

        // 3) التحقق من توفر الكمية لكل المنتجات قبل الخصم (all-or-nothing)
        List<ShortageItem> shortages = new ArrayList<>();
        for (ReservationItem it : items) {
            int available = stockRepo.findByProductId(it.getProductId())
                    .map(StockItem::getQuantity)
                    .orElse(0);
            if (available < it.getQuantity()) {
                shortages.add(new ShortageItem(it.getProductId(), it.getQuantity(), available));
            }
        }
        if (!shortages.isEmpty()) {
            log.info("Reserve rejected (insufficient): reservationId={}, shortages={}",
                    reservationId, shortages);
            return ReserveResult.failure(shortages);
        }

        // 4) الخصم الذرّي لكل المنتجات داخل نفس المعاملة
        for (ReservationItem it : items) {
            int affected = stockRepo.decrementIfAvailable(it.getProductId(), it.getQuantity());
            if (affected == 0) {
                log.warn("Reserve race detected on product {} for reservation {}",
                        it.getProductId(), reservationId);
                throw new IllegalStateException("Concurrent modification on product: "
                        + it.getProductId());
            }
        }

        // 5) سجّل الحجز
        Reservation reservation = new Reservation(
                reservationId,
                ReservationStatus.RESERVED,
                new ArrayList<>(items)
        );
        reservationRepo.save(reservation);

        log.info("Reserve success: reservationId={}, items={}", reservationId, items.size());
        return ReserveResult.success();
    }

    // ====================================================================
    // RELEASE
    // ====================================================================

    @Transactional
    public boolean release(String reservationId) {

        Optional<Reservation> existing = reservationRepo.findByReservationId(reservationId);
        if (existing.isEmpty()) {
            log.info("Release no-op: reservationId={} not found", reservationId);
            return false;
        }

        Reservation reservation = existing.get();
        if (reservation.getStatus() == ReservationStatus.RELEASED) {
            log.info("Release idempotent hit: reservationId={} already RELEASED", reservationId);
            return false;
        }

        for (ReservationItem it : reservation.getItems()) {
            stockRepo.addQuantity(it.getProductId(), it.getQuantity());
        }

        reservation.setStatus(ReservationStatus.RELEASED);
        reservationRepo.save(reservation);

        log.info("Release success: reservationId={}, items returned={}",
                reservationId, reservation.getItems().size());
        return true;
    }

    // ================================================================
    // Result types
    // ================================================================

    /**
     * نتيجة عملية الحجز.
     *
     *  - isSuccess=true,  shortages=[],    error=null     → نجاح كامل
     *  - isSuccess=false, shortages=[…],  error=null     → فشل لنقص الكمية (اقرأ shortages)
     *  - isSuccess=false, shortages=[],   error="…"      → فشل لسبب آخر (validation، ...)
     */
    public static class ReserveResult {

        private final boolean success;
        private final List<ShortageItem> shortages;
        private final String error;

        private ReserveResult(boolean success, List<ShortageItem> shortages, String error) {
            this.success = success;
            this.shortages = shortages == null ? List.of() : shortages;
            this.error = error;
        }

        public static ReserveResult success() {
            return new ReserveResult(true, List.of(), null);
        }

        public static ReserveResult failure(List<ShortageItem> shortages) {
            return new ReserveResult(false, shortages, null);
        }

        public static ReserveResult failure(String error) {
            return new ReserveResult(false, List.of(), error);
        }

        public boolean isSuccess() { return success; }
        public List<ShortageItem> getShortages() { return shortages; }
        public String getError() { return error; }
    }

    /**
     * تفاصيل نقص كمية منتج واحد في الطلب.
     *
     * ملاحظة: الاسم ShortageItem (وليس ItemShortage) لتفادي التعارض مع
     * protobuf message المولّد بنفس الاسم في حزمة com.store.inventory.grpc.
     */
    public static class ShortageItem {

        private final String productId;
        private final int requested;
        private final int available;

        public ShortageItem(String productId, int requested, int available) {
            this.productId = productId;
            this.requested = requested;
            this.available = available;
        }

        public String getProductId() { return productId; }
        public int getRequested() { return requested; }
        public int getAvailable() { return available; }

        @Override
        public String toString() {
            return "ShortageItem{productId='" + productId + '\'' +
                    ", requested=" + requested +
                    ", available=" + available + '}';
        }
    }
}
