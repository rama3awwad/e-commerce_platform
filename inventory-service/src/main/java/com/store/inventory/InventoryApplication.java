package com.store.inventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * نقطة الدخول لتطبيق خدمة المخزون.
 *
 * المتطلب الثاني - التواصل بين الخدمات:
 *   - تطبيق NestJS الأساسي يتواصل مع هذه الخدمة عبر gRPC فقط.
 *   - قاعدة البيانات خاصة بالخدمة ولا يشاركها أحد.
 *   - العقد المشترك هو ملف proto/inventory.proto.
 */
@SpringBootApplication
public class InventoryApplication {

    public static void main(String[] args) {
        SpringApplication.run(InventoryApplication.class, args);
    }
}
