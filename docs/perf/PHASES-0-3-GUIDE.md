# دليل مراحل تجهيز وقياس الأداء (0–3)

هذا الدليل يوثق ما نُفّذ حتى المرحلة 3، ويفصل بين:

- الأوامر التي تُنفّذ مرة واحدة لتجهيز البيانات أو تغيير قاعدة البيانات.
- أوامر قياس latency التي يجب تشغيلها على بيئة هادئة.
- الأمر الخفيف الوحيد المقصود تشغيله بالتوازي مع k6: مراقب الموارد.

التقرير الرقمي الأساسي موجود في [docs/PERFORMANCE.md](../PERFORMANCE.md). الأدلة الخام تبقى في `results/`. لا تُشغّل reset أو `docker compose down -v` لاتباع هذا الدليل.

## شكل البيئة

الاختبار يقيس NestJS REST API على PostgreSQL، ويستدعي خدمة المخزون Spring Boot عبر gRPC. تتضمن Compose performance override حدود throttling أعلى للاختبار فقط، وتطفئ cache وRead Replica وETag حتى لا تتغير المقارنة عن مرحلة لأخرى.

عناوين Compose المستخدمة في كل الأوامر:

```powershell
$compose = @('-f', '.\docker-compose.yml', '-f', '.\docker-compose.perf.yml')
```

شغّل الأوامر من جذر المشروع `D:\e-commerce_platform` في PowerShell. إذا كانت قاعدة البيانات والحاويات مجهزة مسبقًا، لا تعِد seed البيانات.

## المرحلة 0 — مراجعة خط الأساس

### ما تم

- فُحص المشروع واختباراته وحدود الخدمات قبل إدخال تغييرات الأداء.
- لم يُعدّل كود المشروع في هذه المرحلة.
- حُددت حدود النظام المؤثرة على القياس: أربعة Prisma schemas (`users`, `products`, `orders`, `notifications`)، وخدمة مخزون مستقلة مع PostgreSQL خاص بها.
- استُخدمت فحوصات الاختبارات وحدود الخدمات كخط أساس قبل تغييرات seed وقياس الأداء.

### النتيجة

المرحلة تجهيز وتحقيق من دون تغيير سلوك التطبيق. لا يوجد dataset أداء قبل المرحلة 1، لذلك لا تُعتبر نتائج هذه المرحلة baseline k6.

الفحوصات المسجلة للخط الأساس شملت `npm test` (4 suites و9 tests) وفحص حدود الخدمات؛ نجحا بعد توليد Prisma clients.

## المرحلة 1 — بيانات الأداء وتهيئة المخزون

### الملفات والتغييرات

- [scripts/seed-perf.ts](../../scripts/seed-perf.ts): seed قابل لإعادة التشغيل بمعرّفات حتمية، وإدخال بيانات Prisma على دفعات بدل استعلام لكل سجل. يحسب التقرير النهائي أعداد الصفوف وأحجام الجداول في `results/perf-seed.json`.
- [proto/inventory.proto](../../proto/inventory.proto): إضافة RPC جديد `SetStocks` لتحديد كمية مجموعة منتجات.
- [InventoryGrpcService.java](../../inventory-service/src/main/java/com/store/inventory/grpc/InventoryGrpcService.java): إضافة handler لـ`SetStocks` والتحقق من نتيجة خدمة المخزون.
- [InventoryService.java](../../inventory-service/src/main/java/com/store/inventory/service/InventoryService.java): تنفيذ تحديث جماعي للمنتجات، مع رفض الكميات السالبة، والدفعة الفارغة كعملية بلا تغييرات، وحدّ أقصى 1,000 معرّف فريد في الطلب.
- [docker-compose.yml](../../docker-compose.yml) و[package.json](../../package.json): إضافة خدمة وأوامر تشغيل seed الأداء.
- [README.md](../../README.md): شرح dataset والأوامر والبيانات التجريبية.

`SetStocks` إضافة مستقلة؛ لم تغيّر تعريف أو سلوك أي RPC قديم (`GetStock`, `SetStock`, `ReserveStock`, `ReleaseStock`).

اجتاز كود NestJS لاختبارات Jest المسجلة في المشروع، بما فيها اختبارات adapter المخزون وسلوك إنشاء الطلب. كما نُفّذ `SetStocks` عبر RPC أثناء seed وأعاد تحديث 20,000 stock. ملاحظة الدقة: بناء صورة خدمة Java استخدم `-DskipTests`، ولا يوجد مجلد `inventory-service/src/test` في هذا المستودع؛ لذلك لا نصف ذلك البناء بأنه تشغيل لاختبارات Java.

### بيانات seed النهائية

النتيجة المحفوظة في [perf-seed.json](../../results/perf-seed.json):

| النوع | العدد |
|---|---:|
| مستخدمو الأداء | 5,000 |
| المنتجات | 20,000 |
| الطلبات | 300,000 |
| بنود الطلبات | 900,000 |
| المنتجات المهيأ مخزونها | 20,000 |
| المستخدمون ذوو الحمل الأعلى | 20 |

توزعت 60,000 طلب على المستخدمين ذوي الحمل الأعلى؛ حصل كل واحد منهم على نحو 3,000 طلب. استغرق seed الكامل **670.48 ثانية**. هذا الزمن مقبول لأنه إعداد لمرة واحدة ولا يدخل ضمن مدة تشغيل k6. لا تُعد تشغيل seed بين baseline وما بعد الفهرس.

### أوامر المرحلة 1

الأوامر التالية توثيق لما يلزم فقط عند إنشاء بيئة جديدة؛ ليست جزءًا من اختبار latency ولا يلزم تشغيلها الآن:

```powershell
docker compose up --build -d
docker compose --profile perf run --build --rm perf-seed
```

الأول قد يبني ويبدأ الخدمات؛ الثاني يبني صورة seed ويضيف dataset كبيرًا وقد يستغرق وقتًا طويلًا. لا تشغلهما بالتوازي مع k6، ولا تشغّل `seed:perf:reset` أو أي أمر يحذف/يعيد إنشاء البيانات أثناء المقارنة.

## المرحلة 2 — k6 وBaseline

### ما تم تجهيزه

- [docker-compose.perf.yml](../../docker-compose.perf.yml): يرفع throttling لبيئة الاختبار، ويعطّل seed عند بدء backend وcache وRead Replica وETag. عدّاد Prisma مطفأ افتراضيًا.
- [k6/all.js](../../k6/all.js): سيناريو موحّد بأربعة سيناريوهات متزامنة مستقلة:
  - `GET /products`
  - `GET /products/:id`
  - `GET /orders`
  - `POST /orders`
- كل سيناريو يحمل tag باسم endpoint، ويجمع المدة، الفشل، عدد الطلبات والبيانات المستلمة. المراحل نفسها تصل إجمالًا إلى 100 VU: 40 للمنتجات و20 لكل سيناريو آخر. مجموع الـstages أربع دقائق؛ تستغرق العملية الكاملة نحو 4:15 مع تسجيل الدخول في `setup`.
- وضع `K6_QUERY_COUNT=true` منفصل: VU واحد يتنقل بين endpoints لمدة دقيقة؛ لا يستخدم في قياس latency.
- [request-query-counter.ts](../../src/common/perf/request-query-counter.ts) وربطه في middleware وخدمات Prisma الأربع: عدّ عمليات Prisma ضمن سياق طلب HTTP عندما يُفعّل العلم صراحة.
- [monitor-perf.ps1](../../scripts/monitor-perf.ps1): يسجّل Docker stats واتصالات `pg_stat_activity` كل 5 ثوانٍ، ويجمع سجلات عداد Prisma إن كان مفعّلًا. يرفض الكتابة فوق ملفات موجودة.
- [compare-results.js](../../scripts/compare-results.js): يحسب وسيط ثلاث تشغيلات baseline ويطبع جدول المقارنة.
- [query-counts.md](./query-counts.md): يوثق العينة وحدود دقة عدّ العمليات.

### إعداد قبل latency

1. تأكد أن Docker Desktop يعمل وأن قاعدة البيانات والـbackend وخدمة المخزون سليمة.
2. استخدم Compose performance override في كل أوامر الخدمة وk6.
3. تأكد أن `PERF_QUERY_COUNT_ENABLED=false` في تشغيل backend. إذا غيّرت العلم، أعد إنشاء backend قبل القياس، ثم افحص health. لا تعِد إنشاء الخدمات بعد بدء المراقب.
4. لا تشغّل seed أو build أو migration أو benchmark آخر بالتوازي.
5. نفّذ `ANALYZE VERBOSE` مرة قبل baseline، واحفظه. عند المقارنة بعد الفهارس نفّذ `ANALYZE` بعد migration وقبل `EXPLAIN` أو k6، وليس أثناء القياس.

فحص Compose والـhealth خفيف:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml config --quiet
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml ps
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/v1/health
```

إذا كانت هناك حاجة إلى ANALYZE لقياس جديد، نفّذه قبل الاختبار فقط:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml exec -T db psql -U postgres -d ecommerce_db -v ON_ERROR_STOP=1 -c "ANALYZE VERBOSE;" 2>&1 | Tee-Object -FilePath .\results\analyze-baseline.txt
if ($LASTEXITCODE -ne 0) { throw "ANALYZE failed with exit code $LASTEXITCODE." }
```

هذا الأمر يفحص إحصاءات PostgreSQL لكل الجداول ولا يُشغّل أثناء k6. لا تستبدل ملف evidence موجود عند إعادة القياس؛ استخدم اسمًا جديدًا مثل `analyze-baseline-rerun.txt`.

### تشغيلة العدّاد المنفصلة

العينة النهائية الموثقة: دقيقة واحدة، VU واحد، 706 طلبات ناجحة. متوسط عمليات Prisma المسجلة: المنتجات 2، تفاصيل المنتج 1، الطلبات 2، إنشاء الطلب 1. هي **عمليات Prisma في سياق HTTP** وليست عدد SQL statements المؤكد؛ الطلبات الداخلية تظهر كسياقات منفصلة.

إذا لزم تكرار العينة، فعّل العلم عند إنشاء backend وعند تشغيل k6، ثم أطفئه وأعد إنشاء backend قبل أي latency:

```powershell
$env:PERF_QUERY_COUNT_ENABLED = 'true'
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml up -d --force-recreate backend
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml run --rm --no-deps k6 run -e K6_QUERY_COUNT=true --summary-export=/results/query-count-rerun.json /scripts/all.js
$env:PERF_QUERY_COUNT_ENABLED = 'false'
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml up -d --force-recreate backend
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/v1/health
```

هذه ليست خطوة في تشغيلات latency. لا تترك العداد مفعّلًا فيها.

### خطوات latency ونافذتا PowerShell

**المسموح بالتوازي أثناء كل تشغيل k6 فقط:**

- **النافذة الأولى:** مراقب الموارد؛ يقرأ `docker stats` و`pg_stat_activity` كل 5 ثوانٍ.
- **النافذة الثانية:** أمر k6 الواحد الجاري.

شغّل المراقب أولًا باسم جديد، ثم ابدأ k6 مباشرةً في النافذة الثانية:

```powershell
.\scripts\monitor-perf.ps1 -Label baseline-rerun-1 -DurationSeconds 330 -IntervalSeconds 5
```

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml run --rm --no-deps k6 run --summary-export=/results/baseline-rerun-1.json /scripts/all.js
```

كرر بالتتابع، مع label واسم summary جديدين لكل تشغيل (`baseline-rerun-2`, `baseline-rerun-3`). لا تبدأ التشغيل التالي قبل انتهاء k6 والمراقب. مدة المراقب 330 ثانية لتغطي إعداد جلسات المستخدمين والتشغيل البالغ نحو 4:15. الملفات الناتجة:

- `results/baseline-rerun-N.json`
- `results/baseline-rerun-N-docker-stats.csv`
- `results/baseline-rerun-N-db-connections.csv`
- `results/baseline-rerun-N-query-counts.log` (يكون فارغًا/بلا سجلات مفيدة عندما العداد مطفأ)

بعد اكتمال ثلاث تشغيلات جديدة، يمكن تجميعها بأمر محلي خفيف:

```powershell
node .\scripts\compare-results.js --aggregate .\results\baseline-rerun-1.json .\results\baseline-rerun-2.json .\results\baseline-rerun-3.json --output .\results\baseline-rerun.json
```

والـcomparison مع قياس ما بعد الفهرس:

```powershell
node .\scripts\compare-results.js .\results\baseline-rerun.json .\results\after-db-rerun.json
```

k6 قد يخرج بالرمز `99` عند تجاوز threshold؛ هذا لا يعني أن summary مفقود. احتفظ بملف JSON وافحص المقاييس. لا تُخفِ التشغيلات الشاذة باستخدام الوسيط وحده.

### نتائج baseline المسجلة

وسيط ثلاث تشغيلات: p50 **248.13 ms**، p95 **1,061.46 ms**، p99 **3,150.80 ms**، throughput **136.179 req/s**، وأخطاء **0.006%**. التشغيل الأول كان outlier بأخطاء 7.228%؛ التشغيلان التاليان كانا 0.006% و0.003%. لم يظهر 429 في backend logs التي فُحصت. تفاصيل الأرقام ونتائج كل endpoint في [docs/PERFORMANCE.md](../PERFORMANCE.md).

سيناريو `POST /orders` ينشئ طلبات حقيقية في dataset؛ حساب الكتابة منفصل، لكن بياناته تتغير بين التشغيلات. لا تُشغّل reset بين التشغيلات.

## المرحلة 3 — تدقيق DB وفهرس عناصر الطلب

### التدقيق والاستنتاج

- `OrdersService.list` يطلب صفحة الطلبات باستخدام `findMany(include: { items: true })`، ومعه `count`. لم يظهر N+1 في حلقة التطبيق؛ عدد عمليات Prisma في العينة 2 للطلب.
- خطة صفحة الطلبات استفادت أصلًا من `orders_userId_createdAt_idx`.
- خطة تحميل العناصر المرتبطة بالصفحة لم تكن تملك index على `order_items.orderId`، فاختارت `Seq Scan` لمسح نحو 902,603 صفًا واستغرقت 216.038 ms.
- أُضيف `@@index([orderId])` إلى [orders schema](../../prisma/orders/schema.prisma) وmigration جديدة [migration.sql](../../prisma/orders/migrations/20261112000000_add_order_items_order_id_idx/migration.sql).
- المستخدم طبّق migration، وأعاد ANALYZE، ثم سجّل خطة ما بعد الفهرس وk6. خطة `Index Scan` على `order_items_orderId_idx` أخذت 0.796 ms في عينة EXPLAIN.

لا تُطبّق migration مرة أخرى إن كانت مطبقة. لا تشغّل migration أو ANALYZE أو EXPLAIN أثناء k6.

### نتيجة k6 بعد الفهرس

الملف [after-db.json](../../results/after-db.json) يحوي تشغيلًا واحدًا: 53,674 طلبًا، 220.584 req/s، p50 149.86 ms، p95 523.34 ms، p99 1,924.06 ms، وفشل واحد (0.0019%). هذا مؤشر مقارنة أولي مقابل وسيط ثلاثة baseline runs، وليس مقارنة بثلاث تشغيلات متساوية. p95 لـ`POST /orders` بقي 3,091.93 ms، وp99 لتفاصيل المنتج 912.44 ms.

ملفات `after-db-docker-stats.csv` و`after-db-db-connections.csv` التي كانت موجودة وقت مراجعة النتيجة لم تتزامن مع تشغيل k6 النهائي؛ انتهى تسجيلها قبل ذلك التشغيل، لذا حُذفت من `results/` كملفات قديمة مضللة. لا تستخدمها كدليل موارد لقياس ما بعد الفهرس. إذا كانت مراقبة الموارد ضرورية، أعد القياس فقط باستخدام label جديد وsummary جديد.

### إعادة قياس post-index عند الحاجة لمراقبة الموارد

لا تعِد migration. لا حاجة إلى reset أو seed. استخدم نافذتين كما في المرحلة 2:

```powershell
.\scripts\monitor-perf.ps1 -Label after-db-rerun -DurationSeconds 330 -IntervalSeconds 5
```

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml run --rm --no-deps k6 run --summary-export=/results/after-db-rerun.json /scripts/all.js
```

يحفظ هذا التشغيل نتائج جديدة دون استبدال الأدلة الموجودة. لا تشغّل أوامر أخرى ثقيلة إلى أن ينتهي k6 والمراقب.

## ما يُشغّل بجانب k6 وما لا يُشغّل

### المسموح

- الخدمات المطلوبة القائمة: backend، PostgreSQL الأساسي، inventory service، inventory PostgreSQL.
- k6 واحد فقط.
- `monitor-perf.ps1` واحد في نافذة أخرى؛ هذا هو الحمل الإضافي المقصود والموثق.
- التحقق من الملفات بعد اكتمال التشغيل، لا خلاله.

### غير المسموح أثناء القياس

- `docker compose up --build` أو Docker build أو `npm run build`.
- seed أو reset أو إصلاح dataset.
- migration أو `ANALYZE` أو `EXPLAIN`.
- تشغيل k6 آخر، query-count run، tests، أو أي benchmark متزامن.
- إعادة إنشاء backend/الحاويات أو تعديل متغيرات Compose أثناء المراقبة.
- استخدام الـAPI يدويًا، فتح حمل من الواجهة، أو تشغيل عمليات DB ثقيلة من نافذة أخرى.
- `docker compose down -v`؛ هذا يحذف volumes والبيانات ويُبطل المقارنة.

إن كان المقصود تشغيل الاختبار بحضور المعيد، فلا يحتاج المعيد إلى تشغيل workload إضافي: جهّزوا النتائج مسبقًا، واتركوا نافذتي المراقبة وk6 فقط تعملان خلال فترة القياس.

## الملفات النهائية التي يجب الاحتفاظ بها

- `results/perf-seed.json`
- `results/baseline-code-state.txt`
- `results/analyze-baseline.txt` و`results/analyze-after-db.txt`
- `results/baseline-warmup.json`
- `results/baseline-run-1.json` حتى `baseline-run-3.json` و`results/baseline.json`
- ملفات Docker stats وDB connections لتشغيلات baseline الثلاثة
- `results/query-count-sample-final.json` و`results/query-count-sample-final-query-counts.log` وملفا مراقبتها
- `results/after-db-warmup.json` و`results/after-db.json`
- `docs/perf/explain-before.txt` و`docs/perf/explain-after.txt`

المحاولات التشخيصية الفاشلة والملفات التي سبقت تشغيل post-index النهائي ليست مصادر نتائج معتمدة؛ لا تخلطها مع العناصر أعلاه عند تحليل أو عرض الأداء.
