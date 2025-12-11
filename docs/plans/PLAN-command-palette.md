# Command Palette Implementation Plan

**Status**: Draft  
**Priority**: Medium (from FEATURE-IDEAS.md)  
**Estimated Effort**: 3-5 days

## Overview

Implement a VS Code-style command palette accessible via `Cmd+K` / `Ctrl+K` that provides keyboard-driven access to all application actions.

## Architecture

### Command Registry Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     CommandPaletteService                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │ CommandRegistry │  │ FuzzySearchEngine│  │ ShortcutManager│  │
│  │  - commands[]   │  │  - search()      │  │  - register() │   │
│  │  - register()   │  │  - rank()        │  │  - unregister()│  │
│  │  - unregister() │  │                  │  │               │   │
│  └─────────────────┘  └──────────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CommandPaletteComponent (Dialog)               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🔍 [Search input with autocomplete]                        ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │  📁 Query Commands                                          ││
│  │    ▶ Run Query                              ⌘+Enter         ││
│  │    💾 Save Query                                            ││
│  │    📋 Save Query As...                                      ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  🔌 Connection                                              ││
│  │    🔗 Connect to Server...                                  ││
│  │    🔌 Disconnect                                            ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  🗄️ Database                                                ││
│  │    📂 Select Database...                                    ││
│  │    ➕ Create Database...                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

```typescript
// src/concept/command.ts

export interface Command {
    /** Unique identifier (e.g., "query.run", "database.create") */
    id: string;
    
    /** Display label shown in palette */
    label: string;
    
    /** Category for grouping (Query, Connection, Database, Navigation, etc.) */
    category: CommandCategory;
    
    /** Optional keyboard shortcut (display only - actual binding elsewhere) */
    shortcut?: string;
    
    /** Icon identifier (Material Icon name) */
    icon?: string;
    
    /** Function to execute when command is selected */
    execute: () => void;
    
    /** Observable or function returning whether command is currently available */
    isEnabled?: () => boolean | Observable<boolean>;
    
    /** Optional keywords for improved search matching */
    keywords?: string[];
    
    /** Visibility: always, when-connected, when-database-selected, etc. */
    when?: CommandContext;
}

export type CommandCategory = 
    | "query"
    | "connection" 
    | "database"
    | "transaction"
    | "navigation"
    | "schema"
    | "user"
    | "view"
    | "help";

export type CommandContext = 
    | "always"
    | "connected"
    | "disconnected"
    | "database-selected"
    | "transaction-open"
    | "query-page";

export interface CommandMatch {
    command: Command;
    score: number;
    matchedRanges: [number, number][]; // For highlighting matches
}
```

### File Structure

```
src/
├── concept/
│   └── command.ts                    # Command interface definitions
├── service/
│   └── command-palette.service.ts    # Registry + search logic
└── framework/
    └── command-palette/
        ├── index.ts
        ├── command-palette.component.ts
        ├── command-palette.component.html
        ├── command-palette.component.scss
        └── command-list-item.component.ts
```

---

## Implementation Gates

### Gate 1: Core Infrastructure
**Goal**: Service skeleton + global keyboard listener

#### Tasks
1. Create `src/concept/command.ts` with Command interface
2. Create `src/service/command-palette.service.ts` with:
   - `commands$: BehaviorSubject<Command[]>`
   - `registerCommand(command: Command): void`
   - `unregisterCommand(id: string): void`
   - `search(query: string): CommandMatch[]`
3. Add global `Cmd+K` / `Ctrl+K` listener in `RootComponent`
4. Log to console when triggered (placeholder for dialog)

#### Verification
- [ ] `pnpm run build` succeeds
- [ ] Pressing `Cmd+K` logs "Command palette triggered" to console
- [ ] Service is injectable and has correct typing

---

### Gate 2: Dialog Component (Empty Shell)
**Goal**: Modal opens/closes on keyboard shortcut

#### Tasks
1. Create `CommandPaletteComponent` using Angular Material Dialog
2. Follow existing dialog patterns (see `folder-dialog.component.ts`)
3. Include:
   - Search input with autofocus
   - Empty command list placeholder
   - Close on `Escape` or click outside
4. Wire `Cmd+K` to open dialog, second `Cmd+K` to close

#### Verification
- [ ] `pnpm run build` succeeds
- [ ] Dialog opens centered with overlay
- [ ] Search input is focused on open
- [ ] `Escape` closes dialog
- [ ] Clicking outside closes dialog
- [ ] Second `Cmd+K` closes dialog when open

---

### Gate 3: Fuzzy Search Implementation
**Goal**: Search commands with fuzzy matching and highlighting

#### Tasks
1. Implement fuzzy search algorithm in `command-palette.service.ts`:
   - Match against `label`, `keywords`, and `id`
   - Score by: exact match > prefix match > substring match > fuzzy
   - Return matched character ranges for highlighting
2. Add filtering in component:
   - Show all commands when input empty (grouped by category)
   - Filter and rank on each keystroke
   - Debounce input (50-100ms)

#### Fuzzy Search Algorithm
```typescript
// Simple but effective approach:
// 1. Exact prefix match: "run q" matches "Run Query" (high score)
// 2. Consecutive chars: "rq" matches "Run Query" (medium score)
// 3. All chars present in order: "rqy" matches "Run QueRY" (lower score)

function fuzzyMatch(query: string, target: string): { score: number; ranges: [number, number][] } | null {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Exact substring match
    const exactIndex = targetLower.indexOf(queryLower);
    if (exactIndex !== -1) {
        return {
            score: 100 - exactIndex, // Prefer matches at start
            ranges: [[exactIndex, exactIndex + query.length]]
        };
    }
    
    // Character-by-character fuzzy match
    let score = 0;
    let queryIdx = 0;
    let ranges: [number, number][] = [];
    let currentRange: [number, number] | null = null;
    
    for (let i = 0; i < target.length && queryIdx < query.length; i++) {
        if (targetLower[i] === queryLower[queryIdx]) {
            if (currentRange && currentRange[1] === i) {
                currentRange[1] = i + 1;
                score += 2; // Bonus for consecutive
            } else {
                if (currentRange) ranges.push(currentRange);
                currentRange = [i, i + 1];
                score += 1;
            }
            queryIdx++;
        }
    }
    
    if (currentRange) ranges.push(currentRange);
    if (queryIdx !== query.length) return null; // Not all chars matched
    
    return { score, ranges };
}
```

#### Verification
- [ ] Empty input shows all commands grouped by category
- [ ] Typing filters commands in real-time
- [ ] "run" matches "Run Query" first
- [ ] "rq" matches "Run Query" (fuzzy)
- [ ] Matched characters are highlighted in results
- [ ] No visible lag when typing

---

### Gate 4: Command Execution + Navigation
**Goal**: Execute commands and keyboard navigation

#### Tasks
1. Add keyboard navigation in dialog:
   - `↑` / `↓` to navigate results
   - `Enter` to execute selected command
   - Visual highlight on selected item
2. Execute command on click
3. Close dialog after execution
4. Handle commands that open other dialogs (don't double-close)

#### Verification
- [ ] Arrow keys navigate through results
- [ ] Selected item is visually highlighted
- [ ] `Enter` executes selected command
- [ ] Click executes clicked command  
- [ ] Dialog closes after execution
- [ ] Commands that open dialogs work correctly

---

### Gate 5: Register All Commands
**Goal**: Wire up all existing actions as commands

#### Command Categories to Register

##### Query Commands
| ID | Label | Shortcut | When |
|----|-------|----------|------|
| `query.run` | Run Query | `⌘+Enter` | query-page + text |
| `query.save` | Save Query Changes | | query-page + dirty |
| `query.saveAs` | Save Query As... | | query-page |
| `query.clear` | Clear Query Editor | | query-page |
| `query.clearChat` | Clear AI Chat | | query-page |

##### Connection Commands
| ID | Label | When |
|----|-------|------|
| `connection.connect` | Connect to Server... | disconnected |
| `connection.disconnect` | Disconnect | connected |
| `connection.signOut` | Sign Out | connected |

##### Database Commands
| ID | Label | When |
|----|-------|------|
| `database.select` | Select Database... | connected |
| `database.create` | Create Database... | connected |
| `database.refresh` | Refresh Database List | connected |

##### Transaction Commands
| ID | Label | When |
|----|-------|------|
| `transaction.open` | Open Transaction | database-selected |
| `transaction.commit` | Commit Transaction | transaction-open |
| `transaction.close` | Close Transaction | transaction-open |

##### Navigation Commands
| ID | Label | Shortcut |
|----|-------|----------|
| `nav.query` | Go to Query Tool | |
| `nav.schema` | Go to Schema Explorer | |
| `nav.users` | Go to User Management | |
| `nav.home` | Go to Home | |

##### View Commands
| ID | Label | When |
|----|-------|------|
| `view.toggleSidebar` | Toggle Sidebar | always |
| `view.outputLog` | Show Log Output | query-page |
| `view.outputTable` | Show Table Output | query-page |
| `view.outputGraph` | Show Graph Output | query-page |

##### Schema Commands
| ID | Label | When |
|----|-------|------|
| `schema.refresh` | Refresh Schema | schema-page |
| `schema.showText` | Show Schema Text | schema-page |

##### Saved Queries Commands
| ID | Label | When |
|----|-------|------|
| `savedQueries.create` | New Saved Query | query-page |
| `savedQueries.createFolder` | New Folder | query-page |

##### Help Commands
| ID | Label |
|----|-------|
| `help.about` | About TypeDB Studio |
| `help.docs` | Open Documentation |

#### Tasks
1. Create command registration in relevant components/services
2. Use `DestroyRef` for cleanup when components unmount
3. Commands with context conditions check `isEnabled` before executing
4. Store command definitions close to their implementation

#### Verification
- [ ] All commands appear in palette
- [ ] Disabled commands show as disabled (greyed)
- [ ] Commands correctly check their context (e.g., "Disconnect" only when connected)
- [ ] Executing each command performs expected action

---

### Gate 6: Polish + Accessibility
**Goal**: Production-ready UX

#### Tasks
1. **Styling**:
   - Match existing dialog styling (see `modal.component.scss`)
   - Category headers with subtle separators
   - Shortcut badges aligned right
   - Match highlight colors to accent color
2. **Accessibility**:
   - Proper ARIA roles (`role="listbox"`, `role="option"`)
   - `aria-activedescendant` for keyboard navigation
   - Screen reader announcements for result count
3. **Performance**:
   - Virtual scroll if >50 commands (unlikely needed initially)
   - Memoize search results
4. **Edge cases**:
   - Empty search results message
   - Prevent multiple dialogs from stacking
5. **Recently used**:
   - Track last 5 executed commands
   - Show at top of empty-query results

#### Verification
- [ ] Visually matches existing dialogs
- [ ] Keyboard-only navigation works completely
- [ ] Screen reader announces results
- [ ] "No results" shown for unmatched searches
- [ ] Recently used commands appear at top

---

## Technical Considerations

### OS-Aware Shortcuts
Use existing `detectOS()` from `src/framework/util/os.ts`:
```typescript
const modKey = detectOS() === "mac" ? "⌘" : "Ctrl";
```

### Preventing Conflicts
- `Cmd+K` may conflict with browser shortcuts in some contexts
- Use `event.preventDefault()` to capture
- Consider fallback `Cmd+Shift+P` (VS Code alternative)

### Dialog Stacking
When a command opens another dialog (e.g., "Create Database..."):
1. Close command palette first
2. Wait for close animation (~200ms)
3. Open target dialog

```typescript
this.dialogRef.afterClosed().subscribe(() => {
    // Open the target dialog after palette closes
    this.dialog.open(DatabaseCreateDialogComponent, { width: "400px" });
});
```

### Service Injection Pattern
Commands that need services should be registered where those services are available:

```typescript
// In QueryPageComponent or similar
constructor(private commands: CommandPaletteService) {
    this.commands.registerCommand({
        id: "query.run",
        label: "Run Query",
        category: "query",
        shortcut: detectOS() === "mac" ? "⌘+Enter" : "Ctrl+Enter",
        execute: () => this.runQuery(),
        isEnabled: () => this.state.runEnabled$,
    });
}

ngOnDestroy() {
    this.commands.unregisterCommand("query.run");
}
```

---

## Success Criteria

1. **Discoverability**: Users can find any action by typing related words
2. **Speed**: Palette opens instantly (<100ms), search feels instant
3. **Keyboard-first**: Complete workflow without touching mouse
4. **Consistency**: All major actions available through palette
5. **Shortcuts visible**: Users learn shortcuts by seeing them in palette

---

## Future Enhancements (Out of Scope)

- **Quick Open for saved queries**: `Cmd+P` to search saved query names
- **Recent files**: Track recently opened queries
- **Custom shortcuts**: User-configurable keybindings
- **Command arguments**: Commands with input (e.g., "Go to line...")
