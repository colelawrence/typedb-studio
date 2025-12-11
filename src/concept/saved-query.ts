/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export const UNSORTED_FOLDER_ID = "__unsorted__";

export interface SavedQueryFolder {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface QueryResultSummary {
    status: "success" | "error";
    rowCount: number;
    sampleRows: unknown[];
    truncated: boolean;
    errorMessage?: string;
    durationMs?: number;
}

export interface SavedQuery {
    id: string;
    folderId: string | null;
    name: string;
    queryText: string;
    description?: string;
    lastResultSummary?: QueryResultSummary | null;
    lastRunAt?: string | null;
    variablesSchema?: unknown | null;
    lastVariablesUsed?: unknown | null;
    createdAt: string;
    updatedAt: string;
}

export interface QueryHistoryEntry {
    id: string;
    dbId: string | null;
    connectionUrl: string | null;
    queryText: string;
    executedAt: string;
    status: "success" | "error";
    resultSummary?: QueryResultSummary | null;
}

export interface SavedQueriesData {
    folders: SavedQueryFolder[];
    queries: SavedQuery[];
}

export interface QueryHistoryData {
    entries: QueryHistoryEntry[];
    lastQueryByDb: Record<string, string>;
}

export const INITIAL_SAVED_QUERIES_DATA: SavedQueriesData = {
    folders: [],
    queries: [],
};

export const INITIAL_QUERY_HISTORY_DATA: QueryHistoryData = {
    entries: [],
    lastQueryByDb: {},
};

export const MAX_HISTORY_ENTRIES = 50;
export const MAX_SAMPLE_ROWS = 20;

export function parseSavedQueriesData(obj: unknown): SavedQueriesData {
    if (obj && typeof obj === "object") {
        const data = obj as Partial<SavedQueriesData>;
        return {
            folders: Array.isArray(data.folders) ? data.folders : [],
            queries: Array.isArray(data.queries) ? data.queries : [],
        };
    }
    return { ...INITIAL_SAVED_QUERIES_DATA };
}

export function parseQueryHistoryData(obj: unknown): QueryHistoryData {
    if (obj && typeof obj === "object") {
        const data = obj as Partial<QueryHistoryData>;
        return {
            entries: Array.isArray(data.entries) ? data.entries : [],
            lastQueryByDb: data.lastQueryByDb && typeof data.lastQueryByDb === "object"
                ? data.lastQueryByDb
                : {},
        };
    }
    return { ...INITIAL_QUERY_HISTORY_DATA };
}

export function generateId(): string {
    return crypto.randomUUID();
}

export function truncateResults(rows: unknown[], maxRows: number = MAX_SAMPLE_ROWS): { sampleRows: unknown[]; truncated: boolean } {
    if (rows.length <= maxRows) {
        return { sampleRows: rows, truncated: false };
    }
    return { sampleRows: rows.slice(0, maxRows), truncated: true };
}
