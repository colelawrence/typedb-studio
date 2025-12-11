# Multi-Tab Query Editing Implementation Plan

## Overview

Add support for opening multiple queries in tabs, inspired by browser tabs and IDE editors. Users can switch between queries without losing context, compare query structures, and work on multiple workflows simultaneously.

### Key Principles (from Insomnia lessons)

1. **Don't open tabs for every click** — require explicit action (double-click, middle-click, or explicit "Open in Tab")
2. **Provide opt-out** — users who prefer single-pane can disable tabs
3. **Persist state** — tab state survives session refreshes and app restarts

## Architecture Overview

### Current State

```
QueryPageComponent
├── QuerySidebarComponent (saved queries tree, schema viewer)
├── Code Editor (single queryEditorControl)
├── Results Pane (single output state: log, table, graph, raw)
└── History Pane (session-level history)

QueryPageState (providedIn: 'root')
├── queryEditorControl: FormControl<string>
├── _currentSavedQueryId$: BehaviorSubject<string | null>
├── _originalQueryText$: BehaviorSubject<string>
├── isDirty$: Observable<boolean>
├── logOutput, tableOutput, graphOutput, rawOutput
└── history: HistoryWindowState
```

### Proposed State

```
QueryPageComponent
├── TabBarComponent (new)
│   └── Tab[] — clickable tabs with close buttons
├── QuerySidebarComponent (unchanged)
├── Code Editor (bound to active tab's state)
├── Results Pane (bound to active tab's results)
└── History Pane (unchanged — still session-level)

TabsState (new service)
├── tabs$: BehaviorSubject<QueryTab[]>
├── activeTabId$: BehaviorSubject<string | null>
└── Persistence via AppData.queryTabs

QueryTab (new interface)
├── id: string
├── type: "scratch" | "saved"
├── savedQueryId?: string (for type="saved")
├── queryText: string
├── originalText: string (for dirty detection)
├── results?: TabResults (optional — cached results)
├── outputType: OutputType
└── createdAt: string

QueryPageState (refactored)
├── Delegates to TabsState for active tab
├── queryEditorControl bound to active tab's queryText
└── Output states bound to active tab's results
```

## Data Models

### New Types (`src/concept/query-tab.ts`)

```typescript
export interface QueryTab {
    id: string;
    type: "scratch" | "saved";
    savedQueryId: string | null;
    name: string;
    queryText: string;
    originalText: string;
    outputType: OutputType;
    isPinned: boolean;
    createdAt: string;
    lastAccessedAt: string;
    // Results are NOT persisted — too large
}

export interface QueryTabsData {
    tabs: QueryTab[];
    activeTabId: string | null;
    maxTabs: number; // default: 10
    autoCloseOnOpen: boolean; // close unpinned tabs when opening new saved query
}

export const INITIAL_QUERY_TABS_DATA: QueryTabsData = {
    tabs: [],
    activeTabId: null,
    maxTabs: 10,
    autoCloseOnOpen: false,
};
```

### Storage Key

`typeDBStudio.queryTabs` — follows existing pattern in `app-data.service.ts`.

## Implementation Gates

### Gate 1: Tab Data Model & Persistence

**Goal**: Establish data layer without UI changes.

**Tasks**:
1. Create `src/concept/query-tab.ts` with interfaces
2. Add `QueryTabs` class to `app-data.service.ts` following existing pattern
3. Add `parseQueryTabsData()` parser function
4. Add unit-style verification by manually testing localStorage read/write

**Files changed**:
- `src/concept/query-tab.ts` (new)
- `src/service/app-data.service.ts` (add QueryTabs class)

**Verification**:
```typescript
// In browser console:
const appData = /* get from Angular injector */;
appData.queryTabs.openTab({ type: "scratch", queryText: "match $x isa thing;" });
appData.queryTabs.listTabs(); // Should return array with new tab
localStorage.getItem("typeDBStudio.queryTabs"); // Should show persisted data
```

---

### Gate 2: TabsState Service

**Goal**: Reactive state management for tabs with observables.

**Tasks**:
1. Create `src/service/query-tabs-state.service.ts`
2. Implement `tabs$`, `activeTabId$`, `activeTab$` observables
3. Implement tab operations: `openTab()`, `closeTab()`, `activateTab()`, `updateTabText()`, `pinTab()`
4. Integrate with `QueryPageState` — make `queryEditorControl` sync with active tab
5. Handle dirty state: `isDirty$` per tab

**Key Design Decisions**:
- Results are NOT persisted (too large, stale quickly)
- Tab text syncs on every keystroke via `FormControl.valueChanges`
- Original text tracked for dirty detection

**Files changed**:
- `src/service/query-tabs-state.service.ts` (new)
- `src/service/query-page-state.service.ts` (refactor to use TabsState)

**Verification**:
```typescript
// Open scratch tab
tabsState.openScratchTab();
expect(tabsState.tabs$.value.length).toBe(1);

// Type in editor
queryPageState.queryEditorControl.patchValue("match $x;");
expect(tabsState.activeTab$.value?.queryText).toBe("match $x;");

// Switch tabs
tabsState.openScratchTab(); // tab 2
tabsState.activateTab(firstTabId);
expect(queryPageState.queryEditorControl.value).toBe("match $x;"); // restored
```

---

### Gate 3: Tab Bar UI Component

**Goal**: Visible tabs that users can click, close, and reorder.

**Tasks**:
1. Create `src/module/query/tab-bar/query-tab-bar.component.ts`
2. Implement tab strip with:
   - Tab name (query name or "New Query")
   - Dirty indicator (*)
   - Close button (×)
   - Active tab highlighting
3. Handle click to activate, middle-click to close
4. Add "+" button to create new scratch tab
5. Integrate into `query-page.component.html`

**UX Details**:
- Tab max-width: 180px, text overflow with ellipsis
- Dirty indicator: asterisk (*) after name
- Close button: appears on hover OR always for dirty tabs
- Empty state: auto-create one scratch tab if no tabs exist

**Files changed**:
- `src/module/query/tab-bar/query-tab-bar.component.ts` (new)
- `src/module/query/tab-bar/query-tab-bar.component.html` (new)
- `src/module/query/tab-bar/query-tab-bar.component.scss` (new)
- `src/module/query/query-page.component.html` (add tab bar)
- `src/module/query/query-page.component.scss` (layout adjustments)

**Verification**:
- Manually test: open app, see tab bar, click "+ New Query"
- Verify tab appears with "New Query" name
- Type text, see dirty indicator
- Click close, tab disappears
- Refresh page, tabs persist

---

### Gate 4: Sidebar Integration (Double-Click to Open)

**Goal**: Integrate saved queries tree with tab system.

**Tasks**:
1. Modify `QuerySidebarComponent` to emit `queryDoubleClicked` event
2. Single-click: preview query (load in current tab if scratch/unpinned)
3. Double-click: open in new tab
4. Right-click context menu: "Open in New Tab" option
5. Handle "opening" a saved query that's already open → activate that tab

**UX Details**:
- Single click on saved query:
  - If current tab is scratch AND not dirty → replace content
  - If current tab is dirty → open in new tab
- Double click: always open in new tab
- Middle click: always open in new tab

**Files changed**:
- `src/module/query/sidebar/query-sidebar.component.ts` (add double-click handler)
- `src/module/query/sidebar/query-sidebar.component.html` (bind events)
- `src/module/query/saved-queries-window/saved-queries-window.component.ts` (propagate events)
- `src/module/query/query-page.component.ts` (handle new events)

**Verification**:
- Single-click saved query → loads in current tab
- Double-click saved query → opens new tab
- Double-click same query again → switches to existing tab (doesn't duplicate)
- Middle-click → opens new tab

---

### Gate 5: Tab Context Menu & Keyboard Shortcuts

**Goal**: Power user features.

**Tasks**:
1. Right-click context menu on tabs:
   - Close
   - Close Others
   - Close All
   - Close to the Right
   - Pin / Unpin
2. Keyboard shortcuts:
   - `Cmd+W` / `Ctrl+W`: Close active tab
   - `Cmd+T` / `Ctrl+T`: New scratch tab
   - `Cmd+Shift+T`: Reopen last closed tab
   - `Cmd+1-9`: Switch to tab by position
   - `Cmd+Shift+[` / `]`: Previous/next tab
3. Store recently closed tabs (up to 5) for reopen

**Files changed**:
- `src/module/query/tab-bar/query-tab-bar.component.ts` (context menu)
- `src/module/query/query-page.component.ts` (keyboard shortcuts)
- `src/service/query-tabs-state.service.ts` (recently closed stack)

**Verification**:
- Right-click tab → see context menu
- Press Cmd+W → active tab closes
- Press Cmd+T → new tab opens
- Press Cmd+Shift+T → last closed tab reopens

---

### Gate 6: Results per Tab (Optional Enhancement)

**Goal**: Keep results cached per tab so switching tabs doesn't lose output.

**Tasks**:
1. Modify output state classes to support per-tab instances
2. Cache results in memory (not localStorage — too large)
3. When switching tabs, swap which output state is displayed
4. Clear results when tab is closed

**Trade-offs**:
- Memory usage increases with many tabs
- Results may become stale if schema/data changes
- Consider adding "refresh" indicator for stale results

**Files changed**:
- `src/service/query-page-state.service.ts` (major refactor of output states)
- `src/service/query-tabs-state.service.ts` (store results per tab)

**Verification**:
- Run query in tab 1
- Switch to tab 2, run different query
- Switch back to tab 1 → results still visible
- Close tab 1 → memory freed

---

## Edge Cases & UX Considerations

### Tab Limits
- Default max tabs: 10
- When limit reached: prompt to close tabs or auto-close oldest unpinned tab
- Pinned tabs are never auto-closed

### Dirty Tab Close
- If closing dirty tab: show confirmation dialog
- "Save", "Don't Save", "Cancel" options
- For scratch tabs: offer to save as new query

### Tab Naming
- Scratch tabs: "New Query", "New Query (2)", etc.
- Saved query tabs: Use query name
- Dirty indicator: "My Query *"

### Session Restore
- On app start: restore all tabs from localStorage
- Don't restore results (too large, potentially stale)
- Auto-focus last active tab

### Navigation Away
- If navigating away from /query with dirty tabs: warn user
- Browser beforeunload handler for unsaved changes

### Performance
- Lazy-load editor state (CodeMirror instance) — only for active tab
- Virtualize tab bar if >20 tabs (unlikely but possible)

### History Pane
- History remains session-level, not per-tab
- History entries could optionally show which tab ran them (future enhancement)

## Migration Strategy

### Phase 1: Feature Flag
Add `enableTabs` flag to ViewState. Default: `true` for new users, `false` for existing users with data.

### Phase 2: Graceful Upgrade
On first load with tabs enabled:
1. If user has text in queryEditorControl → create scratch tab with that text
2. If user has currentSavedQueryId → create tab for that saved query
3. Migrate seamlessly — no data loss

### Phase 3: Remove Flag
After 1-2 releases, remove flag and make tabs the only mode.

## File Structure (New/Modified)

```
src/
├── concept/
│   └── query-tab.ts                    # NEW: Tab interfaces
├── service/
│   ├── app-data.service.ts             # MODIFIED: Add QueryTabs
│   ├── query-tabs-state.service.ts     # NEW: Tab state management
│   └── query-page-state.service.ts     # MODIFIED: Integrate with tabs
└── module/query/
    ├── tab-bar/                        # NEW DIRECTORY
    │   ├── query-tab-bar.component.ts
    │   ├── query-tab-bar.component.html
    │   └── query-tab-bar.component.scss
    ├── query-page.component.ts         # MODIFIED: Use tabs
    ├── query-page.component.html       # MODIFIED: Add tab bar
    └── sidebar/
        └── query-sidebar.component.ts  # MODIFIED: Double-click handling
```

## Definition of Done

- [ ] Users can open multiple queries in tabs
- [ ] Tab state persists across page refreshes
- [ ] Double-click in sidebar opens query in new tab
- [ ] Single-click previews query in current tab (if not dirty)
- [ ] Dirty indicator shows unsaved changes
- [ ] Close button works with confirmation for dirty tabs
- [ ] Keyboard shortcuts work (Cmd+W, Cmd+T, Cmd+1-9)
- [ ] Existing users are migrated seamlessly
- [ ] No performance regression for single-tab usage
- [ ] Matches existing code style and patterns
