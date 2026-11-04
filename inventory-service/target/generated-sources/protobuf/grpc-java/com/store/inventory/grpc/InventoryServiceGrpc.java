package com.store.inventory.grpc;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.66.0)",
    comments = "Source: inventory.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class InventoryServiceGrpc {

  private InventoryServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "inventory.v1.InventoryService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.store.inventory.grpc.GetStockRequest,
      com.store.inventory.grpc.GetStockResponse> getGetStockMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetStock",
      requestType = com.store.inventory.grpc.GetStockRequest.class,
      responseType = com.store.inventory.grpc.GetStockResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.store.inventory.grpc.GetStockRequest,
      com.store.inventory.grpc.GetStockResponse> getGetStockMethod() {
    io.grpc.MethodDescriptor<com.store.inventory.grpc.GetStockRequest, com.store.inventory.grpc.GetStockResponse> getGetStockMethod;
    if ((getGetStockMethod = InventoryServiceGrpc.getGetStockMethod) == null) {
      synchronized (InventoryServiceGrpc.class) {
        if ((getGetStockMethod = InventoryServiceGrpc.getGetStockMethod) == null) {
          InventoryServiceGrpc.getGetStockMethod = getGetStockMethod =
              io.grpc.MethodDescriptor.<com.store.inventory.grpc.GetStockRequest, com.store.inventory.grpc.GetStockResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetStock"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.GetStockRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.GetStockResponse.getDefaultInstance()))
              .setSchemaDescriptor(new InventoryServiceMethodDescriptorSupplier("GetStock"))
              .build();
        }
      }
    }
    return getGetStockMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.store.inventory.grpc.SetStockRequest,
      com.store.inventory.grpc.SetStockResponse> getSetStockMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SetStock",
      requestType = com.store.inventory.grpc.SetStockRequest.class,
      responseType = com.store.inventory.grpc.SetStockResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.store.inventory.grpc.SetStockRequest,
      com.store.inventory.grpc.SetStockResponse> getSetStockMethod() {
    io.grpc.MethodDescriptor<com.store.inventory.grpc.SetStockRequest, com.store.inventory.grpc.SetStockResponse> getSetStockMethod;
    if ((getSetStockMethod = InventoryServiceGrpc.getSetStockMethod) == null) {
      synchronized (InventoryServiceGrpc.class) {
        if ((getSetStockMethod = InventoryServiceGrpc.getSetStockMethod) == null) {
          InventoryServiceGrpc.getSetStockMethod = getSetStockMethod =
              io.grpc.MethodDescriptor.<com.store.inventory.grpc.SetStockRequest, com.store.inventory.grpc.SetStockResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SetStock"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.SetStockRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.SetStockResponse.getDefaultInstance()))
              .setSchemaDescriptor(new InventoryServiceMethodDescriptorSupplier("SetStock"))
              .build();
        }
      }
    }
    return getSetStockMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.store.inventory.grpc.ReserveStockRequest,
      com.store.inventory.grpc.ReserveStockResponse> getReserveStockMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReserveStock",
      requestType = com.store.inventory.grpc.ReserveStockRequest.class,
      responseType = com.store.inventory.grpc.ReserveStockResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.store.inventory.grpc.ReserveStockRequest,
      com.store.inventory.grpc.ReserveStockResponse> getReserveStockMethod() {
    io.grpc.MethodDescriptor<com.store.inventory.grpc.ReserveStockRequest, com.store.inventory.grpc.ReserveStockResponse> getReserveStockMethod;
    if ((getReserveStockMethod = InventoryServiceGrpc.getReserveStockMethod) == null) {
      synchronized (InventoryServiceGrpc.class) {
        if ((getReserveStockMethod = InventoryServiceGrpc.getReserveStockMethod) == null) {
          InventoryServiceGrpc.getReserveStockMethod = getReserveStockMethod =
              io.grpc.MethodDescriptor.<com.store.inventory.grpc.ReserveStockRequest, com.store.inventory.grpc.ReserveStockResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReserveStock"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.ReserveStockRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.ReserveStockResponse.getDefaultInstance()))
              .setSchemaDescriptor(new InventoryServiceMethodDescriptorSupplier("ReserveStock"))
              .build();
        }
      }
    }
    return getReserveStockMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.store.inventory.grpc.ReleaseStockRequest,
      com.store.inventory.grpc.ReleaseStockResponse> getReleaseStockMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReleaseStock",
      requestType = com.store.inventory.grpc.ReleaseStockRequest.class,
      responseType = com.store.inventory.grpc.ReleaseStockResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.store.inventory.grpc.ReleaseStockRequest,
      com.store.inventory.grpc.ReleaseStockResponse> getReleaseStockMethod() {
    io.grpc.MethodDescriptor<com.store.inventory.grpc.ReleaseStockRequest, com.store.inventory.grpc.ReleaseStockResponse> getReleaseStockMethod;
    if ((getReleaseStockMethod = InventoryServiceGrpc.getReleaseStockMethod) == null) {
      synchronized (InventoryServiceGrpc.class) {
        if ((getReleaseStockMethod = InventoryServiceGrpc.getReleaseStockMethod) == null) {
          InventoryServiceGrpc.getReleaseStockMethod = getReleaseStockMethod =
              io.grpc.MethodDescriptor.<com.store.inventory.grpc.ReleaseStockRequest, com.store.inventory.grpc.ReleaseStockResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReleaseStock"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.ReleaseStockRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.store.inventory.grpc.ReleaseStockResponse.getDefaultInstance()))
              .setSchemaDescriptor(new InventoryServiceMethodDescriptorSupplier("ReleaseStock"))
              .build();
        }
      }
    }
    return getReleaseStockMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static InventoryServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<InventoryServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<InventoryServiceStub>() {
        @java.lang.Override
        public InventoryServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new InventoryServiceStub(channel, callOptions);
        }
      };
    return InventoryServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static InventoryServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<InventoryServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<InventoryServiceBlockingStub>() {
        @java.lang.Override
        public InventoryServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new InventoryServiceBlockingStub(channel, callOptions);
        }
      };
    return InventoryServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static InventoryServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<InventoryServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<InventoryServiceFutureStub>() {
        @java.lang.Override
        public InventoryServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new InventoryServiceFutureStub(channel, callOptions);
        }
      };
    return InventoryServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     */
    default void getStock(com.store.inventory.grpc.GetStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.GetStockResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetStockMethod(), responseObserver);
    }

    /**
     */
    default void setStock(com.store.inventory.grpc.SetStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.SetStockResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSetStockMethod(), responseObserver);
    }

    /**
     */
    default void reserveStock(com.store.inventory.grpc.ReserveStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReserveStockResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReserveStockMethod(), responseObserver);
    }

    /**
     */
    default void releaseStock(com.store.inventory.grpc.ReleaseStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReleaseStockResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReleaseStockMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service InventoryService.
   */
  public static abstract class InventoryServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return InventoryServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service InventoryService.
   */
  public static final class InventoryServiceStub
      extends io.grpc.stub.AbstractAsyncStub<InventoryServiceStub> {
    private InventoryServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected InventoryServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new InventoryServiceStub(channel, callOptions);
    }

    /**
     */
    public void getStock(com.store.inventory.grpc.GetStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.GetStockResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetStockMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void setStock(com.store.inventory.grpc.SetStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.SetStockResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSetStockMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void reserveStock(com.store.inventory.grpc.ReserveStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReserveStockResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReserveStockMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void releaseStock(com.store.inventory.grpc.ReleaseStockRequest request,
        io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReleaseStockResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReleaseStockMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service InventoryService.
   */
  public static final class InventoryServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<InventoryServiceBlockingStub> {
    private InventoryServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected InventoryServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new InventoryServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.store.inventory.grpc.GetStockResponse getStock(com.store.inventory.grpc.GetStockRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetStockMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.store.inventory.grpc.SetStockResponse setStock(com.store.inventory.grpc.SetStockRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetStockMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.store.inventory.grpc.ReserveStockResponse reserveStock(com.store.inventory.grpc.ReserveStockRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReserveStockMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.store.inventory.grpc.ReleaseStockResponse releaseStock(com.store.inventory.grpc.ReleaseStockRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReleaseStockMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service InventoryService.
   */
  public static final class InventoryServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<InventoryServiceFutureStub> {
    private InventoryServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected InventoryServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new InventoryServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.store.inventory.grpc.GetStockResponse> getStock(
        com.store.inventory.grpc.GetStockRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetStockMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.store.inventory.grpc.SetStockResponse> setStock(
        com.store.inventory.grpc.SetStockRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSetStockMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.store.inventory.grpc.ReserveStockResponse> reserveStock(
        com.store.inventory.grpc.ReserveStockRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReserveStockMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.store.inventory.grpc.ReleaseStockResponse> releaseStock(
        com.store.inventory.grpc.ReleaseStockRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReleaseStockMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_STOCK = 0;
  private static final int METHODID_SET_STOCK = 1;
  private static final int METHODID_RESERVE_STOCK = 2;
  private static final int METHODID_RELEASE_STOCK = 3;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_GET_STOCK:
          serviceImpl.getStock((com.store.inventory.grpc.GetStockRequest) request,
              (io.grpc.stub.StreamObserver<com.store.inventory.grpc.GetStockResponse>) responseObserver);
          break;
        case METHODID_SET_STOCK:
          serviceImpl.setStock((com.store.inventory.grpc.SetStockRequest) request,
              (io.grpc.stub.StreamObserver<com.store.inventory.grpc.SetStockResponse>) responseObserver);
          break;
        case METHODID_RESERVE_STOCK:
          serviceImpl.reserveStock((com.store.inventory.grpc.ReserveStockRequest) request,
              (io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReserveStockResponse>) responseObserver);
          break;
        case METHODID_RELEASE_STOCK:
          serviceImpl.releaseStock((com.store.inventory.grpc.ReleaseStockRequest) request,
              (io.grpc.stub.StreamObserver<com.store.inventory.grpc.ReleaseStockResponse>) responseObserver);
          break;
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getGetStockMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.store.inventory.grpc.GetStockRequest,
              com.store.inventory.grpc.GetStockResponse>(
                service, METHODID_GET_STOCK)))
        .addMethod(
          getSetStockMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.store.inventory.grpc.SetStockRequest,
              com.store.inventory.grpc.SetStockResponse>(
                service, METHODID_SET_STOCK)))
        .addMethod(
          getReserveStockMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.store.inventory.grpc.ReserveStockRequest,
              com.store.inventory.grpc.ReserveStockResponse>(
                service, METHODID_RESERVE_STOCK)))
        .addMethod(
          getReleaseStockMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.store.inventory.grpc.ReleaseStockRequest,
              com.store.inventory.grpc.ReleaseStockResponse>(
                service, METHODID_RELEASE_STOCK)))
        .build();
  }

  private static abstract class InventoryServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    InventoryServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.store.inventory.grpc.Inventory.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("InventoryService");
    }
  }

  private static final class InventoryServiceFileDescriptorSupplier
      extends InventoryServiceBaseDescriptorSupplier {
    InventoryServiceFileDescriptorSupplier() {}
  }

  private static final class InventoryServiceMethodDescriptorSupplier
      extends InventoryServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    InventoryServiceMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (InventoryServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new InventoryServiceFileDescriptorSupplier())
              .addMethod(getGetStockMethod())
              .addMethod(getSetStockMethod())
              .addMethod(getReserveStockMethod())
              .addMethod(getReleaseStockMethod())
              .build();
        }
      }
    }
    return result;
  }
}
