# PHASE 5 — Runtime PDP «Схожі товари»

## 5A: SSR selection

PDP не перераховує similarity. `SimilarProductRuntimeProvider` читає не більше 30
рядків persistent індексу `expert_similar_product_index` для поточного товару,
відкидає source product і передає candidate IDs у один batch loader.

`ProductLoader::getSalableProductsByIds()` застосовує current-store, enabled,
catalog-visible та MSI-aware in-stock collection filter. Storefront plugin Magento
додає один stock-index join для current website; runtime не викликає
salability API для кожного SKU. Порядок IDs після collection load відновлюється за
persistent rank. Показується максимум вісім salable products; порожній результат
не рендерить PDP section.

`base_score` і `rank` не змінюються. Stock, price та runtime selection не ставлять
dirty marker і не запускають Similar Products reindex. Rotation не входить до 5A.

## Rendering і cache

`pdp.similar` є SSR/cacheable block з module-owned template
`Expert_SimilarProducts::product/similar.phtml`. Він використовує існуючий Hyvä
`ProductListItem` → `Magento_Catalog::product/list/item.phtml` rendering path, а не
окрему Similar card. PDP layout додає стандартний `catalog_list_item` handle, який
реєструє renderer. Block identities містять source product і фактично показані
candidate products. JavaScript лише ініціалізує наявний Swiper з UI Kit owner.
