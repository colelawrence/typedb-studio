# TypeDB Studio Development Guide

## Quick Reference

### Build Commands
```bash
# Development server
pnpm start

# Production build
pnpm run build

# Development build
pnpm run build:dev
```

### No Test Framework
This project currently has no test setup. There are no `*.spec.ts` or `*.test.ts` files.

## Project Structure

```
src/
├── concept/           # Domain models and types
├── framework/         # Reusable UI components and utilities
├── module/            # Feature modules (pages and components)
│   ├── query/         # Query tool page
│   ├── schema/        # Schema viewer
│   ├── connection/    # Connection management
│   └── ...
└── service/           # Angular services (state management, persistence)
```

## Key Patterns

### 1. Persistence via localStorage

All persistence uses `StorageService` + `AppData` pattern:

```typescript
// In app-data.service.ts
class MyFeature {
    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.readStorage() == null) {
            this.writeStorage(INITIAL_DATA);
        }
    }

    private readStorage(): MyData {
        return this.storage.read<MyData>(STORAGE_KEY, parseMyData);
    }

    private writeStorage(data: MyData): StorageWriteResult {
        return this.storage.write(STORAGE_KEY, data);
    }
}
```

Storage keys are namespaced as `typeDBStudio.*` in localStorage.

### 2. Reactive State with Observables

**IMPORTANT**: Use Observables + `| async` pipe for state that affects the template, NOT imperative methods.

❌ **Bad** - Imperative methods won't trigger re-render reliably:
```typescript
// Service
isDirty(): boolean {
    return this.currentText !== this.originalText;
}

// Template
@if (state.isDirty()) { ... }
```

✅ **Good** - Reactive streams with async pipe:
```typescript
// Service
readonly isDirty$ = combineLatest([
    this._originalText$,
    this.textControl.valueChanges.pipe(startWith(this.textControl.value)),
]).pipe(
    map(([original, current]) => current !== original),
    distinctUntilChanged(),
    shareReplay(1),
);

// Template
@let isDirty = state.isDirty$ | async;
@if (isDirty) { ... }
```

### 3. Dialog Components

Use Angular Material dialogs with typed data interfaces:

```typescript
export interface MyDialogData {
    mode: "create" | "edit";
    name?: string;
}

export interface MyDialogResult {
    action: "save" | "cancel";
    name: string;
}

@Component({
    template: `...`,
    imports: [MatDialogModule, FormsModule, ...],
})
export class MyDialogComponent {
    constructor(
        private dialogRef: MatDialogRef<MyDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MyDialogData,
    ) {}
}

// Usage
const dialogRef = this.dialog.open(MyDialogComponent, {
    width: "400px",
    data: { mode: "create" } as MyDialogData,
});

dialogRef.afterClosed().subscribe((result: MyDialogResult | undefined) => {
    if (result?.action === "save") { ... }
});
```

### 4. Snackbar Service

Use for user notifications:
```typescript
this.snackbar.success("Operation completed");  // Auto-dismiss after 4s
this.snackbar.warn("Warning message");         // Auto-dismiss after 4s
this.snackbar.info("Info message");            // Auto-dismiss after 4s
this.snackbar.errorPersistent("Error");        // Stays until dismissed
this.snackbar.warnPersistent("Warning");       // Stays until dismissed
```

Note: There is no `snackbar.error()` method - use `errorPersistent()` instead.

### 5. Tree Components

For nested folder/item trees, build a flat node structure with `parentId`:

```typescript
interface TreeNode {
    id: string;
    name: string;
    type: "folder" | "item";
    parentId: string | null;
    children?: TreeNode[];
    level: number;
}
```

Use `BehaviorSubject` for tree data and filter data separately for search:
```typescript
readonly treeData$ = new BehaviorSubject<TreeNode[]>([]);
readonly filteredTreeData$ = new BehaviorSubject<TreeNode[]>([]);
```

## Common Gotchas

### 1. BehaviorSubject Mutations
Always call `.next()` after mutating data. Don't rely on array/object mutation alone:

```typescript
// ❌ Bad - mutation without notification
this.items.push(newItem);

// ✅ Good - immutable update with notification
this._items$.next([...this._items$.value, newItem]);
```

### 2. FormControl Value Changes
When combining FormControl with other streams, include `startWith()`:

```typescript
combineLatest([
    this.someOther$,
    this.myControl.valueChanges.pipe(startWith(this.myControl.value)),
])
```

### 3. Change Detection
The project uses default change detection (not OnPush). However, prefer reactive patterns anyway for:
- Cleaner code
- Future-proofing for OnPush migration
- Predictable updates

### 4. API Error Handling
Use the `isApiErrorResponse()` type guard for TypeDB driver responses:

```typescript
import { isApiErrorResponse } from "@typedb/driver-http";

if (isApiErrorResponse(res)) {
    const errorMessage = res.err.message;
} else {
    const data = res.ok;
}
```

## File Naming Conventions

- Components: `feature-name.component.ts/html/scss`
- Services: `feature-name.service.ts`
- Models: `feature-name.ts` (in `concept/` directory)
- Dialogs: `feature-dialog.component.ts` (inline template is fine for simple dialogs)

## Styling

- Use SCSS with shared mixins from `styles/` directory
- Import colors, typography, shapes: `@use "colors";`
- Component styles use `:host` for host element styling
- Use `::ng-deep` sparingly for Material component overrides
