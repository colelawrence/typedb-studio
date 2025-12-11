# Variable System with Autocomplete - Implementation Plan

**Feature**: Dynamic variables in TypeQL queries with autocomplete triggered by `{{`  
**Priority**: Medium  
**Status**: Planning  
**Related**: [FEATURE-IDEAS.md](../FEATURE-IDEAS.md#3-variable-system-with-autocomplete)

---

## Overview

Implement a Handlebars-style variable system that allows users to:
1. Reference user-defined variables in queries
2. Use built-in helpers (UUID, timestamp, etc.)
3. Chain results from previous queries
4. Get autocomplete suggestions when typing `{{`

### Current State

- Query editor uses CodeMirror via `@acrodata/code-editor`
- TypeQL autocomplete exists in `src/framework/codemirror-lang-typeql/`
- `SavedQuery` has reserved fields: `variablesSchema`, `lastVariablesUsed`
- No Handlebars library currently in dependencies

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Query Page Component                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │  Code Editor    │   │ Variables Panel │   │ Variable Picker  │  │
│  │  (CodeMirror)   │   │ (user values)   │   │ Dialog           │  │
│  └────────┬────────┘   └────────┬────────┘   └──────────────────┘  │
└───────────┼─────────────────────┼──────────────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Variable Autocomplete Extension                   │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │ Trigger on `{{` │   │ Variable Source │   │ Template         │  │
│  │ and helpers     │   │ Registry        │   │ Processor        │  │
│  └────────┬────────┘   └────────┬────────┘   └────────┬─────────┘  │
│           │                     │                      │            │
│           └─────────────────────┴──────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Variable Sources                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ User-Defined │  │ Built-in     │  │ Environment  │  │ Response│ │
│  │ Variables    │  │ Helpers      │  │ Variables    │  │ Chaining│ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/framework/codemirror-handlebars/` | **Create** | New module for Handlebars autocomplete |
| `src/framework/codemirror-handlebars/index.ts` | **Create** | Extension entry point |
| `src/framework/codemirror-handlebars/complete.ts` | **Create** | `{{` trigger detection and completion |
| `src/framework/codemirror-handlebars/helpers.ts` | **Create** | Built-in helper definitions |
| `src/service/variable-state.service.ts` | **Create** | Variable registry service |
| `src/concept/variables.ts` | **Create** | Variable type definitions |
| `src/service/template-processor.service.ts` | **Create** | Handlebars template evaluation |
| `src/framework/code-editor/code-editor.component.ts` | **Modify** | Add handlebars extension |
| `src/service/query-page-state.service.ts` | **Modify** | Process templates before execution |
| `src/concept/saved-query.ts` | **Modify** | Define `variablesSchema` structure |

---

## Variable Sources

### 1. User-Defined Variables
Variables set by the user for the current session or saved with queries.

```typescript
interface UserVariable {
  name: string;
  value: string | number | boolean;
  type: "string" | "number" | "boolean";
  description?: string;
}
```

### 2. Built-in Helpers
Template functions that generate dynamic values:

| Helper | Syntax | Output Example |
|--------|--------|----------------|
| UUID | `{{uuid}}` | `a1b2c3d4-e5f6-...` |
| Timestamp | `{{timestamp}}` | `1702300800000` |
| ISO Date | `{{isoDate}}` | `2024-12-11T00:00:00Z` |
| Date | `{{date "YYYY-MM-DD"}}` | `2024-12-11` |
| Random Int | `{{randomInt 1 100}}` | `42` |

### 3. Environment Variables
Connection-specific variables from the Environments feature (future):

```typescript
interface EnvironmentVariable {
  name: string;
  value: string;
  source: "global" | "environment";
  isSecret: boolean;
}
```

### 4. Response Chaining (Future)
Reference results from previous query executions:

```typescript
// Reference format: {{response "queryId" "$.path.to.value"}}
{{response "get-user" "$.id"}}
```

---

## Gate 1: Core Infrastructure

**Goal**: Create the variable system foundation without UI integration

### Tasks

- [ ] **1.1** Create `src/concept/variables.ts`
  - Define `Variable`, `VariableSource`, `VariableValue` interfaces
  - Define `VariablesSchema` type for saved queries
  - Export type guards and utility functions

- [ ] **1.2** Create `src/service/variable-state.service.ts`
  - Injectable Angular service with `providedIn: "root"`
  - `BehaviorSubject<Variable[]>` for reactive variable list
  - Methods: `getVariables()`, `setVariable()`, `removeVariable()`, `clearSession()`
  - Persist session variables to localStorage via `StorageService`

- [ ] **1.3** Create `src/service/template-processor.service.ts`
  - Process Handlebars templates synchronously
  - Implement without external library (simple regex-based for v1)
  - Method: `process(template: string, variables: Record<string, unknown>): string`
  - Handle missing variables gracefully (leave as `{{varName}}` or error)

- [ ] **1.4** Create `src/framework/codemirror-handlebars/helpers.ts`
  - Define `BuiltinHelper` interface
  - Implement: `uuid`, `timestamp`, `isoDate`, `date`, `randomInt`
  - Export `BUILTIN_HELPERS` array with metadata for autocomplete

### Verification

```bash
pnpm run build
```

- [ ] All new files compile without errors
- [ ] No circular dependencies
- [ ] Can import `VariableState` and `TemplateProcessor` in existing services

---

## Gate 2: CodeMirror Autocomplete Extension

**Goal**: Implement `{{` triggered autocomplete in the editor

### Tasks

- [ ] **2.1** Create `src/framework/codemirror-handlebars/index.ts`
  - Export `handlebarsAutocompleteExtension()` function
  - Return CodeMirror `Extension` with autocomplete config

- [ ] **2.2** Create `src/framework/codemirror-handlebars/complete.ts`
  - Detect when cursor follows `{{` pattern
  - Parse partial helper/variable names (e.g., `{{tim` → "tim")
  - Create `CompletionResult` with variable and helper suggestions
  - Style completions with appropriate icons (variable vs helper)

- [ ] **2.3** Integrate with existing TypeQL autocomplete
  - Modify `src/framework/code-editor/code-editor.component.ts`
  - Add `handlebarsAutocompleteExtension()` to extensions array
  - Ensure both completions can coexist (TypeQL + Handlebars)

- [ ] **2.4** Add syntax highlighting for `{{...}}`
  - Create or extend theme in `src/framework/code-editor/theme.ts`
  - Highlight `{{` and `}}` delimiters
  - Highlight variable names within delimiters

### Verification

```bash
pnpm run build
pnpm start
```

- [ ] Type `{{` in query editor → autocomplete popup appears
- [ ] Shows built-in helpers (uuid, timestamp, etc.)
- [ ] Shows user-defined variables (if any)
- [ ] Selecting completion inserts `{{helperName}}`
- [ ] TypeQL autocomplete still works outside `{{...}}`

---

## Gate 3: Template Processing Integration

**Goal**: Process templates before query execution

### Tasks

- [ ] **3.1** Modify `query-page-state.service.ts`
  - Inject `TemplateProcessor` and `VariableState`
  - In `runQuery()`, process template before passing to driver
  - Show processed query in log output (not raw template)

- [ ] **3.2** Handle processing errors
  - Catch template errors (unknown variable, helper error)
  - Show user-friendly error via `SnackbarService`
  - Don't execute malformed queries

- [ ] **3.3** Add "Show Processed Query" option
  - Allow users to preview the resolved query before running
  - Consider adding to query log output

### Verification

```bash
pnpm run build
pnpm start
```

- [ ] Query with `{{uuid}}` executes with generated UUID
- [ ] Query with `{{timestamp}}` uses current timestamp
- [ ] Unknown variable `{{unknownVar}}` shows error
- [ ] Log output shows resolved values

---

## Gate 4: Variables Panel UI

**Goal**: Allow users to define and manage variables

### Tasks

- [ ] **4.1** Create `src/module/query/variables-panel/` component
  - Display current variables in a list
  - Add/edit/delete variable actions
  - Show variable type indicator

- [ ] **4.2** Create variable edit dialog
  - Form fields: name, value, type
  - Validation: name must be valid identifier
  - Preview of how variable will appear in queries

- [ ] **4.3** Integrate panel into query page
  - Add collapsible panel (similar to saved queries sidebar)
  - Toggle button in toolbar
  - Persist panel state

- [ ] **4.4** Connect to autocomplete
  - User variables appear in `{{` autocomplete
  - Show variable value in completion tooltip

### Verification

```bash
pnpm run build
pnpm start
```

- [ ] Can add a variable `myId = "abc123"`
- [ ] Variable appears in `{{` autocomplete
- [ ] Query with `{{myId}}` resolves to `abc123`
- [ ] Deleting variable removes from autocomplete

---

## Gate 5: Saved Query Variables

**Goal**: Persist variables with saved queries

### Tasks

- [ ] **5.1** Define `variablesSchema` structure in `saved-query.ts`
  ```typescript
  interface VariablesSchema {
    variables: Array<{
      name: string;
      type: "string" | "number" | "boolean";
      defaultValue?: string;
      description?: string;
      required?: boolean;
    }>;
  }
  ```

- [ ] **5.2** Modify save query dialog
  - Detect variables used in query text (scan for `{{varName}}`)
  - Allow setting default values for detected variables
  - Save schema with query

- [ ] **5.3** Modify load query flow
  - When loading saved query, prompt for variable values
  - Pre-fill with `lastVariablesUsed` if available
  - Update `lastVariablesUsed` after execution

- [ ] **5.4** Add variable prompt dialog
  - Modal shown when loading query with required variables
  - Form generated from `variablesSchema`
  - "Run with defaults" and "Run with values" options

### Verification

```bash
pnpm run build
pnpm start
```

- [ ] Save query with `{{customerId}}` → prompted to define variable
- [ ] Load saved query → prompted for `customerId` value
- [ ] Running query uses provided value
- [ ] `lastVariablesUsed` persists across sessions

---

## Gate 6: Polish & Edge Cases

**Goal**: Handle edge cases and improve UX

### Tasks

- [ ] **6.1** Escape sequences
  - Support `\{{` to output literal `{{`
  - Document escape syntax

- [ ] **6.2** Nested helpers (if needed)
  ```
  {{date (timestamp)}}  // Future consideration
  ```

- [ ] **6.3** Error recovery
  - Graceful handling of malformed templates
  - Inline error markers in editor
  - Clear error messages

- [ ] **6.4** Performance
  - Debounce autocomplete on rapid typing
  - Cache compiled template patterns
  - Ensure no lag in large queries

- [ ] **6.5** Documentation
  - Add help tooltip explaining variable syntax
  - Document all built-in helpers
  - Add examples to variable panel

### Verification

```bash
pnpm run build
pnpm start
```

- [ ] `\{{notAVariable}}` outputs literal `{{notAVariable}}`
- [ ] Large query with many variables performs well
- [ ] Clear error when helper receives wrong arguments

---

## Future Enhancements (Out of Scope)

These are documented for future consideration but not part of this implementation:

1. **Response Chaining** - Reference previous query results
2. **Environment Integration** - Variables per connection/environment
3. **Secret Variables** - Masked values that don't appear in logs
4. **Custom Helpers** - User-defined JavaScript helpers
5. **Helper Arguments** - `{{date "YYYY-MM-DD" offset=-1d}}`

---

## Technical Notes

### CodeMirror Integration Pattern

The existing TypeQL autocomplete uses `NodePrefixAutoComplete` which climbs the syntax tree. For Handlebars completion, we need a simpler text-based approach:

```typescript
// In complete.ts
function handlebarsComplete(context: CompletionContext): CompletionResult | null {
  // Look backwards for {{ pattern
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);
  const match = textBefore.match(/\{\{(\w*)$/);
  
  if (!match) return null;
  
  const prefix = match[1];
  const from = context.pos - prefix.length;
  
  return {
    from,
    options: getVariableCompletions(prefix),
    validFor: /^\w*$/,
  };
}
```

### Coexisting with TypeQL Autocomplete

Use `autocompletion` with multiple sources:

```typescript
// In code-editor.component.ts
autocompletion({
  override: [
    typeqlAutocomplete,
    handlebarsAutocomplete,
  ],
})
```

CodeMirror merges results from all sources when both trigger.

### Template Processing Strategy

For v1, use simple string replacement without a full Handlebars library:

```typescript
function processTemplate(template: string, context: VariableContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (context.variables[name] !== undefined) {
      return String(context.variables[name]);
    }
    if (BUILTIN_HELPERS[name]) {
      return BUILTIN_HELPERS[name]();
    }
    throw new TemplateError(`Unknown variable: ${name}`);
  });
}
```

Consider adding `handlebars` package later if advanced features (conditionals, loops) are needed.

---

## Dependencies

No new npm dependencies required for initial implementation. If advanced templating needed later:

```bash
pnpm add handlebars
pnpm add -D @types/handlebars
```

---

## Acceptance Criteria

1. ✅ User can type `{{` and see autocomplete with available variables/helpers
2. ✅ Built-in helpers (uuid, timestamp) work out of the box
3. ✅ User can define custom variables and use them in queries
4. ✅ Saved queries can include variable definitions
5. ✅ Loading a saved query prompts for variable values
6. ✅ Template processing happens transparently before query execution
7. ✅ TypeQL autocomplete continues to work normally
8. ✅ Clear error messages for invalid templates
