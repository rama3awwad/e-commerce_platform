package com.store.inventory.repository;

import com.store.inventory.entity.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * مستودع بيانات الحجوزات.
 */
@Repository
public interface ReservationRepository extends JpaRepository<Reservation, String> {

    Optional<Reservation> findByReservationId(String reservationId);
}
