# Аксесуари: фаза 2C

Ручні повні та Rule rebuild додають DB job до черги. Magento cron отримує один job
під Accessories lock і запускає виконання FULL, RULE або PRODUCT. Active keys
усувають дублювання queued/running work; terminal history зберігається 90 днів,
а stale running jobs втрачають чинність через одну годину. Automatic invalidation
відкладено до фази 2D.
