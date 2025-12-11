# Response Comparison / Diff Feature

## Overview

Enable users to compare query results across multiple runs to detect changes, verify migrations, and debug data inconsistencies.

**Priority**: Medium  
**Estimated Complexity**: Medium-High  
**Dependencies**: Existing `QueryHistoryEntry`, `QueryResultSummary` infrastructure

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Query Page UI                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │  Run Query   │  │ Select Runs  │  │ Compare View │                   │
│  │              │──▶│  to Compare  │──▶│  (Diff UI)   │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ResultComparisonService                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   Load Run   │  │  Diff Engine │  │   Format     │                   │
│  │   Results    │  │  (row-level) │  │   Output     │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │              QueryResultHistory (localStorage)                    │   │
│  │   - Stored per saved query (savedQueryId)                        │   │
│  │   - Max N results per query (configurable, default 10)           │   │
│  │   - Full row data up to MAX_STORABLE_ROWS                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Extended Result Storage

```typescript
// src/concept/saved-query.ts (additions)

/**
 * Stored result for comparison. Contains full row data (not just samples)
 * up to storage limits.
 */
export interface StoredQueryResult {
    id: string;
    savedQueryId: string;
    executedAt: string;
    durationMs: number;
    status: "success" | "error";
    
    // Full result data (up to limit)
    columns: string[];
    rows: Record<string, string>[];  // Already stringified concept values
    totalRowCount: number;           // Original count before truncation
    truncated: boolean;              // True if rows were truncated for storage
    
    // Metadata for filtering/display
    connectionUrl: string | null;
    dbId: string | null;
    errorMessage?: string;
}

export interface QueryResultHistoryData {
    // Map of savedQueryId -> array of stored results (newest first)
    resultsByQuery: Record<string, StoredQueryResult[]>;
}

// Constants
export const MAX_RESULTS_PER_QUERY = 10;      // Keep last N results per saved query
export const MAX_STORABLE_ROWS = 500;         // Max rows to store (vs MAX_SAMPLE_ROWS = 20)
export const MAX_RESULT_HISTORY_SIZE = 100;   // Total results across all queries
```

### Diff Output Model

```typescript
// src/concept/result-diff.ts (new file)

export type RowDiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffedRow {
    status: RowDiffStatus;
    rowIndex: number;
    leftRow?: Record<string, string>;   // Original (baseline)
    rightRow?: Record<string, string>;  // Comparison
    changedColumns?: string[];          // Which columns differ (for "changed" status)
}

export interface ResultDiff {
    baselineId: string;
    comparisonId: string;
    baselineExecutedAt: string;
    comparisonExecutedAt: string;
    
    // Structural changes
    addedColumns: string[];
    removedColumns: string[];
    
    // Row differences
    rows: DiffedRow[];
    
    // Summary stats
    stats: {
        totalBaseline: number;
        totalComparison: number;
        added: number;
        removed: number;
        changed: number;
        unchanged: number;
    };
}

export interface DiffOptions {
    keyColumns?: string[];              // Columns to use as row identity (for matching)
    ignoreColumnOrder?: boolean;        // Treat column order differences as unchanged
    showUnchangedRows?: boolean;        // Include unchanged rows in output
}
```

---

## Diff Algorithm

### Row Matching Strategy

1. **Identity-based matching** (preferred): Use specified key columns to match rows
2. **Position-based matching** (fallback): Match rows by index when no keys specified
3. **Content-based matching**: For unkeyed data, use fuzzy matching on row content

```typescript
// Pseudocode for diff algorithm

function computeDiff(baseline: StoredQueryResult, comparison: StoredQueryResult, options: DiffOptions): ResultDiff {
    // 1. Detect column changes
    const addedColumns = comparison.columns.filter(c => !baseline.columns.includes(c));
    const removedColumns = baseline.columns.filter(c => !comparison.columns.includes(c));
    const commonColumns = baseline.columns.filter(c => comparison.columns.includes(c));
    
    // 2. Build row index based on key columns or position
    const keyColumns = options.keyColumns ?? inferKeyColumns(baseline, comparison);
    
    if (keyColumns.length > 0) {
        // Identity-based matching
        const baselineIndex = indexRowsByKey(baseline.rows, keyColumns);
        const comparisonIndex = indexRowsByKey(comparison.rows, keyColumns);
        
        // Find added, removed, changed, unchanged
        return matchByKeys(baselineIndex, comparisonIndex, commonColumns);
    } else {
        // Position-based matching (fallback)
        return matchByPosition(baseline.rows, comparison.rows, commonColumns);
    }
}

function inferKeyColumns(baseline, comparison): string[] {
    // Heuristic: Look for columns named "id", "iid", "name", "key"
    // or columns with unique values in both result sets
    const candidates = ["id", "iid", "name", "key", "uuid"];
    return baseline.columns.filter(c => 
        candidates.some(k => c.toLowerCase().includes(k)) &&
        comparison.columns.includes(c)
    );
}
```

---

## UI Design

### Entry Points

1. **History Panel**: "Compare with..." context menu on history entries
2. **Saved Query Panel**: "Compare Results" button when query has multiple stored results
3. **Output Tab**: New "Compare" tab alongside Log/Table/Graph/Raw

### Comparison Selection Dialog

```
┌──────────────────────────────────────────────────────────────────┐
│  Compare Query Results                                     [X]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Baseline (Left)                    Comparison (Right)           │
│  ┌─────────────────────────┐       ┌─────────────────────────┐  │
│  │ ○ Dec 11, 2:30 PM       │       │ ○ Dec 11, 2:30 PM       │  │
│  │   142 rows, 0.8s        │       │   142 rows, 0.8s        │  │
│  │                         │       │                         │  │
│  │ ● Dec 11, 1:15 PM       │       │ ● Dec 11, 2:30 PM       │  │
│  │   140 rows, 0.7s        │       │   142 rows, 0.8s        │  │
│  │                         │       │                         │  │
│  │ ○ Dec 10, 4:00 PM       │       │ ○ Dec 11, 1:15 PM       │  │
│  │   138 rows, 0.9s        │       │   140 rows, 0.7s        │  │
│  └─────────────────────────┘       └─────────────────────────┘  │
│                                                                  │
│  ┌─ Options ────────────────────────────────────────────────┐   │
│  │ Key columns: [ $person, $name      ▼ ] (auto-detected)   │   │
│  │ □ Show unchanged rows                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                              [Cancel]  [Compare]                 │
└──────────────────────────────────────────────────────────────────┘
```

### Diff View Component

```
┌────────────────────────────────────────────────────────────────────────┐
│  Result Comparison                                                      │
│  Baseline: Dec 11, 1:15 PM → Comparison: Dec 11, 2:30 PM               │
├────────────────────────────────────────────────────────────────────────┤
│  Summary: +2 added, -0 removed, 3 changed, 137 unchanged   [Filter ▼]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  │ Status │ $person    │ $name          │ $age  │                      │
│  ├────────┼────────────┼────────────────┼───────┤                      │
│  │   +    │ iid abc123 │ "John"         │ 30    │  ← Added row         │
│  │   +    │ iid def456 │ "Jane"         │ 25    │  ← Added row         │
│  │   ~    │ iid xyz789 │ "Bob" → "Robert" │ 45  │  ← Changed           │
│  │   ~    │ iid pqr111 │ "Alice"        │ 28→29 │  ← Changed           │
│  │   ~    │ iid stu222 │ "Charlie"      │ 50→51 │  ← Changed           │
│  │        │ iid ...    │ ...            │ ...   │  ← Unchanged (hidden)│
│  │   -    │ iid old999 │ "DeletedUser"  │ 99    │  ← Removed row       │
│                                                                        │
│  [Show all 142 rows]                                                   │
└────────────────────────────────────────────────────────────────────────┘

Legend:
  + Green background  = Added in comparison
  - Red background    = Removed from baseline  
  ~ Yellow background = Row exists but values changed
    No highlight      = Unchanged
```

### Color Scheme (SCSS)

```scss
// styles/_diff-colors.scss
$diff-added-bg: rgba(46, 160, 67, 0.15);
$diff-added-text: #2ea043;
$diff-removed-bg: rgba(248, 81, 73, 0.15);
$diff-removed-text: #f85149;
$diff-changed-bg: rgba(210, 153, 34, 0.15);
$diff-changed-text: #d29922;
```

---

## Implementation Gates

### Gate 1: Data Storage Infrastructure

**Goal**: Store full query results for saved queries, enabling later comparison.

**Tasks**:
1. [ ] Add `StoredQueryResult` and `QueryResultHistoryData` interfaces to `saved-query.ts`
2. [ ] Create `QueryResultHistory` class in `app-data.service.ts` (similar to `QueryHistory`)
3. [ ] Implement storage methods: `addResult()`, `getResultsForQuery()`, `deleteResult()`
4. [ ] Implement cleanup: auto-prune oldest results when limits exceeded
5. [ ] Modify `QueryPageState.persistQueryToHistory()` to also store full results for saved queries
6. [ ] Add migration logic for existing `lastResultSummary` data

**Files to modify**:
- `src/concept/saved-query.ts`
- `src/service/app-data.service.ts`
- `src/service/query-page-state.service.ts`

**Verification**:
- [ ] Run a saved query multiple times, verify results stored in localStorage
- [ ] Verify old results pruned when `MAX_RESULTS_PER_QUERY` exceeded
- [ ] Verify `MAX_STORABLE_ROWS` truncation works correctly
- [ ] Verify localStorage size stays reasonable (~5MB max for result history)
- [ ] Build passes: `pnpm run build`

---

### Gate 2: Diff Engine

**Goal**: Implement the core diffing algorithm as a pure function.

**Tasks**:
1. [ ] Create `src/concept/result-diff.ts` with diff interfaces
2. [ ] Create `src/service/result-diff.service.ts` with `ResultDiffService`
3. [ ] Implement `computeDiff(baseline, comparison, options)` function
4. [ ] Implement key column inference heuristic
5. [ ] Implement position-based fallback matching
6. [ ] Add unit tests for diff logic (if test framework added later)

**Files to create**:
- `src/concept/result-diff.ts`
- `src/service/result-diff.service.ts`

**Verification**:
- [ ] Manual test: Compare identical results → 0 changes
- [ ] Manual test: Compare with added rows → correct `added` count
- [ ] Manual test: Compare with removed rows → correct `removed` count
- [ ] Manual test: Compare with changed values → correct `changed` count
- [ ] Manual test: Key column matching works (same id, different values = changed, not add+remove)
- [ ] Build passes: `pnpm run build`

---

### Gate 3: Comparison Selection UI

**Goal**: UI for selecting two results to compare.

**Tasks**:
1. [ ] Create `src/module/query/compare-dialog/compare-dialog.component.ts`
2. [ ] Implement two-column result picker (baseline + comparison)
3. [ ] Display result metadata (executedAt, rowCount, durationMs)
4. [ ] Add key column selector dropdown (auto-populated from columns)
5. [ ] Wire up "Compare Results" button in saved queries panel
6. [ ] Add to module imports

**Files to create**:
- `src/module/query/compare-dialog/compare-dialog.component.ts`
- `src/module/query/compare-dialog/compare-dialog.component.html`
- `src/module/query/compare-dialog/compare-dialog.component.scss`

**Files to modify**:
- `src/module/query/saved-queries-window/saved-queries-window.component.ts`
- `src/module/query/saved-queries-window/saved-queries-window.component.html`

**Verification**:
- [ ] Dialog opens from saved queries panel
- [ ] Results list populated correctly
- [ ] Selecting two results enables "Compare" button
- [ ] Dialog closes and returns selected result IDs
- [ ] Build passes: `pnpm run build`

---

### Gate 4: Diff View Component

**Goal**: Display diff results in a readable table format.

**Tasks**:
1. [ ] Create `src/module/query/diff-view/diff-view.component.ts`
2. [ ] Implement diff table with status column and color coding
3. [ ] Add summary bar (added/removed/changed/unchanged counts)
4. [ ] Add filter dropdown (All / Added / Removed / Changed)
5. [ ] Implement inline value diff display (old → new)
6. [ ] Add "Show all rows" toggle for unchanged rows
7. [ ] Create diff color variables in `styles/_diff-colors.scss`

**Files to create**:
- `src/module/query/diff-view/diff-view.component.ts`
- `src/module/query/diff-view/diff-view.component.html`
- `src/module/query/diff-view/diff-view.component.scss`
- `styles/_diff-colors.scss`

**Verification**:
- [ ] Diff table renders with correct colors
- [ ] Added rows show green background with "+" indicator
- [ ] Removed rows show red background with "-" indicator
- [ ] Changed rows show yellow background with "~" indicator
- [ ] Changed values display inline diff (e.g., `"Bob" → "Robert"`)
- [ ] Filter dropdown works correctly
- [ ] Summary counts are accurate
- [ ] Build passes: `pnpm run build`

---

### Gate 5: Integration & Polish

**Goal**: Full integration into query workflow.

**Tasks**:
1. [ ] Add "Compare" output tab to query page (alongside Log/Table/Graph/Raw)
2. [ ] Add history entry context menu: "Compare with previous" / "Compare with..."
3. [ ] Add keyboard shortcut for compare (e.g., `Cmd+Shift+D`)
4. [ ] Add empty state when no comparison selected
5. [ ] Handle edge cases: empty results, error results, schema changes
6. [ ] Add snackbar notifications for comparison actions
7. [ ] Performance test with large result sets (500 rows)

**Files to modify**:
- `src/service/query-page-state.service.ts`
- `src/module/query/query-page.component.ts`
- `src/module/query/query-page.component.html`

**Verification**:
- [ ] End-to-end flow: run query → run again → compare → see diff
- [ ] Compare tab shows meaningful empty state when nothing selected
- [ ] Large diffs (500 rows) render without lag
- [ ] Error results handled gracefully in diff view
- [ ] Build passes: `pnpm run build`
- [ ] Manual QA: test on different query types (conceptRows, conceptDocuments)

---

## Storage Limits & Cleanup Strategy

### Limits

| Limit | Default | Rationale |
|-------|---------|-----------|
| `MAX_RESULTS_PER_QUERY` | 10 | Balance history depth vs storage |
| `MAX_STORABLE_ROWS` | 500 | ~100KB per result at 200 bytes/row |
| `MAX_RESULT_HISTORY_SIZE` | 100 | ~10MB total worst case |

### Cleanup Rules

1. **Per-query limit**: When adding result #11 for a query, delete oldest result for that query
2. **Global limit**: When total results > 100, delete oldest across all queries (LRU)
3. **Orphan cleanup**: On app load, delete results for queries that no longer exist in `SavedQueriesData`
4. **Manual cleanup**: "Clear comparison history" button in settings (future)

### Storage Estimation

```
Per row: ~200 bytes (5 columns × 40 chars average)
Per result: 500 rows × 200 bytes = 100KB
Per query: 10 results × 100KB = 1MB
Total: 100 results × 100KB = 10MB worst case
```

localStorage limit is 5-10MB depending on browser. We'll monitor actual usage and adjust limits if needed.

---

## Future Enhancements

- **Export diff to CSV/JSON**: Download comparison results
- **Schema diff**: Compare schema changes between runs (separate feature)
- **Cross-database comparison**: Compare same query across dev/staging/prod
- **Diff annotations**: Add notes to explain expected changes
- **Regression alerts**: Flag unexpected changes automatically

---

## References

- Existing code: [`QueryResultSummary`](file:///Users/cole/phosphor/colelawrence-typedb/studio/src/concept/saved-query.ts#L17-L24)
- Existing code: [`QueryHistoryEntry`](file:///Users/cole/phosphor/colelawrence-typedb/studio/src/concept/saved-query.ts#L40-L48)
- Existing code: [`TableOutputState`](file:///Users/cole/phosphor/colelawrence-typedb/studio/src/service/query-page-state.service.ts#L517-L632)
- Feature request: [FEATURE-IDEAS.md](file:///Users/cole/phosphor/colelawrence-typedb/studio/docs/FEATURE-IDEAS.md#L147-L170)
