# Expert Similar Products — PHASE 1: конфігурація правил

`Expert_SimilarProducts` — окремий домен Magento для налаштування схожих товарів. Він не використовує Related Products, Up-sell, Cross-sell або `catalog_product_link`.

PHASE 1 зберігає та надає конфігурацію правил. Відбір кандидатів і розрахунок схожості описані в [PHASE-3.md](PHASE-3.md), а робота в Magento Admin — у [PHASE-2.md](PHASE-2.md).

## Що налаштовується

Правило визначає, **яку** характеристику товару порівнювати та **як** її порівнювати. Воно не зберігає конкретне значення товару.

Кожне правило має:

- `attribute_code` і внутрішній `attribute_id` Magento EAV;
- `importance`: `high`, `normal` або `low`;
- `comparator`: `exact`, `proximity` або `intersection`;
- `tolerance_percent` лише для `proximity`;
- `position` для стабільного порядку.

`high`, `normal`, `low`, `exact`, `proximity` та `intersection` — англійські
domain/API-значення. Саме вони зберігаються в persistence і передаються через
API. Magento Admin показує українські labels: `high` — **Висока**, `normal` —
**Звичайна**, `low` — **Низька**; `exact` — **Точний збіг**, `proximity` —
**Близькість**, `intersection` — **Перетин значень**.

`position` не є вагою характеристики. Внутрішні ваги `high`, `normal`, `low` та формула score описані в PHASE 3.

## Глобальні правила

Глобальні правила зберігаються в `expert_similar_global_attribute_rule`. Вони застосовуються в усіх категоріях, якщо категорія не має власного стану для цієї характеристики.

Після встановлення модуля правил немає: наприклад, правило для бренду не створюється автоматично.

Приклад рекомендованого глобального правила:

```text
Бренд
importance = normal («Звичайна»)
comparator = exact («Точний збіг»)
position = 10
```

`normal` означає звичайний вплив бренду на підсумкову схожість. Інший бренд не виключає товар з кандидатів: він лише не отримує бал за цей критерій.

Для одного `attribute_id` можна створити лише одне глобальне правило. Видалення глобального правила виконується атомарно: відповідні рядки категорій зі станом `disabled` видаляються, а категорійні `override` зберігаються як самостійні правила категорії.

## Правила категорії та ефективна конфігурація

Правила категорії зберігаються в `expert_similar_category_attribute_rule`. Для глобального правила можливі три стани:

| Стан у Magento Admin | Збережений стан | Результат |
|---|---|---|
| Успадкувати | рядок категорії відсутній | Працює глобальне правило |
| Перевизначити | `mode = override` | Правило категорії замінює глобальне |
| Вимкнути | `mode = disabled` | Глобальне правило не бере участі для категорії |

Окремий рядок зі станом `inherit` не зберігається. Видалення рядка категорії відновлює успадкування, якщо глобальне правило існує.

Категорія також може додати власну характеристику, якої немає серед глобальних правил. Технічно це `mode = override`, але для менеджера це правило категорії.

`EffectiveRuleResolverInterface` є єдиним джерелом ефективної конфігурації: він поєднує глобальні правила, категорійні `override` і `disabled`. Інші компоненти не повторюють цю логіку.

## Доступні характеристики та Attribute Set

`AvailableAttributeProviderInterface` будує список для конкретної категорії так:

```text
Категорія
  ↓
товари категорії
  ↓
усі різні attribute_set_id
  ↓
об’єднання придатних характеристик цих Attribute Sets
  ↓
список для вибору правила
```

Attribute Set — лише фільтр зручності для UI та API. Він:

- не є Similar rule;
- не додає вагу;
- не бере участі в score;
- не обмежує набір кандидатів.

Якщо в категорії є товари з кількох Attribute Sets, сервіс повертає об’єднання характеристик і `attribute_set_ids` для кожної з них. Для порожньої категорії список порожній, але CRUD правил все одно може працювати з явно переданим валідним атрибутом товару каталогу.

## Придатність характеристик

Перевірка виконується централізовано через `AttributeEligibility`. Характеристика має бути користувацьким атрибутом для `catalog_product` і мати підтримуваний тип.

| Тип характеристики | Підтримувані comparator |
|---|---|
| `select`, `boolean` | `exact` |
| `multiselect` | `intersection` |
| Числовий `text` з `backend_type = int` або `decimal` | `exact`, `proximity` |
| Користувацький числовий `price` з `backend_type = int` або `decimal` | `exact`, `proximity` |
| Нормалізований текстовий `text` з `backend_type = varchar` | `exact` |

`frontend_input = price` сам по собі не означає системну ціну. Наприклад, користувацька характеристика «Максимальне завантаження, кг» може мати `backend_type = decimal` і `frontend_input = price`; вона придатна для `exact` і `proximity`.

Системний `price` є спеціальним дозволеним винятком і підтримує `exact` та `proximity`. Системні `special_price` і `cost` залишаються виключеними. Також не пропонуються непридатні візуальні або системні атрибути, зокрема `status`, `visibility`, медіа, `description`, `short_description`, дати та поля `textarea`.

Для `proximity` `tolerance_percent` обов’язковий і має відповідати `0 < tolerance_percent <= 100`. Для інших comparator він має бути `null`.

## REST Management API та доступ

REST API захищено Magento ACL. `Expert_SimilarProducts::global_rules` керує глобальними правилами, а `Expert_SimilarProducts::category_rules` — правилами категорій, ефективними правилами та доступними характеристиками.

```text
GET|POST    /V1/expert-similar-products/global/attribute-rules
GET|PUT|DELETE
            /V1/expert-similar-products/global/attribute-rules/:ruleId
GET|POST    /V1/expert-similar-products/categories/:categoryId/attribute-rules
GET|PUT|DELETE
            /V1/expert-similar-products/categories/:categoryId/attribute-rules/:ruleId
GET         /V1/expert-similar-products/categories/:categoryId/effective-rules
GET         /V1/expert-similar-products/categories/:categoryId/available-attributes
```

Усі публічні вхідні DTO використовують `attribute_code`; сховище зберігає `attribute_id`. Label, `frontend_input` і `backend_type` отримуються з метаданих Magento EAV, а не дублюються в таблицях правил.

## Перевірки

PHASE 1 має модульні та інтеграційні тести для CRUD, валідації comparator і `tolerance_percent`, успадкування, `override`, `disabled`, ефективні правила, очищення під час видалення глобального правила та сервісу Attribute Set.

## Що не реалізовано в PHASE 1

PHASE 1 не створює індекс, Magento Indexer, відбір кандидатів, розрахунок score, ранжування за ціною або наявністю, rotation, PDP block, API вітрини, інтеграцію з кошиком, Proxy, Filter Settings чи Accessories.
