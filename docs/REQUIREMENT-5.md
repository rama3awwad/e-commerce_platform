# المتطلب الخامس: التوسع وتوزيع الأحمال

## البنية

```text
الواجهة (localhost:3000) → Nginx lb → backend-1 / backend-2 / backend-3
                                      ↓ Redis + PostgreSQL + خدمات التطبيق
                                   RabbitMQ ← worker-1 / worker-2 / worker-3
```

يستخدم Nginx سياسة `least_conn` لأن كلفة الطلبات ومدتها تختلف، فتذهب الطلبات الجديدة إلى النسخة الأقل اتصالات نشطة. لا نستخدم `ip_hash`: زبائن خلف NAT قد يثقلون نسخة واحدة، وسقوط النسخة ينقل زبائنها دفعة واحدة، كما يخفي مشاكل الحالة المحلية. النسخ stateless.

## مشاكل النسخ المتعددة وإصلاحها

| المشكلة | لماذا تفشل مع 3 نسخ | الإصلاح |
|---|---|---|
| كاش JWT المحلي | كل نسخة قد ترى بيانات مستخدم قديمة مختلفة | Redis مع إبطال المفتاح عند تعديل/حذف المستخدم |
| عدّاد rate limit المحلي | يمكن لكل نسخة السماح بالحد كاملاً | تخزين throttler ذري مشترك في Redis، مع fail-open عند تعذره |
| عنوان العميل خلف Nginx | التطبيق يرى عنوان Nginx فتتشارك الطلبات حدّاً واحداً | تمرير X-Forwarded-For وضبط TRUST_PROXY_HOPS |
| تضاعف outbox relay | كل backend ينشر الوظائف القديمة نفسها | قفل صفوف PostgreSQL بـ FOR UPDATE SKIP LOCKED داخل transaction |
| إيميل مكرر عند التزامن | check-then-act يسمح لنسختين بإرسال الوظيفة نفسها | قفل صف الوظيفة ومعالجتها داخل transaction، وprefetch=1 |
| عدّ محاولات الدخول غير ذري | قراءتان ثم كتابتان قد تسقطان زيادة | Prisma atomic increment ثم قفل عند بلوغ الحد |
| migrate/seed المتسابقان | كل نسخة قد تشغل الترحيل أو seed عند الإقلاع | خدمة migrate واحدة تسبق النسخ والـworkers |
| رفع الصور | ملف محلي في نسخة لا تراه النسخ الأخرى | مجلد uploads مشترك؛ وعلى أكثر من جهاز يلزم S3/MinIO |
| إيقاف الحاوية بدون graceful shutdown | قد تنقطع الاتصالات أو تبقى الأعمال الجارية | shutdown hooks وDocker ينتظر الإنهاء قبل الإيقاف القسري |

## التشغيل والإثبات

شغّل البيئة مع حد throttling واسع للاختبار:

```sh
THROTTLE_LIMIT=100000 docker compose up --build -d
docker compose ps
node scripts/req5-proof.js
node scripts/req5-proof.js --stop backend-2 --stop-after 150
```

يعرض السكربت توزيع X-Instance-Id ورموز HTTP وزمن الاستجابة، ويحفظ التفاصيل في `results/req5-proof.json`. يمكن تمرير `--total` و`--concurrency` و`--orders` لإنشاء طلبات فعلية. لاختبار استمرار workers، أنشئ طلبات ثم أوقف worker-1 وworker-2؛ يستمر worker-3 باستهلاك الطابور. افحص email_jobs للتأكد من حالة SENT.

الضمان عملياً at-least-once: إذا انهارت الحاوية بعد إرسال الإيميل وقبل commit قاعدة البيانات، فقد يُعاد إرسال إيميل واحد عند إعادة التسليم.
