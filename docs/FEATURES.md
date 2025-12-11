# TypeDB Studio - Feature Specification

A concise catalog of UI features for porting to another framework.

---

## Application Structure

```
┌─────────────────────────────────────────────────────┐
│ Top Bar: Logo | Navigation | Connection Status      │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   Page Content                      │
│                                                     │
└─────────────────────────────────────────────────────┘

Routes: / (Home) | /connect | /query | /schema | /users
```

---

## Pages

### 1. Home (`/`)

Simple landing with navigation cards:
- "Connect to Server" card
- "Query" card
- "Schema" card
- Shows connection status

### 2. Connect (`/connect`)

**Connection Form:**
- Toggle: "Use connection URL" / "Use address and credentials"
- URL mode: Single input for `typedb://user:pass@http://host:port`
- Credentials mode: Address, Username, Password fields
- Auto-sync between modes (editing one updates the other)
- "Fill example" button
- Paste detection (pasting URL into any field auto-fills all)
- Safari warning for HTTP connections

**Saved Connections:**
- List of recent connections
- Click to auto-fill form

### 3. Query (`/query`)

**Layout:**
```
┌──────────────┬─────────────────────────────────────┐
│   Sidebar    │  Query Editor                       │
│   (resize)   │  ┌─────────────────────────────────┐│
│              │  │ [code|chat] [new][save][run]    ││
│ ┌──────────┐ │  ├─────────────────────────────────┤│
│ │ Schema   │ │  │ TypeQL code editor              ││
│ │ (collapse)│ │  │ - syntax highlighting           ││
│ └──────────┘ │  │ - autocomplete (schema-aware)   ││
│              │  │ - Cmd+Enter to run              ││
│ ┌──────────┐ │  └─────────────────────────────────┘│
│ │ Saved    │ │  Results                            │
│ │ Queries  │ │  ┌─────────────────────────────────┐│
│ │ (collapse)│ │  │ [log|table|graph|raw]          ││
│ └──────────┘ │  │                                 ││
│              │  │ Output content                  ││
│              │  └─────────────────────────────────┘│
│              │  History Bar (compact, expandable)  │
└──────────────┴─────────────────────────────────────┘
```

**Query Editor:**
- Toggle: Code mode / Chat mode (AI assistant)
- Header shows: "Query — [saved query name]*" (* = unsaved changes)
- Actions:
  - New scratch query (confirms if unsaved changes)
  - Save changes (only when editing saved query with changes)
  - Save as new query (opens dialog)
  - Run query (disabled until connected + database selected + has text)
- Keyboard: `Cmd/Ctrl+Enter` run, `Alt+Space` autocomplete, `Tab` indent

**Results Pane:**
- Output modes:
  - **Log**: Formatted text output with timestamps
  - **Table**: Sortable data table
  - **Graph**: Interactive node graph (pan/zoom/click)
  - **Raw**: JSON response
- Copy button on log output
- "Send to AI" button on log output

**Sidebar - Schema Section:**
- Collapsible
- Tree view of database schema:
  - Entities (expandable to show attributes, roles)
  - Relations (expandable to show attributes, roles, players)
  - Attributes
- Hover on entity/relation shows "play" button → generates fetch query
- View mode toggle: Flat / Hierarchical
- Link visibility toggles: sub | owns | plays | relates

**Sidebar - Saved Queries Section:**
- Collapsible
- Folder tree with queries
- Context menu on folder:
  - New Query
  - New Folder
  - Rename
  - Delete (confirms, cascades to children)
- Context menu on query:
  - Run
  - Rename
  - Move to folder
  - Duplicate
  - Delete
- Drag-drop to reorder/move (optional)
- Special "URL Imports" folder for shared queries

**History Bar:**
- Compact: Shows latest action with time, status (✓/✗), duration
- Click to expand: Full list of recent actions
- Click error icon to see error details

**Save Query Dialog:**
- Name (required)
- Description (optional)
- Folder select (with "New folder" option)

**Placeholder States:**
- No server: "Connect TypeDB server" button
- No database: "Select database" button

### 4. Schema (`/schema`)

**Layout:**
```
┌──────────────┬─────────────────────────────────────┐
│  Schema      │                                     │
│  Tree        │     Graph Visualization             │
│  (resize)    │     (force-directed layout)         │
│              │                                     │
│  [controls]  │     - Entities as rectangles        │
│  [tree]      │     - Relations as diamonds         │
│              │     - Attributes as ovals           │
│              │     - Lines showing relationships   │
│              │                                     │
└──────────────┴─────────────────────────────────────┘
```

**Schema Tree:**
- Same as query sidebar schema section
- Controls: View mode, link visibility toggles

**Graph:**
- Auto-layout using force-directed algorithm
- Pan and zoom
- Click node to highlight
- Hover for details

### 5. Users (`/users`)

**User List Table:**
- Columns: Username, Actions
- Actions per row: Edit password, Delete

**Create User Dialog:**
- Username field
- Password field
- Confirm password field

**Edit Password Dialog:**
- New password field
- Confirm password field

**Delete Confirmation:**
- "Are you sure you want to delete user X?"

---

## Global Components

### Database Selector
- Dropdown in top bar (when connected)
- Shows current database name
- List of available databases
- "Create new database" option at bottom

### Connection Status
- Shows in top bar
- States: Disconnected, Connecting..., Connected to [name]
- Click to disconnect (with confirmation if uncommitted changes)

### Snackbar/Toast Notifications
- Success (green): "Query saved", "Connected to X"
- Warning (yellow): "Cannot save empty query"
- Error (red, persistent): "Failed to connect: [reason]"

### Confirmation Dialogs
- Simple: Title, message, Cancel/Confirm buttons
- Strong: Requires typing confirmation text

---

## Data Persistence (localStorage)

**What's Saved:**
- Saved queries (folders + queries with text, description)
- Query history (last 50 entries with results summary)
- Connection list (last 10 connections)
- UI preferences:
  - Sidebar collapsed states
  - Schema tree view mode
  - Link visibility settings
  - Last used tool (query/schema)

**What's NOT Saved:**
- Passwords (only in memory during session)
- JWT tokens
- Current query text (unless explicitly saved)

---

## Import/Export

**Export Queries:**
- Export selection or all as JSON file
- Includes folders and queries with hierarchy

**Import from URL:**
- Hash format: `#share=<gzip+base64 encoded JSON>`
- Shows in sidebar under "URL Imports"
- Can save to local queries

**Share Query:**
- Generates shareable URL with query encoded in hash
- Size limit ~50KB

---

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Run query | `Cmd+Enter` | `Ctrl+Enter` |
| Autocomplete | `Alt+Space` | `Alt+Space` |
| Indent | `Tab` | `Tab` |

---

## States & Loading

**Connection States:**
- Disconnected → show connect prompt
- Connecting → show spinner
- Connected → show UI
- Reconnecting → show spinner with message

**Query States:**
- Idle → ready to run
- Running → show spinner, disable run button
- Success → show results
- Error → show error in log, highlight in red

**Resource Availability:**
- Ready → show content
- Loading → show spinner
- Failed → show error message with retry
