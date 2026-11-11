# المرحلة 4 — Read Replica

## الحالة

جهز الكود وملفات Compose والمراقبة والاختبارات. إنشاء PostgreSQL standby وقياس k6 يجب أن تنفذهما يدويًا؛ لم أشغّل Docker أو أنشئ replica أو أبدأ قياسًا ثقيلًا. تبقى نتائج المرحلة غير مكتملة حتى يتوفر `results/after-replica-run-1.json` إلى `results/after-replica-run-3.json` وملفات lag المتزامنة.

هذا إعداد تطوير/أداء محلي، وليس إعداد نشر production. يستخدم physical streaming replication لنفس PostgreSQL cluster الذي يحتوي schemas التطبيق الأربع.

## التغييرات المنفذة

- [docker-compose.replica.yml](./../../docker-compose.replica.yml): إعداد WAL على الـprimary، وإضافة `read-replica` اختياريًا ضمن profile اسمه `replica`. لا يبدأ الـstandby تلقائيًا مع compose العادي.
- [pg_hba.conf](./../../docker/postgres/pg_hba.conf): السماح باتصالات التطبيق المصادق عليها وreplication user على شبكة Compose.
- [replication-role.sql](./../../scripts/replication-role.sql): إنشاء/تحديث role محدود بصلاحية `LOGIN REPLICATION`، وكلمة مروره تُمرر وقت التشغيل ولا تُحفظ في الملف.
- [postgres-replica-entrypoint.sh](./../../scripts/postgres-replica-entrypoint.sh): تنفيذ `pg_basebackup` أول مرة، وكتابة إعداد reconnect للـstandby، ثم تشغيل PostgreSQL بوضع hot standby. يرفض الكتابة فوق مجلد replica غير فارغ بلا `PG_VERSION`.
- [docker-compose.perf.yml](./../../docker-compose.perf.yml): `PERF_READ_REPLICA_ENABLED` يحدد هل يفتح backend اتصالات القراءة على الـstandby؛ يبقى الافتراضي `false`.
- [ProductsPrismaService](../../src/products/prisma/products-prisma.service.ts) و[OrdersPrismaService](../../src/orders/prisma/orders-prisma.service.ts): إنشاء Prisma read client اختياري، الاتصال به عند التفعيل، والتحقق أثناء startup من أن السيرفر في recovery فعلًا. يبقى الـprimary مخصصًا للكتابة.
- [ProductsService](../../src/products/products.service.ts): توجيه قوائم المنتجات وتفاصيل المنتج للـread client. ردود الإنشاء/التعديل/تغيير المخزون وقراءات التحقق المرتبطة بهذه الكتابات تستخدم الـprimary حتى لا تعيد بيانات قديمة.
- [OrdersService](../../src/orders/orders.service.ts): توجيه قائمة الطلبات وتفاصيل الطلب للـread client؛ إنشاء الطلب وتغيير حالته والمعاملات تبقى على الـprimary.
- [ProductsController](../../src/products/products.controller.ts): قراءة صورة المنتج السابقة من الـprimary قبل تحديث ملف الصورة، لتجنب الاعتماد على نسخة standby قديمة.
- [monitor-perf.ps1](../../scripts/monitor-perf.ps1): `-IncludeReadReplica` يضيف حاوية replica ويسجل replication state وwrite/flush/replay lag وفرق WAL بالبايت كل 5 ثوانٍ.
- [check-read-replica.ps1](../../scripts/check-read-replica.ps1): فحص أن السيرفر standby نشط، وأن primary يراه، ثم كتابة probe بسيطة على primary وانتظار ظهورها على replica مع تسجيل زمن الانتشار في `results/`.
- [products.service.spec.ts](../../src/products/products.service.spec.ts) و[orders.service.spec.ts](../../src/orders/orders.service.spec.ts): اختبارات تثبت أن قوائم القراءة تستخدم read client وأن رد إنشاء المنتج بعد الكتابة يُقرأ من الـprimary.
- [.env.example](../../.env.example): خانة فارغة لكلمة مرور replication المحلية. ضع قيمة محلية في `.env` فقط، ولا تحفظ كلمة المرور في Git أو ترسلها في المحادثة.

**اتساق البيانات:** replication غير متزامن؛ لذلك يمكن أن تتأخر قراءة GET مستقلة بعد كتابة ناجحة. استجابة mutation نفسها، وقراءات ما بعد الكتابة داخل كود mutation، تستخدم الـprimary. يقوم `check-read-replica.ps1` بقياس زمن ظهور كتابة primary على standby بدل افتراض أنها فورية. إذا تعطل الـreplica بعد بدء التطبيق، تفشل قراءات replica بوضوح؛ لا يوجد fallback صامت إلى primary حتى لا يخفي القياس توجيهًا غير صحيح.

**نطاق التوجيه:** عمليات REST الخارجية للمنتجات والطلبات تستخدم read client في GET. عمليات `POST/PATCH/DELETE` وطلبات `/internal/*` وبيانات المستخدمين والمخزون والإشعارات تظل على مساراتها الأصلية؛ لم تتغير عقود API.

## التحقق الخفيف المنفذ

- `npx tsc --noEmit`: نجح.
- اختبارات `products.service.spec.ts` و`orders.service.spec.ts`: نجح **10/10**.
- `docker compose ... config --quiet` مع الملفات الثلاثة: نجح (قيمة كلمة المرور كانت شكلية للتحقق فقط ولم تُحفظ).
- تحليل صياغة `monitor-perf.ps1` و`check-read-replica.ps1`: نجح.
- `git diff --check`: نجح.

لم يُشغّل `docker compose up` أو `pg_basebackup` أو seed أو k6 أو أي عملية قاعدة بيانات ثقيلة.

## تجهيز كلمة المرور

أضف كلمة مرور محلية طويلة إلى `.env`:

```dotenv
PERF_REPLICATION_PASSWORD=<كلمة-مرور-محلية-عشوائية>
```

لا تضع القيمة الفعلية في هذا الملف أو Git، ولا ترسلها إليّ. إذا استخدمت متغير PowerShell بدل `.env`، عيّنه في **كل نافذة PowerShell** ستشغّل فيها Compose:

```powershell
$env:PERF_REPLICATION_PASSWORD = '<كلمة-مرور-محلية-عشوائية>'
```

المتغير مستخدم في role إعداد replication فقط. صيغة الاتصال داخل backend تستخدم بيانات اعتماد DB الحالية التي يقرأها Compose من `.env`.

## خطوات التنفيذ والقياس

لا تشغّل المراحل التالية بالتوازي مع k6. يُسمح أثناء كل k6 بوجود نافذتين فقط: أمر k6 الواحد، ومراقب الموارد الواحد.

### 1. إعداد الـprimary وفحص الإعداد

في نافذة PowerShell واحدة، من جذر المشروع:

```powershell
$env:PERF_READ_REPLICA_ENABLED = 'false'
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml --profile replica config --quiet
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml build backend
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml up -d
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml exec -T db psql -U postgres -d ecommerce_db -c "SHOW wal_level; SHOW max_wal_senders; SHOW wal_keep_size;"
```

نفّذ `build backend` مرة واحدة لأن صورة backend يجب أن تحتوي تغييرات المرحلة الرابعة؛ هذا build ثقيل وأنت من تشغّله. `up -d` قد يعيد تشغيل الـprimary لتفعيل WAL/HBA؛ لا يحذف volume ولا يعيد seed. المتوقع `wal_level=replica` و`max_wal_senders=10`. لا تكمل إن فشل health check أو ظهرت قيمة WAL مختلفة.

### 2. إنشاء role وقياس control قبل توجيه القراءات

أنشئ role replication على الـprimary. يأخذ الأمر كلمة المرور من إعداد Compose إلى متغير مؤقت ولا يطبعها:

```powershell
$replicaConfig = docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml --profile replica config --format json | ConvertFrom-Json
$replicaPassword = $replicaConfig.services.'read-replica'.environment.PERF_REPLICATION_PASSWORD
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "replication_password=$replicaPassword" -f /scripts/replication-role.sql
Remove-Variable replicaPassword, replicaConfig
```

قبل control، وحّد إحصاءات كل جداول schemas التطبيق الأربعة في قاعدة `ecommerce_db` واحفظ الخرج باسم جديد:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml exec -T db psql -U postgres -d ecommerce_db -v ON_ERROR_STOP=1 -c "ANALYZE VERBOSE;" 2>&1 | Tee-Object -FilePath .\results\analyze-before-replica.txt
if ($LASTEXITCODE -ne 0) { throw "ANALYZE failed with exit code $LASTEXITCODE." }
```

نفّذ warm-up 30 ثانية والـreplica معطل. هذا control خاص بالمرحلة 4 ويستخدم WAL config نفسه الذي سيستخدمه قياس ما بعد replica:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run -e K6_WARMUP=true --summary-export=/results/before-replica-warmup.json /scripts/all.js
```

ثم لكل تشغيل من 1 إلى 3: ابدأ مراقبًا بوسم فريد في نافذة ثانية، وبعده مباشرة شغّل أمر k6 المقابل في النافذة الأولى. لا تبدأ تشغيلًا قبل انتهاء السابق والمراقب.

مراقب التشغيل الأول:

```powershell
.\scripts\monitor-perf.ps1 -Label before-replica-run-1 -DurationSeconds 270 -IntervalSeconds 5
```

تشغيل k6 الأول:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/before-replica-run-1.json /scripts/all.js
```

استخدم الأسماء `before-replica-run-2` و`before-replica-run-3` للوسم وملف JSON في التشغيلين التاليين. متوقع نحو 4:15 لكل تشغيل، إضافة إلى warm-up. ستُحفظ summaries وملفات Docker stats واتصالات DB في `results/`.

التشغيل الثاني:

نافذة المراقبة:

```powershell
.\scripts\monitor-perf.ps1 -Label before-replica-run-2 -DurationSeconds 270 -IntervalSeconds 5
```

نافذة k6:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/before-replica-run-2.json /scripts/all.js
```

التشغيل الثالث:

نافذة المراقبة:

```powershell
.\scripts\monitor-perf.ps1 -Label before-replica-run-3 -DurationSeconds 270 -IntervalSeconds 5
```

نافذة k6:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/before-replica-run-3.json /scripts/all.js
```

### 3. إنشاء physical standby والتحقق منه

بعد انتهاء تشغيلات control تمامًا:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml --profile replica up -d read-replica
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml --profile replica ps
$replicaId = docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml --profile replica ps -q read-replica
if (-not $replicaId) { throw "Read-replica container was not created." }
$deadline = (Get-Date).AddMinutes(45)
do {
  $health = docker inspect --format '{{.State.Health.Status}}' $replicaId
  if ($LASTEXITCODE -ne 0) { throw "Could not read replica container health." }
  if ($health -eq 'healthy') { break }
  if ($health -eq 'unhealthy') { throw "Read replica became unhealthy; stop and inspect its logs." }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if ($health -ne 'healthy') { throw "Read replica did not become healthy within 45 minutes." }
.\scripts\check-read-replica.ps1 -TimeoutSeconds 60
```

النسخة الأولية تنفذ `pg_basebackup` وقد تأخذ وقتًا حسب حجم قاعدة البيانات؛ انتظر health `healthy` وفحص probe الناجح. لا تشغّل seed أو build معها. سيُحفظ probe في ملف `results/read-replica-check-<UTC>.json`، وتُحذف صفوف الاختبار من primary بعد التحقق.

إذا فشل إنشاء standby لأن مجلد بيانات replica يحتوي ملفات ناقصة، **توقف ولا تحذف أي volume**؛ أرسل الخطأ أولًا. لا تستخدم `down -v`.

### 4. تفعيل التوجيه وقياس ما بعد replica

بعد نجاح فحص standby، أعد إنشاء backend فقط مع التوجيه مفعّلًا:

```powershell
$env:PERF_READ_REPLICA_ENABLED = 'true'
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml up -d --force-recreate backend
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/v1/health
```

نفّذ warm-up مرة واحدة:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run -e K6_WARMUP=true --summary-export=/results/after-replica-warmup.json /scripts/all.js
```

ثم شغّل ثلاثة اختبارات k6 متسلسلة، وكل مرة ابدأ المراقب في نافذة ثانية. مثال التشغيل الأول:

```powershell
.\scripts\monitor-perf.ps1 -Label after-replica-run-1 -DurationSeconds 270 -IntervalSeconds 5 -IncludeReadReplica
```

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/after-replica-run-1.json /scripts/all.js
```

كرر بالتتابع مع `after-replica-run-2` و`after-replica-run-3`. المراقب ينتج أيضًا `after-replica-run-N-replication-lag.csv` فيه replication state والـlag وفرق WAL كل خمس ثوانٍ. العداد `PRISMA_QUERY_COUNT_ENABLED` يبقى مطفأً في warm-up وتشغيلات latency.

التشغيل الثاني:

نافذة المراقبة:

```powershell
.\scripts\monitor-perf.ps1 -Label after-replica-run-2 -DurationSeconds 270 -IntervalSeconds 5 -IncludeReadReplica
```

نافذة k6:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/after-replica-run-2.json /scripts/all.js
```

التشغيل الثالث:

نافذة المراقبة:

```powershell
.\scripts\monitor-perf.ps1 -Label after-replica-run-3 -DurationSeconds 270 -IntervalSeconds 5 -IncludeReadReplica
```

نافذة k6:

```powershell
docker compose -f .\docker-compose.yml -f .\docker-compose.perf.yml -f .\docker-compose.replica.yml run --rm --no-deps k6 run --summary-export=/results/after-replica-run-3.json /scripts/all.js
```

سيناريو `POST /orders` يضيف طلبات حقيقية في كل تشغيل ولا تُعاد قاعدة البيانات إلى حالتها السابقة؛ هذا مطابق لسلوك قياسات الأداء السابقة، لكنه يعني أن صفوف الطلبات تزداد قليلًا بين control وreplica.

لا تشغّل أي build أو tests أو seed أو أوامر DB أو k6 إضافية حتى تنتهي التشغيلات الثلاث ومراقبتها. إذا خرج k6 بالرمز `99`، اترك summary موجودًا وأرسل «خلصت»؛ الرمز يعني عادةً تجاوز threshold وليس أن الملف مفقود.

## بعد أن ترسل «خلصت»

سأقرأ الملفات الجديدة، أتحقق من routing وlag وظهور probe بعد الكتابة ونسب الأخطاء/429، وأقارن وسيط التشغيلات الثلاث قبل وبعد replica. بعدها أملأ قسم Read Replica والجدول الرئيسي في [docs/PERFORMANCE.md](../PERFORMANCE.md) وأرسل تقرير المرحلة 4. لا تُعتبر نتائج المرحلة مقاسة قبل وصول summaries بعد replica وملفات lag.
