# TypeDB Studio - Porting Documentation

## Quick Links

| Document | Description |
|----------|-------------|
| [FEATURES.md](./FEATURES.md) | UI feature specification - what each screen does |
| [DATA-STRUCTURES.md](./DATA-STRUCTURES.md) | TypeScript interfaces for all persisted data |

---

## Tech Stack

| Category | Current | Notes |
|----------|---------|-------|
| Framework | Angular 17 | Standalone components |
| State | RxJS BehaviorSubject | Could be Zustand/Redux/signals |
| UI Library | Angular Material | Trees, dialogs, tables, menus |
| Code Editor | CodeMirror 6 | Custom TypeQL language mode |
| Graph | Sigma.js + Graphology | Force-directed layout |
| Storage | localStorage | Via wrapper service |

---

## Key Source Files

### Services (state management)
- [`src/service/driver-state.service.ts`](../src/service/driver-state.service.ts) - Connection, database, transactions
- [`src/service/app-data.service.ts`](../src/service/app-data.service.ts) - localStorage persistence
- [`src/service/query-page-state.service.ts`](../src/service/query-page-state.service.ts) - Query editor state

### Pages
- [`src/module/query/query-page.component.ts`](../src/module/query/query-page.component.ts) - Main query UI
- [`src/module/schema/schema-page.component.ts`](../src/module/schema/schema-page.component.ts) - Schema explorer
- [`src/module/connection/create/connection-creator.component.ts`](../src/module/connection/create/connection-creator.component.ts) - Connect form

### TypeQL Editor
- [`src/framework/code-editor/`](../src/framework/code-editor/) - CodeMirror wrapper
- [`src/framework/codemirror-lang-typeql/`](../src/framework/codemirror-lang-typeql/) - Syntax, autocomplete, linting

### Graph Visualization
- [`src/framework/graph-visualiser/`](../src/framework/graph-visualiser/) - Sigma.js integration

### Data Models
- [`src/concept/saved-query.ts`](../src/concept/saved-query.ts) - Query/folder interfaces
- [`src/concept/connection.ts`](../src/concept/connection.ts) - Connection config
