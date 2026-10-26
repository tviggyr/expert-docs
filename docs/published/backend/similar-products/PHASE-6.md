# PHASE 6 — Runtime Rotation «Схожі товари»

Rotation змінює runtime presentation уже побудованого списку Similar Products.
Вона не перераховує similarity та не змінює persistent index.

Базовий score і TOP 30 формує [PHASE-3.md](PHASE-3.md#_5);
ця фаза додає лише runtime salable-first, rotation і `LIMIT 8`.

## Межа persistent index

`expert_similar_product_index` лишається детермінованим TOP 30 для кожного
source product:

```text
base_score DESC
→ similar_product_id ASC
→ rank 1..30
```

Rotation не змінює `base_score`, `rank`, schema, reader або writer. Вона не
створює dirty marker, не запускає category rebuild чи Magento indexer, не пише
стан у БД та не додає cron job.

Weekly full reconciliation — окремий safety path persistent index: він запускає
full indexer щонеділі о 03:00 у Magento configured timezone. Rotation не
залежить від цього schedule.

## Configuration

Magento Admin Configuration має default scope only; website і store-view
overrides недоступні.

| Path | Default | Meaning |
|---|---:|---|
| `expert_similar_products/rotation/enabled` | `0` | Enables runtime rotation. |
| `expert_similar_products/rotation/period_days` | `2` | Calendar-day duration of one deterministic bucket. |
| `expert_similar_products/rotation/protected_candidates` | `3` | Head candidates retained in base similarity order. |
| `expert_similar_products/rotation/pool_size` | `12` | Maximum candidates considered per availability group. |

`period_days` is a runtime bucket length, not a cron expression. Valid values
are `1..30`; protected candidates are `0..7`; pool size is `8..30`; protected
candidates must be smaller than the pool. Invalid direct/deployment config
fails safe by disabling rotation and retaining stable rank output.

The display limit remains 8 and persistent index limit remains 30. Neither is a
merchandising configuration setting.

## Runtime pipeline

```text
TOP30 index candidates
→ one ProductLoader collection for the union of candidate IDs
→ one MSI batch salability map
→ per source stable salable / non-salable partition
→ independent deterministic rotation inside each group
→ rotated salable + rotated non-salable
→ LIMIT 8
```

Rotation runs fully in memory after MSI classification. The provider reads its
typed configuration once per batch invocation; no index reads, product
collections, MSI calls or random SQL are added per source.

## Relevance and salability

Within each salability group, persistent similarity order is retained for the
protected head. Rotation considers only the first pool-size candidates in that
group. Its remaining tail is a deterministic cyclic window keyed by source
product ID and global time bucket. Candidates deeper than the pool do not jump
ahead of the relevance-protected pool.

Salability has absolute priority. Rotation applies separately to salable and
non-salable groups, then concatenates them. Five salable candidates therefore
occupy the first five of eight display slots; non-salable candidates can only
fill the remaining three. When at least eight salable candidates are available,
no non-salable candidate is displayed.

With rotation disabled, output remains the previous stable behavior:

```text
stable salable
→ stable non-salable
→ LIMIT 8
```

## Determinism, time and cacheability

The bucket is derived from the current date in Magento configured timezone and
the configured calendar-day period. The seed uses only:

```text
source_product_id + global_time_bucket
```

It does not include store ID, request, visitor, customer or session state, and
does not use random-number generators. For the same source, bucket,
configuration, index and salability state, single PDP calls and batch Cart calls
return the same ordered candidates independently of input source-ID order or
ProductLoader result order.

PDP remains SSR/cacheable. Rotation does not make the page or block uncacheable,
does not add AJAX or private content, and does not flush FPC at bucket changes.
An existing FPC entry can therefore remain visible until its usual invalidation
or expiration after a bucket boundary.
