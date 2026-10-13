# Аксесуари: фаза 2D

## Фаза 2D-A: dirty revisions

Виробники catalog invalidation позначають unit `rule` або `product` у
`expert_accessory_reindex_dirty`. Кожна позначка атомарно збільшує його revision.
Marker навмисно не залежить від reindex job journal.

Dirty dispatcher очікує 60-секундний quiet period, після чого створює наявний
automatic RULE або PRODUCT job із зафіксованим `dirty_revision`. Job зберігає
звичайний `active_key`, тому queued або running work не дублюється. Marker під
час dispatch ніколи не видаляється.

Після успішного automatic job його revision підтверджується лише тоді, коли dirty
row усе ще має саме цей revision. Пізніша позначка зберігає row, а dispatcher
створює наступний job. Failed і manual jobs не підтверджують dirty state.
Automatic failures відкладаються на 15 хвилин перед наступною спробою dispatch.

Фаза 2D-B1 додає лише invalidation для product-save та bulk-update. Invalidators
для category-link, delete й option-label залишаються відкладеними.

## Фаза 2D-B1: атрибути товару та eligibility

Збереження через ProductRepository і bulk attribute updates через Product Action
визначають affected enabled calculated Rules за поточними categories товару.
Зміни релевантного source-attribute або eligibility позначають product; зміни
релевантного target-attribute або eligibility позначають affected Rules. Вони лише
позначають pipeline фази 2D-A і ніколи не додають rebuild jobs безпосередньо.

Зміни category assignment, видалення товару, option labels і stock/MSI
залишаються поза межами цієї фази.

### Джерело синхронізації товарів

Поточний Proxy `MagentoProductSyncService` спочатку синхронізує category
dependency, а потім його `MagentoProductPayloadBuilder` додає
`extension_attributes.category_links` до звичайного product payload. Для нових
товарів використовується `POST /V1/products`; для наявних SKU —
`PUT /V1/products/{sku}`. Отже, category membership зберігається в межах
ProductRepository save boundary, яку використовує B1. Окремі category moves і
видалення товару залишаються роботою фази 2D-B2.

### Майбутня bulk synchronization

Поточний Proxy flow виконує один REST product request на create або update.
Майбутній performance pass для catalog на 50–65k додасть або використає batched
product creation та updates, щоб зменшити кількість HTTP round trips і зберегти
цей contract: batch impact analysis створює PRODUCT dirty units і coalesced RULE
dirty units, після чого наявний dispatcher фази 2D-A планує rebuilds. Він не має
створювати один RULE rebuild job на кожен змінений target product. Це майбутня
робота; bulk API або transport тут не обрано й не реалізовано.

## Фаза 2D-B2: category membership і видалення товару

Мутації category membership порівнюють persisted old і new category IDs. Додавання,
видалення або переміщення source-category позначає affected Product як dirty;
зміни target-category позначають union affected old і new Rules як dirty.
Незмінений membership і зміни лише position не позначають dirty units.

Видалення Product покладається на index foreign-key cascades для видалення source
rows. Для видаленого Product не створюється PRODUCT dirty unit. Його попередня
роль у target category позначає affected Rules як dirty, щоб їх TOP-N candidates
могли поповнитися.

## Фаза 2D-C: option labels

`Magento\Catalog\Model\Product\Attribute\OptionManagement` порівнює persisted
store-0 option label до й після update. Змінений store-0 label позначає кожне
enabled compatibility Rule з `match` condition, що використовує цей attribute,
незалежно від того, чи це source або target attribute. Rule IDs визначаються один
раз і позначаються по одному разу; Product loop або rebuild job не створюється.

Store-view-only label update залишає persisted store-0 value без змін і не
позначає Rule. Preference Rules використовують option IDs, а numeric conditions
не використовують option labels, тому зміни labels attributes, які застосовують
лише такі Rules, нічого не позначають. Attribute без enabled compatibility/match
Rule відхиляється до читання option labels.

Той самий catalog option service обробляє додавання та видалення product attribute
options. Успішне add або delete для релевантного compatibility/match attribute
позначає його affected Rules як dirty; failed update, add або delete нічого не
позначає.

Фаза 2D-C охоплює дві технічні точки mutation option:
`OptionManagement::{add,update,delete}` і Product Attribute Repository
`save()`. Підтримуваний production flow для attribute definitions і options:
Proxy → Magento REST Product Attribute API → `AttributeRepository::save()`.
Magento перетворює submitted option objects в attribute option payload і
зберігає його через attribute resource без виклику `OptionManagement`. Тому
Repository hook зберігає snapshot persisted store-0 option map для релевантних
Rules перед успішним save та порівнює його після нього.

Лише змінена store-0 map позначає кожне affected compatibility/match Rule один
раз. Незмінені store-0 labels, store-view-only labels, preference Rules, numeric
conditions, нерелевантні attributes і failed saves не позначають Rules. Зміни
attribute metadata не позначають Rules, коли option map не змінилася. Пряме
редагування Product Attribute у Magento Admin не є підтримуваним project workflow;
definitions і options мають надходити через Proxy/REST, тому окремий
Admin/resource-model invalidation path навмисно не додано.

## Фаза 2D-D: життєвий цикл Rule та manual reindex

## Умови calculated Rule

Calculated Accessories Rule має дві незалежні ролі conditions. Рядки `filter` —
це обов'язкові compatibility checks: кожен рядок має збігтися, тому разом вони
утворюють AND filter для target candidates. Рядки `priority` виконуються лише
після цього filter і застосовують наявний normalized weighted preference score.
Priority miss додає нульовий score; він ніколи не виключає сумісний product.

Нові combined Rules зберігають `mode=compatibility` і persist роль рядка в
`expert_accessory_rule_condition.condition_role`. Наявні compatibility rows за
замовчуванням мають `filter`. Наявні Rules з `mode=preference` залишаються
підтримуваними та читаються як `priority` rows задля сумісності з їхнім
історичним contract.

Admin Rule form показує compatibility filters та optional priorities в одному
Rule і не показує legacy mode selector. Отже, нові Admin calculated Rules
зберігають canonical `compatibility` mode, тоді як наявний `preference` mode
залишається внутрішньою backward-compatible detail. Rule уже безпосередньо
пов'язане зі своєю source-category і target-category pair; окремий Selective
Rules selection layer не використовується.

`Спільний атрибут` — це attribute-to-attribute match з однаковим attribute ID з
обох боків. Він persist `source_attribute_id == target_attribute_id`,
`comparison_type=match` і `NULL` comparator. Він не надає fixed literal value
condition. Numeric filter comparators зберігають persisted values `eq`, `lte`
та `gte`, тоді як Admin показує `=`, `≤` і `≥`.

Rule без conditions залишається Direct Rule. Зміни Rule semantics, зокрема ролі
condition, і надалі очищують `last_indexed_at` та вимагають manual rebuild;
збереження ніколи не запускає rebuild automatically.

## Відображення Category Assignment

Rules володіють compatibility, priority та indexed candidates. Окремий Category
Assignment володіє storefront presentation для однієї source-category і
target-category pair: enabled state, tab position і optional store-aware tab
labels. Admin form одночасно показує UA (`default`) і RU (`ru`) labels без store
switcher. Порожній custom label замінюється target category name у поточному
store; label іншої мови ніколи не використовується як fallback.

Зміни Assignment є presentation-only: вони не позначають Rules як dirty, не
очищують index і не запитують rebuild. Assignment, вимкнений для pair, прибирає
цю category group до presentation PDP і checkout Top. Наявні Rules без
Assignment залишаються enabled із legacy Rule position та category name.

Редагування Rule і condition ніколи не створюють automatic dirty units або jobs.
Semantic change очищує `last_indexed_at`, тому Admin показує
`Потрібна переіндексація`, доки manager не почне manual Rule rebuild. Positions
Rule і condition не змінюють stored product-accessory rows та зберігають
поточний index state.

Вимкнення calculated Rule або видалення його останньої condition одразу очищує
його persisted rows та `last_indexed_at`. Видалення Rule покладається на
foreign-key cascade від Rule до index. Наявний automatic dirty state видаляється
під час semantic lifecycle mutation. Поки `last_indexed_at` дорівнює null,
automatic Rule dispatch пригнічується; manual rebuild залишається дозволеним.

Rule rebuild і Rule lifecycle mutation використовують спільний Rule-level lock.
Це не дозволяє queued або running automatic rebuild записати rows для старого
definition після edit, disable або calculated-to-direct transition.

## Фаза 2D-E: видалені product attributes і Rule integrity

Видалення product attribute перехоплюється у
`Magento\Catalog\Model\Product\Attribute\Repository::delete()`, що також
охоплює `deleteById()`. До видалення EAV attribute через Magento Accessories
зберігає snapshot кожної affected Rule condition. Лише після успішного repository
deletion, включно з condition foreign-key cascade, кожне affected Rule
позначається `broken`, вимикається, а його persistent index та
`last_indexed_at` очищуються. Cleanup видаляє старий Rule dirty state і ніколи
не позначає та не додає automatic work у чергу.

`expert_accessory_rule_integrity_issue` зберігає deleted attribute ID, code,
label, source/target side і affected condition metadata. Це зберігає diagnostic
після того, як condition row видалено EAV foreign-key cascade. Admin Rule edit і
detail views показують, що Rule потребує налаштування, та перелічують deleted
attributes.

Broken Rule залишається disabled, доки manager не відновить кожне missing
condition reference через звичайну Rule form. Повне відновлення очищує issues та
повертає Rule у `valid`, але не вмикає його automatically і все одно вимагає
manual Rule rebuild. Повторне створення EAV attribute з тим самим attribute code
не відновлює Rule: збережений diagnostic identity — це deleted EAV attribute ID,
тому manager має явно вибрати replacement.

Attribute-delete cleanup і Rule rebuild використовують наявний per-Rule rebuild
lock. Тому rebuild, що вже виконувався, не може залишити old index rows після
завершення broken-state cleanup.

## Фільтрація товарів, яких немає в наявності, під час індексації

Глобальне налаштування `expert_accessories/index/exclude_out_of_stock` з label
`Виключати товари не в наявності під час індексації` за замовчуванням вимкнене.
Коли воно вимкнене, stock status не впливає на persistent Accessories index.
Коли увімкнене, calculated compatibility і preference Rule rebuilds
використовують Magento MSI website stock для поточного website як source of truth
та виключають non-salable target products до candidate lookup, scoring і
остаточного `index_limit`. Salability lookup виконується batch за SKU; products
окремо не завантажуються. `expert_store_availability` не використовується для
цього global stock decision.

Це index-time snapshot. Product, який став out of stock після rebuild, може
залишатися у persistent index до наступного rebuild, оскільки storefront
Accessories block і його runtime stock policy відкладено. Direct Rules не мають
persistent product-product index і не змінюються; їх runtime stock policy буде
реалізовано разом із цією storefront work.

Зміна налаштування не створює dirty marker або job і не перебудовує index
автоматично. Після зміни manager має вручну запустити full Accessories reindex.

## Інтеграція storefront PDP

`Expert_Accessories::product/accessories.phtml` — SSR PDP template для
`PdpAccessories`. Його `AccessoryGroupProvider` визначає enabled, valid Rules
для source-category membership поточного product і створює одну tab для кожної
target category. Calculated Rules читають persistent product index; Direct Rules
читають target category membership. Groups використовують найменшу Rule position,
детерміновано merge та deduplicate product IDs і застосовують `display_limit`
окремо до кожної tab. Tab label — це target Category name у поточному store.

Provider bulk-loads product models для наявного Hyvä `product_list_item` renderer.
Empty groups приховують і section, і його PDP navigation link. Поточний product,
target categories та повернені products формують block cache identities. Runtime
stock filtering навмисно відсутня: ця версія показує calculated index snapshot і
Direct category products без додаткового storefront MSI decision.

Theme UI Kit Accessories section залишається лише fixture. Майбутній Assignment
entity може стати джерелом storefront labels і positions для source-category до
target-category relationship без зміни production template group contract.

## Групи відображення PDP

`expert_accessories/storefront/show_top` і
`expert_accessories/storefront/show_categories` обидва за замовчуванням
увімкнені. Вони керують лише presentation: зміна будь-якого налаштування не
створює dirty marker, job або rebuild і застосовується в наступному storefront
request після відповідного cache refresh.

Коли увімкнено, `Топ` — це virtual runtime group, а не Rule, category або
persistent index. Він round-robins уже впорядковані category groups, зберігає
перше входження duplicate products і зупиняється на наявному `display_limit`.
Category groups залишаються source для `Топ`, навіть коли category tabs
приховані. Є чотири combinations: Top плюс categories, лише Top, лише categories
або відсутня PDP Accessories section, коли обидва налаштування вимкнені.

`Топ` використовує ті самі products, що й category groups, включно з їхнім
поточним index-time stock snapshot. Runtime storefront stock filtering
залишається майбутньою роботою.

## Accessories Top у checkout

`accessory_products` в обох Checkout REST projections — це те саме virtual
Accessories `Топ` data source, що використовується storefront groups: batch
request спочатку визначає category groups через `AccessoryGroupProvider`, після
чого `TopGroupBuilder` виконує round-robin і deduplicate уже впорядкованих
products до `display_limit`. `CartAccessoryProductsProjector` серіалізує ці
product models через наявний `SimilarProductRecommendationSerializer`; fixture
recommendations не використовуються.

Checkout не використовує PDP-only налаштування `show_top` і `show_categories`.
Cart та item projections використовують один projector, тому item має однаковий
Accessories result в обох REST endpoints. Empty Top results — це `[]`. Це й
надалі використовує наявний index-time stock snapshot і не додає runtime stock
filter.
