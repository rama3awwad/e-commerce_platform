package com.store.inventory.grpc;

import com.store.inventory.entity.ReservationItem;
import com.store.inventory.service.InventoryService;
import com.store.inventory.service.InventoryService.ReserveResult;
import com.store.inventory.service.InventoryService.ShortageItem;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * طبقة gRPC Server - تُعرّف الخدمة للعالم الخارجي (لتطبيق NestJS).
 *
 * ملاحظة مهمة بخصوص الأسماء:
 *  - ItemShortage  : protobuf message مولّد من proto/inventory.proto (في نفس الحزمة grpc)
 *  - ShortageItem  : domain class يدوي داخل InventoryService (يحمل نفس البيانات)
 *  نحوّل من ShortageItem (داخلي) إلى ItemShortage (proto) قبل الإرسال.
 */
@GrpcService
public class InventoryGrpcService extends InventoryServiceGrpc.InventoryServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(InventoryGrpcService.class);

    private final InventoryService service;

    public InventoryGrpcService(InventoryService service) {
        this.service = service;
    }

    @Override
    public void getStock(GetStockRequest request,
                         StreamObserver<GetStockResponse> responseObserver) {

        String productId = request.getProductId();
        log.debug("gRPC GetStock: productId={}", productId);

        int available = service.getStock(productId);

        GetStockResponse response = GetStockResponse.newBuilder()
                .setProductId(productId)
                .setAvailable(available)
                .build();

        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }

    @Override
    public void setStock(SetStockRequest request,
                         StreamObserver<SetStockResponse> responseObserver) {

        String productId = request.getProductId();
        int quantity = request.getQuantity();
        log.debug("gRPC SetStock: productId={}, quantity={}", productId, quantity);

        try {
            int available = service.setStock(productId, quantity);
            SetStockResponse response = SetStockResponse.newBuilder()
                    .setSuccess(true)
                    .setAvailable(available)
                    .build();
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (IllegalArgumentException e) {
            responseObserver.onError(io.grpc.Status.INVALID_ARGUMENT
                    .withDescription(e.getMessage())
                    .asRuntimeException());
        }
    }

    @Override
    public void reserveStock(ReserveStockRequest request,
                             StreamObserver<ReserveStockResponse> responseObserver) {

        String reservationId = request.getReservationId();
        log.debug("gRPC ReserveStock: reservationId={}, items={}",
                reservationId, request.getItemsCount());

        List<ReservationItem> items = request.getItemsList().stream()
                .map(i -> new ReservationItem(i.getProductId(), i.getQuantity()))
                .toList();

        ReserveResult result = service.reserve(reservationId, items);

        ReserveStockResponse.Builder responseBuilder = ReserveStockResponse.newBuilder()
                .setSuccess(result.isSuccess());

        if (!result.isSuccess() && result.getShortages() != null && !result.getShortages().isEmpty()) {
            for (ShortageItem s : result.getShortages()) {
                responseBuilder.addShortages(ItemShortage.newBuilder()
                        .setProductId(s.getProductId())
                        .setRequested(s.getRequested())
                        .setAvailable(s.getAvailable())
                        .build());
            }
        }

        if (!result.isSuccess() && result.getError() != null) {
            log.warn("Reserve rejected with error: {}", result.getError());
        }

        responseObserver.onNext(responseBuilder.build());
        responseObserver.onCompleted();
    }

    @Override
    public void releaseStock(ReleaseStockRequest request,
                             StreamObserver<ReleaseStockResponse> responseObserver) {

        String reservationId = request.getReservationId();
        log.debug("gRPC ReleaseStock: reservationId={}", reservationId);

        boolean released = service.release(reservationId);

        ReleaseStockResponse response = ReleaseStockResponse.newBuilder()
                .setReleased(released)
                .build();

        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
}
