# Implementation Plan: Environments / Connection Presets

**Status**: Planning  
**Priority**: High  
**Related**: [FEATURE-IDEAS.md](../FEATURE-IDEAS.md#2-environments--connection-presets)

---

## Overview

Add an "Environments" system that allows users to:
1. Create named presets (dev, staging, prod) with connection configurations
2. Switch between environments with one click
3. Visually differentiate environments using color coding
4. Keep certain environment values private (never synced/exported)

### Key Design Decisions

1. **Environments wrap connections** — An environment is a named container that holds a connection configuration plus metadata (color, label, private values)
2. **Queries remain portable** — Saved queries are NOT tied to environments (existing architecture supports this)
3. **Environments are optional** — Users can continue using direct connections without environments (backward compatible)
4. **Private values stay local** — Sensitive data like passwords can be marked as "private" and excluded from any future export/sync features

---

## Architecture

### Data Model

```
┌─────────────────────────────────────────────────────────────┐
│                      AppData Service                         │
├─────────────────────────────────────────────────────────────┤
│  environments: Environments          (NEW)                   │
│  connections: Connections            (existing, unchanged)   │
│  viewState: ViewState                (existing)              │
│  savedQueries: SavedQueries          (existing)              │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Environment                             │
├─────────────────────────────────────────────────────────────┤
│  id: string                                                  │
│  name: string                      (e.g., "Production")      │
│  color: EnvironmentColor           (e.g., "red", "green")    │
│  connectionUrl: string             (typedb://...)            │
│  defaultDatabase?: string                                    │
│  isActive: boolean                 (only one active)         │
│  createdAt: string                 (ISO timestamp)           │
│  updatedAt: string                 (ISO timestamp)           │
└─────────────────────────────────────────────────────────────┘

EnvironmentColor = "default" | "green" | "yellow" | "red" | "blue" | "purple"
```

### Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `typeDBStudio.environments` | `EnvironmentsData` | List of environments + active environment ID |

### New Files

| Path | Purpose |
|------|---------|
| `src/concept/environment.ts` | Data models and JSON parsing |
| `src/service/app-data.service.ts` | Add `Environments` class (same pattern as `Connections`) |
| `src/module/environment/` | UI components for environment management |
| `src/module/connection/widget/` | Modify to show environment color indicator |

---

## Visual Design

### Environment Color Indicator

The connection widget will display a color strip or badge when an environment is active:

```
┌─────────────────────────────────────────────────────────────┐
│  [🔴 PROD]  user@server  ▸  my-database  │  Transaction...  │
└─────────────────────────────────────────────────────────────┘
     ▲
     └── Environment badge with color + label
```

### Color Palette (from existing `_colors.scss`)

| Environment Color | SCSS Variable | Hex | Use Case |
|-------------------|---------------|-----|----------|
| `default` | `$secondary-grey` | `#63607c` | Unassigned/local |
| `green` | `$green` | `#02dac9` | Development |
| `yellow` | `$secondary-yellow` | `#ffe49e` | Staging/QA |
| `red` | `$red` | `#e96464` | Production (⚠️ danger) |
| `blue` | `$secondary-blue` | `#7ba0ff` | Testing |
| `purple` | `$secondary-pink` | `#ff87dc` | Custom |

### Environment Selector UI

Add an environment dropdown in the connection widget that appears **before** the server name:

```
┌──────────────────────────────────────────────────────────────────┐
│ [▼ Production 🔴]  │  user@server ● ▸ database  │  Transaction   │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌────────────────────┐
    │ ✓ Production  🔴   │
    │   Staging     🟡   │
    │   Development 🟢   │
    ├────────────────────┤
    │ + New environment  │
    │   Manage...        │
    └────────────────────┘
```

---

## Implementation Gates

### Gate 1: Data Model & Persistence
**Goal**: Environment data can be saved and loaded from localStorage  
**Estimated effort**: 1-2 hours

#### Tasks
- [ ] Create `src/concept/environment.ts` with:
  - `Environment` interface
  - `EnvironmentColor` type
  - `EnvironmentsData` interface  
  - `parseEnvironmentsData()` function
  - `generateEnvironmentId()` function
- [ ] Add `Environments` class to `src/service/app-data.service.ts`:
  - `list()` — return all environments
  - `getById(id)` — return single environment
  - `getActive()` — return currently active environment or null
  - `create(params)` — create new environment
  - `update(id, updates)` — update environment
  - `delete(id)` — delete environment
  - `setActive(id | null)` — set active environment

#### Verification
- [ ] Open browser DevTools → Application → Local Storage
- [ ] Verify `typeDBStudio.environments` key exists after creating an environment
- [ ] Verify data persists after page refresh
- [ ] Verify `parseEnvironmentsData()` handles malformed/missing data gracefully

---

### Gate 2: Environment CRUD UI
**Goal**: Users can create, edit, and delete environments  
**Estimated effort**: 2-3 hours

#### Tasks
- [ ] Create `src/module/environment/environment-dialog.component.ts`:
  - Form fields: name, color (dropdown), connection URL
  - Mode: "create" or "edit"
  - Reuse connection URL validation from `ConnectionCreatorComponent`
- [ ] Create `src/module/environment/environment-manager.component.ts`:
  - List view of all environments
  - Edit/delete buttons per row
  - "New environment" button
  - Accessible via route `/environments` or dialog from connection widget

#### Verification
- [ ] Create environment "Production" with red color → appears in list
- [ ] Edit environment name → change persists
- [ ] Delete environment → removed from list and localStorage
- [ ] Form validation prevents empty name or invalid connection URL

---

### Gate 3: Environment Switching
**Goal**: Users can switch active environment, triggering connection change  
**Estimated effort**: 2-3 hours

#### Tasks
- [ ] Add `activeEnvironment$` BehaviorSubject to `DriverState` or create `EnvironmentState` service
- [ ] Modify `DriverState.tryConnect()` to optionally accept an environment ID
- [ ] When switching environments:
  1. Disconnect from current connection (if any)
  2. Parse connection URL from environment
  3. Connect to new server
  4. Select default database (if configured)
- [ ] Add environment selector dropdown to `ConnectionWidgetComponent`:
  - Shows active environment name + color
  - Dropdown lists all environments
  - Click switches environment

#### Verification
- [ ] Create two environments pointing to different servers
- [ ] Switch between them → connection changes
- [ ] Active environment persists after page refresh
- [ ] Switching environment with unsaved transaction prompts user

---

### Gate 4: Visual Differentiation
**Goal**: Active environment is clearly visible via color coding  
**Estimated effort**: 1-2 hours

#### Tasks
- [ ] Add `.environment-indicator` element to `connection-widget.component.html`:
  ```html
  @if (activeEnvironment$ | async; as env) {
    <span class="environment-indicator" [class]="env.color">
      {{ env.name }}
    </span>
  }
  ```
- [ ] Add SCSS styles in `connection-widget.component.scss`:
  ```scss
  .environment-indicator {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    
    &.red { background: rgba($red, 0.2); color: $red; }
    &.yellow { background: rgba($secondary-yellow, 0.2); color: $secondary-yellow; }
    &.green { background: rgba($green, 0.2); color: $green; }
    &.blue { background: rgba($secondary-blue, 0.2); color: $secondary-blue; }
    &.purple { background: rgba($secondary-pink, 0.2); color: $secondary-pink; }
    &.default { background: rgba($secondary-grey, 0.2); color: $secondary-grey; }
  }
  ```
- [ ] Consider adding subtle top border or background tint to entire page for "production" environment

#### Verification
- [ ] Set environment to red (production) → red badge visible
- [ ] Switch to green (dev) → green badge visible
- [ ] Badge is visible in condensed toolbar mode
- [ ] Color contrast is accessible (WCAG AA)

---

### Gate 5: Quick Connect from Environment
**Goal**: Connecting directly uses environment's stored connection URL  
**Estimated effort**: 1-2 hours

#### Tasks
- [ ] Modify `/connect` page to show environment quick-connect buttons
- [ ] When environment is selected on connect page:
  - Pre-fill connection form with environment's URL
  - OR directly connect (skip form)
- [ ] Add "Connect as [Environment Name]" button to environment list

#### Verification
- [ ] Go to `/connect` → see list of environments
- [ ] Click environment → connects without manual form entry
- [ ] Environment becomes active after successful connection

---

### Gate 6: Startup Environment
**Goal**: Optionally auto-connect to an environment on app launch  
**Estimated effort**: 1 hour

#### Tasks
- [ ] Add `isStartupEnvironment: boolean` to `Environment` interface
- [ ] On app init, check for startup environment:
  ```typescript
  const startupEnv = appData.environments.findStartupEnvironment();
  if (startupEnv) {
    driverState.tryConnectWithEnvironment(startupEnv.id).subscribe();
  }
  ```
- [ ] Add toggle in environment edit dialog: "Connect automatically on startup"
- [ ] Only one environment can be startup (same pattern as `ConnectionPreferences.isStartupConnection`)

#### Verification
- [ ] Set environment as startup → app auto-connects on refresh
- [ ] Disable startup → app shows connect page
- [ ] Setting new startup environment clears previous startup flag

---

### Gate 7: Private Values (Future Enhancement)
**Goal**: Mark sensitive values as private to exclude from export  
**Estimated effort**: 2-3 hours (defer to post-MVP)

#### Tasks
- [ ] Add `privateFields: string[]` to `Environment` interface
- [ ] When exporting (future feature), strip fields listed in `privateFields`
- [ ] UI toggle in environment dialog: "Keep password private"
- [ ] Store private values in separate localStorage key: `typeDBStudio.environments.private`

#### Verification
- [ ] Mark password as private → still works locally
- [ ] Export (when implemented) → password field is empty/placeholder
- [ ] Import with missing private values → prompts user to fill in

---

## Migration Strategy

### Backward Compatibility

Existing `connections` storage is **not migrated** to environments. Users can:
1. Continue using direct connections as before
2. Optionally create environments that wrap their saved connections
3. No data loss — `connections` storage key remains unchanged

### Future: Auto-Migration Prompt

After environments feature is stable, consider prompting:
> "Would you like to convert your saved connections to environments?"

This would:
1. Create an environment for each saved connection
2. Set colors based on heuristics (name contains "prod" → red)
3. Preserve original connections as fallback

---

## File Structure Summary

```
src/
├── concept/
│   ├── connection.ts           (existing, unchanged)
│   └── environment.ts          (NEW)
├── service/
│   └── app-data.service.ts     (add Environments class)
├── module/
│   ├── connection/
│   │   └── widget/
│   │       ├── connection-widget.component.ts    (modify)
│   │       ├── connection-widget.component.html  (modify)
│   │       └── connection-widget.component.scss  (modify)
│   └── environment/                              (NEW directory)
│       ├── environment-dialog.component.ts
│       ├── environment-dialog.component.html
│       ├── environment-dialog.component.scss
│       ├── environment-manager.component.ts
│       ├── environment-manager.component.html
│       └── environment-manager.component.scss
```

---

## Open Questions

1. **Should environments support variables?** (e.g., `{{DB_NAME}}` in connection URL)
   - Defer to Variable System feature (separate plan)

2. **How to handle environment in URL?** 
   - Consider: `?env=production` to auto-select environment on page load
   - Useful for sharing links with team

3. **Should we show a confirmation when switching to production?**
   - Consider: "You're switching to PRODUCTION. Continue?" dialog

4. **Where should "Manage Environments" live?**
   - Option A: Dedicated `/environments` route
   - Option B: Dialog accessible from connection widget menu
   - **Recommendation**: Start with dialog (B), add route later if needed

---

## Success Criteria

- [ ] User can create 3+ environments (dev, staging, prod)
- [ ] Switching environments connects to correct server in <2 seconds
- [ ] Environment color is visible at all times when connected
- [ ] No regression in existing connection workflow
- [ ] Works in both web and Tauri builds
- [ ] Environments persist across browser sessions
