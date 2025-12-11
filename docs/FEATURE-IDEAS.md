# Feature Ideas from API Tool Research

Research conducted on Postman, Insomnia, and Yaak to identify popular features and requests applicable to TypeDB Studio's query tool UI.

---

## 1. Multi-Tab Query Editing

**Priority**: High  
**Status**: Not implemented

Open multiple queries simultaneously in tabs, similar to browser tabs or IDE editors.

### Why users want this
- Switch between related queries without losing context
- Compare query structures side-by-side
- Work on multiple parts of an API workflow at once

### Our notes
Great idea. We should store tab state in localStorage to persist across sessions.

### Source discussions
- [Insomnia: Tabs for opened requests](https://github.com/Kong/insomnia/discussions/6108) - 40+ comments, plugin created to fill gap, officially shipped in v11.0
- [Insomnia: Feature Request - Tabs #1253](https://github.com/Kong/insomnia/issues/1253) - Original 2018 request
- [Insomnia: Tabs and temporary requests #3071](https://github.com/Kong/insomnia/issues/3071) - Detailed use case
- [Yaak: Multi-tab Support](https://feedback.yaak.app/p/multiple-tabs) - 38 upvotes, "Under Consideration"

### Lessons from Insomnia's implementation
After shipping tabs in v11.0, users complained about:
- Every click opening a new tab (should require double-click or middle-click)
- Folders opening as tabs when just expanding/collapsing
- No option to disable tabs for users who prefer sidebar-only navigation

See [Tabs are half baked #8488](https://github.com/Kong/insomnia/issues/8488) for feedback.

---

## 2. Environments / Connection Presets

**Priority**: High  
**Status**: Not implemented

One-click switching between dev/staging/prod connection configurations.

### Why users want this
- Avoid accidentally running queries against production
- Quickly test same queries across environments
- Share environment configs with team without sharing secrets

### Our notes
Great idea. Should be straightforward since we don't store queries on a per-connection basis—queries are portable across connections. However, the full picture of what's requested may include:
- Per-environment variables (not just connection URLs)
- Visual differentiation (color-coded environments)
- "Private" environment values that never sync

### Source discussions
- [Postman: Environment Variables Documentation](https://learning.postman.com/docs/sending-requests/variables/environment-variables/) - Core feature
- [Postman: Store and reuse values using variables](https://learning.postman.com/docs/sending-requests/variables/variables/) - Variable scopes explained
- Insomnia: Hierarchical environments (Global → Collection → Folder) with private sub-environments

### Key patterns
| Tool | Environment switching |
|------|----------------------|
| Postman | Dropdown in top-right, color-coded (new feature) |
| Insomnia | Environment selector in header, private environments for secrets |
| Yaak | Per-workspace environments, encrypted secrets for Git |

---

## 3. Variable System with Autocomplete

**Priority**: Medium  
**Status**: Partially implemented (Handlebars syntax reserved)

Dynamic variables in queries with autocomplete when typing `{{`.

### Why users want this
- Reuse values (IDs, timestamps) across queries
- Chain query results into subsequent queries
- Generate dynamic values (UUIDs, dates)

### Our notes
We already support variables through Handlebars syntax which is more powerful than simple `{{variable}}` replacement. We should implement autocomplete triggered by `{{` that shows available variables and Handlebars helpers.

### Source discussions
- [Postman: Variables Documentation](https://learning.postman.com/docs/sending-requests/variables/variables/) - `{{variable}}` syntax
- Insomnia: `Ctrl+Space` or `{{` triggers autocomplete; `{%` triggers template tag picker
- Yaak: Dynamic request templating with variables, template functions, request chaining

### Template tag examples (Insomnia)
- `{% uuid %}` - Generate UUID
- `{% timestamp %}` - Current timestamp  
- `{% response 'body', 'req_abc123', '$.token' %}` - Chain from previous response

---

## 4. Export/Import to JSON

**Priority**: High  
**Status**: Not implemented

Export saved queries to portable JSON files; import from URL or file.

### Why users want this
- Version control queries in Git alongside code
- Share query collections without proprietary formats
- Migrate between tools
- Avoid vendor lock-in

### Our notes
Amazing idea. Even more amazing if we support **opening JSON query definitions via URL parameter** so users can easily import queries provided by documentation links. Example: `https://studio.typedb.com/?import=https://example.com/queries.json`

### Source discussions
- [Yaak: Export to OpenAPI](https://feedback.yaak.app/p/export-to-openapi) - 30 upvotes
- [Yaak: OpenAPI URL Synchronization](https://feedback.yaak.app/) - Auto-refresh from live spec
- Postman community: #1 complaint is vendor lock-in with proprietary format
- Bruno (Postman alternative): Gained popularity specifically for Git-friendly plain-text storage

### Anti-patterns to avoid
- Postman's proprietary format that loses syntax highlighting in diffs
- Auto-uploading data to cloud without consent (Insomnia v8.0 disaster)

---

## 5. Command Palette

**Priority**: Medium  
**Status**: Not implemented

Keyboard-driven navigation via `Cmd+K` / `Ctrl+K` command palette.

### Why users want this
- Power users prefer keyboard over mouse
- Quick access to any action without memorizing shortcuts
- Searchable list of all available commands

### Our notes
Great idea. No additional notes.

### Source discussions
- [Yaak homepage](https://yaak.app/) - Lists "Command palette" as key feature
- VS Code's command palette is the gold standard
- Raycast/Alfred-style search UX increasingly expected

---

## 6. Response Comparison / Diff

**Priority**: Medium  
**Status**: Not implemented

Compare query results across multiple runs to spot changes.

### Why users want this
- Detect regressions after schema changes
- Verify data migrations
- Debug why same query returns different results

### Our notes
Great idea to log. We already store `lastResultSummary` on saved queries—could extend to store multiple historical results for comparison.

### Source discussions
- Insomnia feature request: "Diff for Response History"
- [Yaak: Save Request Data for Response History](https://feedback.yaak.app/p/response-history) - 30 upvotes, users want to know what request produced which response

### Implementation ideas
- Side-by-side JSON diff view
- Highlight added/removed/changed rows
- Filter to show only differences

---

## 7. Scratch Pad / Anonymous Requests

**Priority**: Low  
**Status**: Not implemented

Quick throwaway queries without saving to collection.

### Why users want this
- Test random queries without cluttering saved queries
- Experiment before committing to collection structure
- Quick one-off debugging

### Our notes
Great idea to log. Could implement as:
- "Scratch" tab that doesn't persist
- Temporary queries in history but not in saved queries tree
- Auto-save to "Drafts" folder that can be cleaned up

### Source discussions
- [Insomnia: Tabs and temporary requests #3071](https://github.com/Kong/insomnia/issues/3071) - Detailed feature request
- Insomnia: "Scratch Pad Mode" - No-account-required local testing
- [Yaak: Ability to enable manual saving](https://feedback.yaak.app/p/ability-to-enable-manual-saving) - Disable autosave for quick testing

---

## Additional Ideas (Lower Priority)

### Request Chaining
Use results from one query as input to another. Insomnia's "Response" template tag and Yaak's request chaining are popular.

### Auth Inheritance  
Set credentials at folder level, inherited by child queries. Reduces repetition.

### Timestamps in History
[Yaak request](https://feedback.yaak.app/p/request-history-time-stamp) - Show when each history entry was created. We already track `executedAt`.

### View Full Request/Response Flow
[Yaak #1 request](https://feedback.yaak.app/p/view-entire-request-response-flow) (154 votes) - Show exactly what was sent, like `curl -v`. Useful for debugging.

### Keyboard Shortcuts for Tab Navigation
Navigate between open tabs with `Cmd+1`, `Cmd+2`, etc. or `Cmd+Shift+[` / `]`.

---

## Anti-Patterns to Avoid

| Don't | Why | Source |
|-------|-----|--------|
| Force cloud sync/login | #1 reason users abandoned Postman/Insomnia | All tools |
| Feature bloat | "Enshittification" killed Postman goodwill | Reddit, Twitter |
| Gate local data behind accounts | Insomnia v8.0 locked users out of their data | [GitHub discussions](https://github.com/Kong/insomnia/discussions/6108) |
| Auto-upload without consent | Privacy violation, corporate policy issues | Insomnia backlash |
| Every click opens a tab | Users found this annoying in Insomnia v11 | [#8488](https://github.com/Kong/insomnia/issues/8488) |
| Heavy/slow performance | Constant Postman criticism | G2 reviews |

---

## Key Takeaways

1. **Local-first is critical** - Users actively flee tools that force cloud sync
2. **Progressive disclosure** - Keep UI simple, expose features when needed
3. **Git-friendly storage** - Plain-text, versionable configs are highly valued
4. **Keyboard-driven workflows** - Power users expect command palette + shortcuts
5. **Tabs need careful UX** - Don't open tabs for every click; provide opt-out
