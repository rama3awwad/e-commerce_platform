# syntax=docker/dockerfile:1.7

# ============================================================
#  Stage 1: Build (Maven + JDK)
# ============================================================
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

# انسخ pom.xml أولاً (للاستفادة من Docker layer caching)
COPY pom.xml .
# انسخ ملف proto المشترك
COPY ../proto /build/proto

# حمّل الـdependencies فقط (إذا لم يتغير pom.xml، هذه الطبقة تُخزَّن)
RUN mvn dependency:go-offline -B || true

# انسخ باقي المصادر
COPY src ./src

# بناء المشروع (تخطَّى الاختبارات)
RUN mvn clean package -DskipTests -B

# ============================================================
#  Stage 2: Runtime (JRE فقط)
# ============================================================
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S spring && adduser -S spring -G spring
WORKDIR /app

COPY --from=builder --chown=spring:spring /build/target/inventory-service-*.jar app.jar

USER spring
EXPOSE 9090 8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -q -O- http://127.0.0.1:8081/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
