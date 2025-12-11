# Export/Import Saved Queries to JSON

## Overview

Enable users to export their saved queries and folders to portable JSON files, and import them from files or URLs. This supports Git-friendly workflows, team sharing, and avoids vendor lock-in.

### Goals
- Export saved queries to human-readable, version-control-friendly JSON
- Import from local file or remote URL
- Support URL parameter for auto-import on app load: `?import=https://example.com/queries.json`
- Provide merge vs. replace import strategies
- Maintain security for URL imports (allow-list, user confirmation)

## Architecture Overview

### Current State

```
SavedQueriesData (src/concept/saved-query.ts)
├── folders: SavedQueryFolder[]
└── queries: SavedQuery[]

SavedQueries (src/service/app-data.service.ts)
├── listFolders(), listQueries()
├── createFolder(), updateFolder(), deleteFolder()
├── createQuery(), updateQuery(), deleteQuery()
└── Persistence via StorageService → localStorage
```

### Proposed Architecture

```
SavedQueriesData (existing)
├── folders: SavedQueryFolder[]
└── queries: SavedQuery[]

ExportedQueriesFile (new — JSON schema)
├── $schema: string (URL to JSON schema)
├── version: "1.0"
├── exportedAt: ISO8601 string
├── source?: { appName, appVersion }
├── folders: ExportedFolder[]
└── queries: ExportedQuery[]

SavedQueriesExportService (new)
├── exportToJSON(): ExportedQueriesFile
├── downloadAsFile(filename: string): void
├── importFromJSON(data: ExportedQueriesFile, strategy: ImportStrategy): ImportResult
├── importFromURL(url: string, strategy: ImportStrategy): Observable<ImportResult>
└── parseAndValidate(json: unknown): ExportedQueriesFile | ValidationError

URL Import Flow (via root.component.ts)
├── Check for ?import= query param on app init
├── Show confirmation dialog with URL preview
├── Fetch, validate, and import with user-selected strategy
└── Clear query param after import
```

## JSON Schema

### Exported File Format (`typedb-studio-queries-v1.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TypeDB Studio Saved Queries Export",
  "type": "object",
  "required": ["version", "queries"],
  "properties": {
    "$schema": {
      "type": "string",
      "description": "JSON Schema URL for validation"
    },
    "version": {
      "type": "string",
      "enum": ["1.0"],
      "description": "Export format version"
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "object",
      "properties": {
        "appName": { "type": "string" },
        "appVersion": { "type": "string" }
      }
    },
    "folders": {
      "type": "array",
      "items": { "$ref": "#/$defs/ExportedFolder" }
    },
    "queries": {
      "type": "array",
      "items": { "$ref": "#/$defs/ExportedQuery" }
    }
  },
  "$defs": {
    "ExportedFolder": {
      "type": "object",
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "parentId": { "type": ["string", "null"] }
      }
    },
    "ExportedQuery": {
      "type": "object",
      "required": ["id", "name", "queryText"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "queryText": { "type": "string" },
        "description": { "type": "string" },
        "folderId": { "type": ["string", "null"] }
      }
    }
  }
}
```

### TypeScript Interfaces (`src/concept/exported-queries.ts`)

```typescript
export const EXPORT_VERSION = "1.0" as const;

export interface ExportedQueriesFile {
    $schema?: string;
    version: typeof EXPORT_VERSION;
    exportedAt: string;
    source?: {
        appName: string;
        appVersion: string;
    };
    folders: ExportedFolder[];
    queries: ExportedQuery[];
}

export interface ExportedFolder {
    id: string;
    name: string;
    parentId: string | null;
}

export interface ExportedQuery {
    id: string;
    name: string;
    queryText: string;
    description?: string;
    folderId: string | null;
}

export type ImportStrategy = "merge" | "replace";

export interface ImportResult {
    success: boolean;
    foldersAdded: number;
    foldersUpdated: number;
    queriesAdded: number;
    queriesUpdated: number;
    errors: string[];
}
```

### Example Exported File

```json
{
  "$schema": "https://typedb.com/studio/schemas/queries-v1.schema.json",
  "version": "1.0",
  "exportedAt": "2024-12-11T15:30:00.000Z",
  "source": {
    "appName": "TypeDB Studio",
    "appVersion": "3.2.0"
  },
  "folders": [
    { "id": "f1", "name": "Authentication", "parentId": null },
    { "id": "f2", "name": "User Queries", "parentId": "f1" }
  ],
  "queries": [
    {
      "id": "q1",
      "name": "Get all users",
      "queryText": "match $u isa user; fetch $u: username, email;",
      "description": "Fetches all users with their basic info",
      "folderId": "f2"
    },
    {
      "id": "q2",
      "name": "Schema overview",
      "queryText": "match $t sub thing; fetch $t;",
      "folderId": null
    }
  ]
}
```

## Import Strategies

### Merge Strategy (Default)
- **Matching by ID**: If imported item has same ID as existing → update existing
- **No ID match**: Create new item with imported ID (preserves cross-references)
- **Folder structure**: Preserve parent-child relationships from import
- **Conflict resolution**: Imported data wins (overwrites existing)

### Replace Strategy
- **Clear all**: Delete all existing folders and queries first
- **Import fresh**: Insert all imported items as-is
- **Use case**: "Load this exact query set" scenarios

### ID Collision Handling
- If merge finds ID conflict but name differs significantly → prompt user
- Option to "Keep both" (generate new ID for imported item)
- Option to "Replace" (overwrite existing)
- Option to "Skip" (keep existing, ignore import)

## URL Parameter Handling

### URL Format
```
https://studio.typedb.com/?import=https://example.com/my-queries.json
https://studio.typedb.com/query?import=https://gist.githubusercontent.com/.../queries.json
```

### Security Considerations

1. **User Confirmation Required**: Always show dialog before fetching/importing
2. **URL Allowlist** (optional): Configure trusted domains in preferences
3. **Display URL Clearly**: Show full URL being fetched
4. **HTTPS Only**: Reject non-HTTPS URLs (except localhost for development)
5. **Size Limit**: Reject responses > 5MB
6. **Content-Type Check**: Verify `application/json` response
7. **Timeout**: 10-second fetch timeout
8. **No Credentials**: Fetch with `credentials: 'omit'`

### Import Flow

```
1. App loads with ?import=URL
2. Parse and validate URL
3. Show ImportConfirmationDialog:
   - "Import queries from: [URL]"
   - "This will fetch data from an external source."
   - Strategy selector: Merge / Replace
   - [Cancel] [Import]
4. On confirm: Fetch URL with security constraints
5. Parse and validate JSON
6. If validation fails: Show error, offer to retry or cancel
7. If validation passes: Execute import with selected strategy
8. Show result: "Imported X queries, Y folders"
9. Clear ?import= from URL (history.replaceState)
10. Navigate to /query to show imported queries
```

## Implementation Gates

### Gate 1: Data Models & Export Logic

**Goal**: Establish export functionality without UI.

**Tasks**:
1. Create `src/concept/exported-queries.ts` with interfaces
2. Create `src/service/saved-queries-export.service.ts`:
   - `exportToJSON()`: Convert current SavedQueriesData to ExportedQueriesFile
   - `toExportFormat(data: SavedQueriesData): ExportedQueriesFile`
   - Strip runtime-only fields (lastRunAt, lastResultSummary, etc.)
3. Add `parseExportedQueriesFile(json: unknown)` validation function
4. Write export schema JSON file (optional, for external validation)

**Files**:
- `src/concept/exported-queries.ts` (new)
- `src/service/saved-queries-export.service.ts` (new)

**Verification**:
```typescript
// Browser console:
const exportService = /* inject */;
const json = exportService.exportToJSON();
console.log(JSON.stringify(json, null, 2));
// Should produce valid, human-readable JSON matching schema
```

---

### Gate 2: File Download (Export UI)

**Goal**: Users can export queries to a file.

**Tasks**:
1. Add `downloadAsFile(filename?: string)` to export service:
   - Generate filename: `typedb-queries-YYYY-MM-DD.json`
   - Create Blob, trigger download via anchor click pattern
2. Add "Export" button to SavedQueriesWindowComponent toolbar
3. Show success snackbar after download initiated

**Files**:
- `src/service/saved-queries-export.service.ts` (add download)
- `src/module/query/saved-queries-window/saved-queries-window.component.ts` (add button)
- `src/module/query/saved-queries-window/saved-queries-window.component.html` (add button)

**Verification**:
- Click "Export" button
- Browser downloads `typedb-queries-2024-12-11.json`
- Open file, verify JSON structure matches schema
- File is human-readable (pretty-printed with 2-space indent)

---

### Gate 3: Import Logic (No UI)

**Goal**: Core import functionality with merge/replace strategies.

**Tasks**:
1. Add to export service:
   - `importFromJSON(data: ExportedQueriesFile, strategy: ImportStrategy): ImportResult`
   - `mergeImport(data)`: Add/update items by ID matching
   - `replaceImport(data)`: Clear existing, insert all
2. Handle folder parent references (import folders before queries)
3. Regenerate IDs if needed (when keeping both on conflict)
4. Return detailed ImportResult for user feedback

**Files**:
- `src/service/saved-queries-export.service.ts` (add import logic)

**Verification**:
```typescript
// Create test data
const testExport = {
  version: "1.0",
  exportedAt: new Date().toISOString(),
  folders: [{ id: "test-f1", name: "Test Folder", parentId: null }],
  queries: [{ id: "test-q1", name: "Test Query", queryText: "match $x;", folderId: "test-f1" }]
};

// Test merge
exportService.importFromJSON(testExport, "merge");
appData.savedQueries.listFolders(); // Should include "Test Folder"
appData.savedQueries.listQueries(); // Should include "Test Query"

// Test replace
exportService.importFromJSON(testExport, "replace");
appData.savedQueries.listQueries().length; // Should equal testExport.queries.length
```

---

### Gate 4: Import from File (UI)

**Goal**: Users can import from local JSON files.

**Tasks**:
1. Create `ImportDialogComponent`:
   - File picker input (accept=".json")
   - Strategy selector (radio: Merge / Replace)
   - Preview of import contents (folder count, query count)
   - Validation error display
   - [Cancel] [Import] buttons
2. Add "Import" button to SavedQueriesWindowComponent toolbar
3. After successful import: refresh tree, show success snackbar

**Files**:
- `src/module/query/saved-queries-window/import-dialog.component.ts` (new)
- `src/module/query/saved-queries-window/saved-queries-window.component.ts` (add button)
- `src/module/query/saved-queries-window/saved-queries-window.component.html` (add button)

**Verification**:
- Click "Import" → dialog opens
- Select previously exported file
- Choose "Merge" → click Import
- Queries appear in tree
- Snackbar shows "Imported X queries, Y folders"

---

### Gate 5: Import from URL (URL Parameter)

**Goal**: Support `?import=URL` parameter for auto-import.

**Tasks**:
1. Add `IMPORT_URL` constant to `url-params.ts`
2. Create `ImportFromUrlDialogComponent`:
   - Show URL being fetched
   - Security warning text
   - Strategy selector
   - Loading state during fetch
   - Error display for fetch/parse failures
3. Add URL import handling to `root.component.ts`:
   - Check for `?import=` on init (after auto-login check)
   - Validate URL (HTTPS, reasonable length)
   - Open confirmation dialog
   - On confirm: fetch, validate, import
   - Clear URL param after completion
4. Add `importFromURL(url: string)` to export service:
   - Fetch with security constraints
   - Parse and validate response
   - Return parsed data or error

**Files**:
- `src/framework/util/url-params.ts` (add IMPORT_URL)
- `src/module/query/saved-queries-window/import-from-url-dialog.component.ts` (new)
- `src/service/saved-queries-export.service.ts` (add URL fetch)
- `src/root.component.ts` (add import param handling)

**Verification**:
1. Host a test JSON file (e.g., GitHub Gist raw URL)
2. Navigate to `http://localhost:4200/?import=https://gist.githubusercontent.com/.../queries.json`
3. Confirmation dialog appears showing URL
4. Click Import → queries are imported
5. URL bar no longer shows `?import=` parameter
6. App navigates to /query, queries visible in sidebar

---

### Gate 6: Export Selection & Folder Export

**Goal**: Export specific folders or queries, not just "all".

**Tasks**:
1. Add "Export" to query/folder context menu in tree
2. Add "Export Folder" option that includes folder + descendants
3. Add multi-select support (Cmd/Ctrl+click) for batch export
4. Export dialog with item preview before download

**Files**:
- `src/module/query/saved-queries-window/saved-queries-window.component.ts` (context menu)
- `src/module/query/saved-queries-window/export-dialog.component.ts` (new, optional)
- `src/service/saved-queries-export.service.ts` (add selective export)

**Verification**:
- Right-click folder → "Export Folder"
- Downloads JSON with only that folder's contents
- Re-import → only those items added

---

## Security Considerations

### URL Import Security

| Risk | Mitigation |
|------|------------|
| Malicious JSON payload | Strict schema validation, no code execution |
| SSRF (Server-Side Request Forgery) | N/A — client-side only, browser enforces CORS |
| Credential leakage | `credentials: 'omit'` on fetch |
| XSS via imported query names | Angular's default sanitization, no innerHTML |
| Large payload DoS | 5MB size limit, timeout |
| HTTP downgrade | HTTPS-only enforcement (except localhost) |
| Tracking pixels | Fetch only, no image/script loading |

### Data Validation

```typescript
function validateExportedFile(json: unknown): ExportedQueriesFile {
    // 1. Type check top-level structure
    if (!json || typeof json !== 'object') throw new ValidationError('Invalid JSON structure');
    
    // 2. Version check
    const data = json as Record<string, unknown>;
    if (data.version !== '1.0') throw new ValidationError(`Unsupported version: ${data.version}`);
    
    // 3. Validate folders array
    if (!Array.isArray(data.folders)) data.folders = [];
    for (const folder of data.folders) {
        validateFolder(folder);
    }
    
    // 4. Validate queries array
    if (!Array.isArray(data.queries)) throw new ValidationError('Missing queries array');
    for (const query of data.queries) {
        validateQuery(query);
    }
    
    // 5. Validate referential integrity (folder IDs exist)
    const folderIds = new Set(data.folders.map(f => f.id));
    for (const query of data.queries) {
        if (query.folderId && !folderIds.has(query.folderId)) {
            throw new ValidationError(`Query "${query.name}" references unknown folder: ${query.folderId}`);
        }
    }
    
    return data as ExportedQueriesFile;
}
```

## Edge Cases

### Empty Export
- If no queries exist, still allow export (empty arrays)
- Import of empty file is a no-op (or clears everything in "replace" mode)

### Circular Folder References
- Validate no circular parent references in import
- Reject with clear error message

### Duplicate Names
- Allow duplicate query names (IDs are unique)
- Show warning but proceed with import

### Missing Required Fields
- Reject import if `name` or `queryText` missing on any query
- Show which items failed validation

### Version Mismatch
- If version > "1.0", show warning: "This file was created with a newer version. Some data may be ignored."
- Attempt best-effort import of known fields

### Large Imports
- Show progress indicator for imports > 100 items
- Consider batching localStorage writes

## File Structure

```
src/
├── concept/
│   ├── saved-query.ts              # Existing
│   └── exported-queries.ts         # NEW: Export interfaces
├── framework/util/
│   └── url-params.ts               # MODIFIED: Add IMPORT_URL
├── service/
│   ├── app-data.service.ts         # Existing (no changes needed)
│   └── saved-queries-export.service.ts  # NEW: Export/import logic
├── root.component.ts               # MODIFIED: Handle ?import= param
└── module/query/saved-queries-window/
    ├── saved-queries-window.component.ts    # MODIFIED: Add toolbar buttons
    ├── saved-queries-window.component.html  # MODIFIED: Add toolbar buttons
    ├── import-dialog.component.ts           # NEW: File import dialog
    └── import-from-url-dialog.component.ts  # NEW: URL import dialog
```

## Definition of Done

- [ ] Export produces valid, human-readable JSON
- [ ] Exported JSON follows documented schema
- [ ] Import from file works with merge and replace strategies
- [ ] Import from URL works with `?import=` parameter
- [ ] Security: HTTPS enforced, user confirmation required for URL import
- [ ] Error handling: Clear messages for invalid JSON, network failures
- [ ] UI: Export/Import buttons in saved queries toolbar
- [ ] Refresh: Tree updates after import without page reload
- [ ] Git-friendly: Exported JSON is diff-friendly (consistent key ordering)
