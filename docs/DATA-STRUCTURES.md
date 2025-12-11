# TypeDB Studio - Data Structures

Core TypeScript interfaces for the data layer.

---

## Connection

```typescript
interface ConnectionConfig {
  name: string;
  params: {
    addresses: string[];      // e.g., ["http://localhost:8000"]
    username: string;
    password: string;
    database?: string;
  };
  preferences: {
    isStartupConnection: boolean;  // Auto-connect on app load
  };
}

// URL format: typedb://username:password@http://host:port/database
```

---

## Saved Queries

```typescript
interface SavedQueryFolder {
  id: string;
  name: string;
  parentId: string | null;    // null = root level
  createdAt: string;          // ISO 8601
  updatedAt: string;
  importKey?: string;         // For URL imports deduplication
}

interface SavedQuery {
  id: string;
  folderId: string | null;    // null = unsorted
  name: string;
  queryText: string;
  description?: string;
  lastRunAt?: string;
  lastResultSummary?: QueryResultSummary;
  importKey?: string;
}

interface QueryResultSummary {
  status: "success" | "error";
  rowCount: number;
  sampleRows: unknown[];      // First 20 rows for preview
  truncated: boolean;
  errorMessage?: string;
  durationMs?: number;
}
```

---

## Query History

```typescript
interface QueryHistoryEntry {
  id: string;
  dbId: string | null;
  connectionUrl: string | null;
  queryText: string;
  executedAt: string;         // ISO 8601
  status: "success" | "error";
  resultSummary?: QueryResultSummary;
}

// Max 50 entries, oldest dropped
```

---

## Schema Types

```typescript
interface SchemaEntity {
  kind: "entityType";
  label: string;
  isAbstract: boolean;
  supertype: SchemaEntity | null;
  subtypes: SchemaEntity[];
  ownedAttributes: SchemaAttribute[];
  playedRoles: SchemaRole[];
}

interface SchemaRelation {
  kind: "relationType";
  label: string;
  isAbstract: boolean;
  supertype: SchemaRelation | null;
  subtypes: SchemaRelation[];
  ownedAttributes: SchemaAttribute[];
  playedRoles: SchemaRole[];
  relatedRoles: SchemaRole[];    // Roles this relation defines
}

interface SchemaAttribute {
  kind: "attributeType";
  label: string;
  valueType: "string" | "long" | "double" | "boolean" | "datetime";
  isAbstract: boolean;
  supertype: SchemaAttribute | null;
  subtypes: SchemaAttribute[];
  owners: (SchemaEntity | SchemaRelation)[];
}

interface SchemaRole {
  kind: "roleType";
  label: string;                 // e.g., "friendship:friend"
  relation: SchemaRelation;
  players: (SchemaEntity | SchemaRelation)[];
}
```

---

## UI State

```typescript
interface ViewState {
  sidebarState: "expanded" | "collapsed";
  lastUsedTool: "query" | "schema";
  schemaToolWindowState: {
    viewMode: "flat" | "hierarchical";
    linksVisibility: {
      sub: boolean;
      owns: boolean;
      plays: boolean;
      relates: boolean;
    };
    rootNodesCollapsed: {
      entities: boolean;
      relations: boolean;
      attributes: boolean;
    };
  };
  querySidebarState: {
    schemaCollapsed: boolean;
    queriesCollapsed: boolean;
  };
}
```

---

## Export Format

```typescript
interface ExportedQueriesFile {
  version: "1.0";
  exportedAt: string;
  importName?: string;        // Display name for imports
  folders: ExportedFolder[];
  queries: ExportedQuery[];
}

interface ExportedFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface ExportedQuery {
  id: string;
  folderId: string | null;
  name: string;
  queryText: string;
  description?: string;
}
```

---

## localStorage Keys

| Key | Content |
|-----|---------|
| `typeDBStudio.connections` | `ConnectionConfig[]` |
| `typeDBStudio.savedQueries` | `{ folders: [], queries: [] }` |
| `typeDBStudio.queryHistory` | `{ entries: [], lastQueryByDb: {} }` |
| `typeDBStudio.viewState` | `ViewState` |
| `typeDBStudio.preferences` | `{ connections: { showAdvancedConfigByDefault } }` |
