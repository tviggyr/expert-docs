# Аксесуари: черга ручної переіндексації

Поточний механізм описано в розділах [38–40 основного гайда](accessories-guide.md#38).

Full Reindex, Rule Reindex і Source Category Reindex додають записи до `expert_accessory_reindex_job`; Magento cron обробляє їх під Accessories lock. Active key запобігає дублюванню queued/running робіт, а журнал зберігає стан, метрики та помилку job.

Це власний механізм Expert_Accessories. Стандартний Magento indexer не є заміною Full Reindex Accessories.
