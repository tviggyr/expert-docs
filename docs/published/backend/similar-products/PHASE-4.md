# PHASE 4 — постійний індекс схожих товарів

PHASE 4 зберігає базовий результат Similar Products у таблиці
`expert_similar_product_index`. Вона не змінює правила PHASE 1–3, компаратори,
ваги або формулу score.

## Постійний індекс і межа перебудови

`expert_similar_product_index` містить такі поля:

- `product_id` — source product;
- `similar_product_id` — кандидат;
- `base_score` — нормалізований базовий score;
- `rank` — позиція кандидата.

Первинний ключ — `(product_id, similar_product_id)`, а унікальний ключ
`(product_id, rank)` не допускає дублів у списку одного source. Для source
зберігається лише TOP 30 у порядку `base_score DESC, similar_product_id ASC`.

Category є атомарною одиницею перебудови. Rebuild один раз отримує effective
rules для category, один раз будує pool eligible products і одним EAV-запитом
завантажує потрібні значення для всього pool. `SimilarityScorerInterface`
порівнює вже завантажені значення в пам’яті: запитів БД на пару
source/candidate немає. Для кожного source заміна індексних рядків є атомарною:
коротка транзакція видаляє його старі рядки та пакетно вставляє нові.

Формула `base_score` і порядок TOP 30 визначені у
[PHASE-3.md](PHASE-3.md#як-формується-пріоритет-схожих-товарів). PHASE 4 лише
зберігає цей базовий результат; salable-first, rotation і display limit є
runtime boundary з PHASE 6.

Інваріант category для source product:

- 0 categories — порожній результат;
- 1 category — звичайне ранжування;
- більше ніж 1 category — виняток.

## Dirty categories та інкрементальна перебудова

`expert_similar_product_dirty_category` має один рядок на category. Поле
`marked_at` одночасно є dirty timestamp, heartbeat останньої релевантної зміни
та optimistic version marker-а.

`mark()` / `markMany()` використовують upsert: repeated mark не створює другу
row, а оновлює `marked_at`. Quiet period у 15 хвилин працює як debounce для
масових product/category змін: category перебудовується лише після того, як
релевантні зміни припинилися.

Processor запускається cron job-ом кожні п’ять хвилин. Він бере один спільний
Magento lock на весь batch і обробляє до 10 найстаріших category, що були quiet
щонайменше 15 хвилин. Bounded batch не дає одному cron run безмежно обробляти
чергу, але після масової синхронізації не залишає її з обробкою лише однієї
category кожні п’ять хвилин.

Перед rebuild processor зберігає snapshot `marked_at`. Після успіху
`removeIfUnchanged(categoryId, snapshot)` видаляє marker лише за незміненої
версії. Якщо під час rebuild стався concurrent re-mark, новіший marker
залишається для наступного quiet-period run. За помилки rebuild marker також
залишається для наступної спроби; помилка однієї category не зупиняє обробку
інших category у тому самому batch. Cache invalidation та journal entry для
кожної фактично обробленої category виконуються через існуючі rebuild механізми.

Інкрементальний шлях має вигляд:

`lifecycle hooks → dirty category → 15-minute quiet period → cron every 5 minutes → up to 10 oldest eligible categories → one shared lock → rebuild each category → removeIfUnchanged(snapshot)`.

Це не Magento MView update by schedule.

## Product lifecycle та інвалідація

`ProductRepository` має invalidation detector. Він порівнює лише status,
visibility та атрибути з effective Similar rules із збереженим EAV станом у
store scope `0`. Це покриває REST і `ProductInterface`: explicit clear через
`custom_attributes` з `value = null` є зміною значення.

Для атрибута, що входить до effective rules, контракт такий:

| Перехід | Dirty |
|---|---|
| `NULL → value` | так |
| `A → B` | так |
| `value → absent` | так |
| `NULL → NULL` | ні |

Зміни `status` та `visibility` також позначають category dirty. Нерелевантні
атрибути не позначають індекс. Bulk `Product\Action::updateAttributes()`
використовує той самий фільтр changed attribute codes.

Призначення товару в category проходить через
`CategoryLinkRepository` / `CategoryLinkManagement` path і позначає category.
Перед product delete observer знімає snapshot колишніх categories; після
успішного delete вони позначаються dirty.

Price, `special_price`, Expert24/RRP pricing inputs і bonus не інвалідовують
base index. У цій інсталяції `price`, `special_price` і `bonus_percent` не є
доступними Similar attributes, а Expert24/RRP pricing inputs не є product EAV
rules. Stock, MSI, qty, salability та rotation також не інвалідовують base
index.

Зміна Category Rule позначає лише цю category. Save або delete Global Rule
лише зберігає конфігурацію: він не позначає всі populated categories dirty і
не запускає global rebuild автоматично.

## Ручні та reconciliation paths

CLI команда:

```text
expert:similar-products:reindex-category <category_id>
```

Вона перевіряє category, бере той самий shared lock, викликає той самий
`CategorySimilarityRebuilderInterface`, обходить quiet period і працює лише з
обраною category. Marker cleanup виконується через snapshot та
`removeIfUnchanged`.

Admin actions **«Перебудувати індекс»** для Global Rules і category є POST
actions з `form_key`. Вони швидко створюють async reindex job і повертають
admin response; cron під shared lock виконує відповідно full rebuild або
rebuild однієї category. Manual category job має snapshot-safe cleanup через
`removeIfUnchanged`, а manual global job очищає лише dirty markers, що існували
до його snapshot.

`expert_similar_product_reindex_job` є одночасно чергою manual jobs і журналом
фактичних rebuild: manual global/category, dirty category та weekly global.
Admin journal показує останні 100 записів. Terminal jobs зі статусом
`completed` або `failed` і `finished_at` старше 90 днів видаляє окремий daily
cron; `queued` і `running` jobs retention cleanup не зачіпає.

Щотижневий reconciliation cron запускається щонеділі о 03:00 у timezone,
налаштованому в Magento, та записує global weekly entry у reindex journal.
Він перевіряє 15-minute quiet guard, бере shared lock та без shell-out запускає
Magento full indexer action. Він не має path, що blind truncate dirty table:
нові marker-и, створені під час full rebuild, не видаляються цим flow.

Magento full rebuild виконується indexer-ом:

```text
expert_similar_products
```

Він перебудовує populated categories та очищає лише індексні source rows для
товарів без category. Він не є інкрементальним processor-ом і не очищає dirty
table blind truncate-ом.

`mview.xml` містить лише framework registration compatibility view з
`Magento\Framework\Indexer\Action\Dummy`. Subscriptions відсутні: їх кількість
дорівнює 0. MView не є джерелом інвалідації або rebuild.

## Межі та поточний результат

Перенесення category у дереві є рідкісним випадком, а не blocker PHASE 4.
Manual та weekly full rebuild слугують safety reconciliation для такого стану.

PHASE 4 не реалізує frontend/PDP runtime, runtime price або stock ranking, MSI
sorting чи rotation. Ці можливості не слід вважати реалізованими лише тому, що
існує базовий index.

Після фінального full reindex поточний результат:

- 101 992 index rows;
- максимум 30 rows на source;
- full reindex приблизно 16 секунд.
