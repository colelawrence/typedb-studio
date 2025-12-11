/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Injectable } from "@angular/core";
import { ConnectionConfig, ConnectionJson } from "../concept/connection";
import {
    generateId,
    INITIAL_QUERY_HISTORY_DATA,
    INITIAL_SAVED_QUERIES_DATA,
    MAX_HISTORY_ENTRIES,
    parseQueryHistoryData,
    parseSavedQueriesData,
    QueryHistoryData,
    QueryHistoryEntry,
    QueryResultSummary,
    SavedQueriesData,
    SavedQuery,
    SavedQueryFolder,
    UNSORTED_FOLDER_ID,
} from "../concept/saved-query";
import { SchemaToolWindowState, SidebarState, sidebarStates, Tool, tools } from "../concept/view-state";
import { StorageService, StorageWriteResult } from "./storage.service";

function isObjectWithFields<FIELD extends string>(obj: unknown, fields: FIELD[]): obj is { [K in typeof fields[number]]: unknown } {
    return obj != null && typeof obj === "object" && fields.every(x => x in obj);
}

const VIEW_STATE = "viewState";

interface ViewStateData {
    sidebarState: SidebarState;
    lastUsedTool: Tool;
    schemaToolWindowState: SchemaToolWindowState;
}

const INITIAL_VIEW_STATE_DATA: ViewStateData = {
    sidebarState: "collapsed",
    lastUsedTool: "query",
    schemaToolWindowState: {
        linksVisibility: {
            sub: true,
            owns: true,
            plays: true,
            relates: true,
        },
        viewMode: "hierarchical",
        rootNodesCollapsed: {
            entities: false,
            relations: false,
            attributes: false,
        },
    },
};

function parseViewStateData(obj: Object | null): ViewStateData {
    return Object.assign({}, INITIAL_VIEW_STATE_DATA, obj) as ViewStateData;
}

class ViewState {

    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.readStorage() == null) {
            this.writeStorage(INITIAL_VIEW_STATE_DATA);
        }
    }

    private readStorage(): ViewStateData {
        if (!this.storage.isAccessible) return INITIAL_VIEW_STATE_DATA;
        return this.storage.read<ViewStateData>(VIEW_STATE, parseViewStateData);
    }

    private writeStorage(prefs: ViewStateData): StorageWriteResult {
        return this.storage.write(VIEW_STATE, prefs);
    }

    sidebarState(): SidebarState {
        const viewState = this.readStorage();
        return viewState?.sidebarState || INITIAL_VIEW_STATE_DATA.sidebarState;
    }

    setSidebarState(value: SidebarState) {
        const viewState = this.readStorage();
        viewState.sidebarState = value;
        this.writeStorage(viewState);
    }

    lastUsedTool(): Tool {
        const viewState = this.readStorage();
        return viewState.lastUsedTool || INITIAL_VIEW_STATE_DATA.lastUsedTool;
    }

    setLastUsedTool(value: Tool) {
        const viewState = this.readStorage();
        viewState.lastUsedTool = value;
        this.writeStorage(viewState);
    }

    lastUsedToolRoute(): string {
        const lastUsedTool = this.lastUsedTool();
        switch (lastUsedTool) {
            case "query": return "/query";
            case "explore": return "/explore";
            case "schema": return "/schema";
        }
    }

    schemaToolWindowState(): SchemaToolWindowState {
        const viewState = this.readStorage();
        return viewState.schemaToolWindowState || INITIAL_VIEW_STATE_DATA.schemaToolWindowState;
    }

    setSchemaToolWindowState(value: SchemaToolWindowState) {
        const viewState = this.readStorage();
        viewState.schemaToolWindowState = value;
        this.writeStorage(viewState);
    }
}

const CONNECTIONS = "connections";

const INITIAL_CONNECTIONS: ConnectionConfig[] = [];

class Connections {

    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.storage.read(CONNECTIONS, (obj) => obj as ConnectionJson[]) == null) {
            this.storage.write(CONNECTIONS, INITIAL_CONNECTIONS);
        }
    }

    findStartupConnection(): ConnectionConfig | null {
        return this.list().find(x => x.preferences.isStartupConnection) || null;
    }

    list(): ConnectionConfig[] {
        const data = this.storage.read(CONNECTIONS, (obj) => obj as ConnectionJson[]);
        if (!data) return [];
        // TODO: throw / optionally report on illegal JSON
        const connections = data.map(x => ConnectionConfig.fromJSONOrNull(x));
        if (connections.every(x => !!x)) return connections as ConnectionConfig[];
        else return [];
    }

    push(connection: ConnectionConfig): StorageWriteResult {
        const list = this.list();
        const connections = [connection, ...list.filter(x => x.url !== connection.url).slice(0, 9)];
        if (connection.preferences.isStartupConnection) {
            connections.slice(1).forEach(x => x.preferences.isStartupConnection = false);
        }
        return this.storage.write(CONNECTIONS, connections.map(x => x.toJSON()));
    }

    clearStartupConnection(): StorageWriteResult {
        const connections = this.list();
        connections.forEach(conn => conn.preferences.isStartupConnection = false);
        return this.storage.write(CONNECTIONS, connections.map(x => x.toJSON()));
    }
}

const PREFERENCES = "preferences";

interface PreferencesData {
    connections: {
        showAdvancedConfigByDefault: boolean;
    };
}

function parsePreferencesData(obj: Object | null): PreferencesData {
    return Object.assign({}, INITIAL_PREFERENCES, obj) as PreferencesData;
}

const INITIAL_PREFERENCES: PreferencesData = {
    connections: {
        showAdvancedConfigByDefault: true,
    }
};

class Preferences {

    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.readStorage() == null) {
            this.writeStorage(INITIAL_PREFERENCES);
        }
    }

    private readStorage(): PreferencesData {
        return this.storage.read(PREFERENCES, parsePreferencesData);
    }

    private writeStorage(prefs: PreferencesData): StorageWriteResult {
        return this.storage.write(PREFERENCES, prefs);
    }

    readonly connection = {
        showAdvancedConfigByDefault: () => {
            const prefs = this.readStorage();
            return prefs?.connections.showAdvancedConfigByDefault || INITIAL_PREFERENCES.connections.showAdvancedConfigByDefault;
        },
        setShowAdvancedConfigByDefault: (value: boolean) => {
            const prefs = this.readStorage()!;
            prefs.connections.showAdvancedConfigByDefault = value;
            return this.writeStorage(prefs);
        },
    };
}

const SAVED_QUERIES = "savedQueries";

class SavedQueries {

    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.readStorage() == null) {
            this.writeStorage(INITIAL_SAVED_QUERIES_DATA);
        }
    }

    private readStorage(): SavedQueriesData {
        if (!this.storage.isAccessible) return INITIAL_SAVED_QUERIES_DATA;
        return this.storage.read<SavedQueriesData>(SAVED_QUERIES, parseSavedQueriesData);
    }

    private writeStorage(data: SavedQueriesData): StorageWriteResult {
        return this.storage.write(SAVED_QUERIES, data);
    }

    listFolders(): SavedQueryFolder[] {
        return this.readStorage().folders;
    }

    listQueries(): SavedQuery[] {
        return this.readStorage().queries;
    }

    getQueryById(id: string): SavedQuery | undefined {
        return this.listQueries().find(q => q.id === id);
    }

    getFolderById(id: string): SavedQueryFolder | undefined {
        return this.listFolders().find(f => f.id === id);
    }

    createFolder(name: string, parentId: string | null = null): SavedQueryFolder {
        const data = this.readStorage();
        const now = new Date().toISOString();
        const folder: SavedQueryFolder = {
            id: generateId(),
            name,
            parentId,
            createdAt: now,
            updatedAt: now,
        };
        data.folders.push(folder);
        this.writeStorage(data);
        return folder;
    }

    updateFolder(id: string, updates: Partial<Pick<SavedQueryFolder, "name" | "parentId">>): SavedQueryFolder | null {
        const data = this.readStorage();
        const idx = data.folders.findIndex(f => f.id === id);
        if (idx === -1) return null;
        const folder = data.folders[idx];
        if (updates.name !== undefined) folder.name = updates.name;
        if (updates.parentId !== undefined) folder.parentId = updates.parentId;
        folder.updatedAt = new Date().toISOString();
        this.writeStorage(data);
        return folder;
    }

    deleteFolder(id: string, cascade: boolean = true): boolean {
        const data = this.readStorage();
        const idx = data.folders.findIndex(f => f.id === id);
        if (idx === -1) return false;

        if (cascade) {
            const descendantFolderIds = this.getDescendantFolderIds(id, data.folders);
            const allFolderIds = new Set([id, ...descendantFolderIds]);
            data.folders = data.folders.filter(f => !allFolderIds.has(f.id));
            data.queries = data.queries.filter(q => !q.folderId || !allFolderIds.has(q.folderId));
        } else {
            data.folders.splice(idx, 1);
            data.queries = data.queries.map(q =>
                q.folderId === id ? { ...q, folderId: null, updatedAt: new Date().toISOString() } : q
            );
        }

        this.writeStorage(data);
        return true;
    }

    private getDescendantFolderIds(parentId: string, folders: SavedQueryFolder[]): string[] {
        const children = folders.filter(f => f.parentId === parentId);
        const descendants: string[] = [];
        for (const child of children) {
            descendants.push(child.id);
            descendants.push(...this.getDescendantFolderIds(child.id, folders));
        }
        return descendants;
    }

    createQuery(params: { name: string; queryText: string; folderId?: string | null; description?: string }): SavedQuery {
        const data = this.readStorage();
        const now = new Date().toISOString();
        const query: SavedQuery = {
            id: generateId(),
            folderId: params.folderId ?? null,
            name: params.name,
            queryText: params.queryText,
            description: params.description,
            createdAt: now,
            updatedAt: now,
        };
        data.queries.push(query);
        this.writeStorage(data);
        return query;
    }

    updateQuery(id: string, updates: Partial<Pick<SavedQuery, "name" | "queryText" | "folderId" | "description">>): SavedQuery | null {
        const data = this.readStorage();
        const idx = data.queries.findIndex(q => q.id === id);
        if (idx === -1) return null;
        const query = data.queries[idx];
        if (updates.name !== undefined) query.name = updates.name;
        if (updates.queryText !== undefined) query.queryText = updates.queryText;
        if (updates.folderId !== undefined) query.folderId = updates.folderId;
        if (updates.description !== undefined) query.description = updates.description;
        query.updatedAt = new Date().toISOString();
        this.writeStorage(data);
        return query;
    }

    updateQueryLastRun(id: string, resultSummary: QueryResultSummary): SavedQuery | null {
        const data = this.readStorage();
        const idx = data.queries.findIndex(q => q.id === id);
        if (idx === -1) return null;
        const query = data.queries[idx];
        query.lastResultSummary = resultSummary;
        query.lastRunAt = new Date().toISOString();
        query.updatedAt = query.lastRunAt;
        this.writeStorage(data);
        return query;
    }

    deleteQuery(id: string): boolean {
        const data = this.readStorage();
        const idx = data.queries.findIndex(q => q.id === id);
        if (idx === -1) return false;
        data.queries.splice(idx, 1);
        this.writeStorage(data);
        return true;
    }

    createFolderWithId(id: string, name: string, parentId: string | null = null): SavedQueryFolder {
        const data = this.readStorage();
        const now = new Date().toISOString();
        const folder: SavedQueryFolder = {
            id,
            name,
            parentId,
            createdAt: now,
            updatedAt: now,
        };
        data.folders.push(folder);
        this.writeStorage(data);
        return folder;
    }

    createQueryWithId(params: { id: string; name: string; queryText: string; folderId?: string | null; description?: string }): SavedQuery {
        const data = this.readStorage();
        const now = new Date().toISOString();
        const query: SavedQuery = {
            id: params.id,
            folderId: params.folderId ?? null,
            name: params.name,
            queryText: params.queryText,
            description: params.description,
            createdAt: now,
            updatedAt: now,
        };
        data.queries.push(query);
        this.writeStorage(data);
        return query;
    }

    clearAll(): void {
        this.writeStorage(INITIAL_SAVED_QUERIES_DATA);
    }
}

const QUERY_HISTORY = "queryHistory";

class QueryHistory {

    constructor(private storage: StorageService) {
        if (this.storage.isAccessible && this.readStorage() == null) {
            this.writeStorage(INITIAL_QUERY_HISTORY_DATA);
        }
    }

    private readStorage(): QueryHistoryData {
        if (!this.storage.isAccessible) return INITIAL_QUERY_HISTORY_DATA;
        return this.storage.read<QueryHistoryData>(QUERY_HISTORY, parseQueryHistoryData);
    }

    private writeStorage(data: QueryHistoryData): StorageWriteResult {
        return this.storage.write(QUERY_HISTORY, data);
    }

    listEntries(): QueryHistoryEntry[] {
        return this.readStorage().entries;
    }

    addEntry(entry: Omit<QueryHistoryEntry, "id">): QueryHistoryEntry {
        const data = this.readStorage();
        const newEntry: QueryHistoryEntry = {
            ...entry,
            id: generateId(),
        };
        data.entries.unshift(newEntry);
        if (data.entries.length > MAX_HISTORY_ENTRIES) {
            data.entries = data.entries.slice(0, MAX_HISTORY_ENTRIES);
        }
        this.writeStorage(data);
        return newEntry;
    }

    deleteEntry(id: string): boolean {
        const data = this.readStorage();
        const idx = data.entries.findIndex(e => e.id === id);
        if (idx === -1) return false;
        data.entries.splice(idx, 1);
        this.writeStorage(data);
        return true;
    }

    clearHistory(): void {
        const data = this.readStorage();
        data.entries = [];
        this.writeStorage(data);
    }

    getLastQueryForDb(dbId: string): string | null {
        const data = this.readStorage();
        return data.lastQueryByDb[dbId] ?? null;
    }

    setLastQueryForDb(dbId: string, queryText: string): void {
        const data = this.readStorage();
        data.lastQueryByDb[dbId] = queryText;
        this.writeStorage(data);
    }
}

@Injectable({
    providedIn: "root",
})
export class AppData {

    readonly isAccessible = this.storage.isAccessible;

    readonly viewState = new ViewState(this.storage);
    readonly connections = new Connections(this.storage);
    readonly preferences = new Preferences(this.storage);
    readonly savedQueries = new SavedQueries(this.storage);
    readonly queryHistory = new QueryHistory(this.storage);

    constructor(private storage: StorageService) {
    }
}
