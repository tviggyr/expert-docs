# Аксесуари: automatic invalidation

Поточний контракт індексації описано в [розділах 38–40 основного гайда](accessories-guide.md#38-технічна-архітектура-індексу). Цей документ фіксує призначення dirty pipeline.

Catalog mutation не запускає важку перебудову синхронно. Інвалідація позначає dirty unit `rule` або `product` в `expert_accessory_reindex_dirty` і збільшує його revision. Після 60-секундного quiet period dispatcher створює automatic RULE або PRODUCT job із зафіксованим revision. Successful job підтверджує dirty state тільки коли revision не змінився; пізніша mutation залишає dirty row для наступного job. Failed automatic job повторюється не раніше ніж через 15 хвилин.

Підтримувані причини invalidation:

- semantic lifecycle rule, його conditions, source або target category;
- релевантні source/target attributes, status, visibility та website eligibility товару;
- category membership source або target товару, включно зі старим і новим membership;
- видалення товару (source rows прибирає foreign key, target role позначає affected rules);
- store-0 option labels, add/delete options для compatibility/match conditions.

Зміна лише category position не створює dirty unit. Зміна MSI availability не ставить automatic job: runtime завжди перевіряє поточну salability, а для очищення persistent index з увімкненим виключенням наявності потрібен ручний Full Reindex.

Direct Rules та calculated Rules використовують той самий pipeline і ту саму таблицю `expert_accessory_product_index`; Direct Rule не має окремого storefront category scan.
