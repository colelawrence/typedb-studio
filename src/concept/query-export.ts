/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

interface RawData {
    $schema?: unknown;
    version?: unknown;
    exportedAt?: unknown;
    source?: unknown;
    folders?: unknown;
    queries?: unknown;
}

export function parseExportedQueriesFile(json: unknown): ExportedQueriesFile {
    if (!json || typeof json !== "object") {
        throw new ValidationError("Invalid JSON structure");
    }

    const data = json as RawData;

    if (data.version !== EXPORT_VERSION) {
        throw new ValidationError(`Unsupported version: ${data.version}. Expected: ${EXPORT_VERSION}`);
    }

    if (!Array.isArray(data.queries)) {
        throw new ValidationError("Missing or invalid 'queries' array");
    }

    const folders: ExportedFolder[] = [];
    if (data.folders !== undefined) {
        if (!Array.isArray(data.folders)) {
            throw new ValidationError("Invalid 'folders' field: expected array");
        }
        for (const folder of data.folders) {
            folders.push(validateFolder(folder));
        }
    }

    const queries: ExportedQuery[] = [];
    for (const query of data.queries) {
        queries.push(validateQuery(query));
    }

    const folderIds = new Set(folders.map(f => f.id));
    for (const query of queries) {
        if (query.folderId && !folderIds.has(query.folderId)) {
            throw new ValidationError(`Query "${query.name}" references unknown folder: ${query.folderId}`);
        }
    }

    for (const folder of folders) {
        if (folder.parentId && !folderIds.has(folder.parentId)) {
            throw new ValidationError(`Folder "${folder.name}" references unknown parent folder: ${folder.parentId}`);
        }
    }

    validateNoCircularFolderReferences(folders);

    return {
        $schema: typeof data.$schema === "string" ? data.$schema : undefined,
        version: EXPORT_VERSION,
        exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
        source: validateSource(data.source),
        folders,
        queries,
    };
}

interface RawFolder {
    id?: unknown;
    name?: unknown;
    parentId?: unknown;
}

function validateFolder(obj: unknown): ExportedFolder {
    if (!obj || typeof obj !== "object") {
        throw new ValidationError("Invalid folder structure");
    }
    const folder = obj as RawFolder;

    if (typeof folder.id !== "string" || !folder.id.trim()) {
        throw new ValidationError("Folder missing required 'id' field");
    }
    if (typeof folder.name !== "string" || !folder.name.trim()) {
        throw new ValidationError(`Folder "${folder.id}" missing required 'name' field`);
    }

    return {
        id: folder.id,
        name: folder.name,
        parentId: typeof folder.parentId === "string" ? folder.parentId : null,
    };
}

interface RawQuery {
    id?: unknown;
    name?: unknown;
    queryText?: unknown;
    description?: unknown;
    folderId?: unknown;
}

function validateQuery(obj: unknown): ExportedQuery {
    if (!obj || typeof obj !== "object") {
        throw new ValidationError("Invalid query structure");
    }
    const query = obj as RawQuery;

    if (typeof query.id !== "string" || !query.id.trim()) {
        throw new ValidationError("Query missing required 'id' field");
    }
    if (typeof query.name !== "string" || !query.name.trim()) {
        throw new ValidationError(`Query "${query.id}" missing required 'name' field`);
    }
    if (typeof query.queryText !== "string") {
        throw new ValidationError(`Query "${query.name}" missing required 'queryText' field`);
    }

    return {
        id: query.id,
        name: query.name,
        queryText: query.queryText,
        description: typeof query.description === "string" ? query.description : undefined,
        folderId: typeof query.folderId === "string" ? query.folderId : null,
    };
}

interface RawSource {
    appName?: unknown;
    appVersion?: unknown;
}

function validateSource(obj: unknown): ExportedQueriesFile["source"] | undefined {
    if (!obj || typeof obj !== "object") {
        return undefined;
    }
    const source = obj as RawSource;
    if (typeof source.appName === "string" && typeof source.appVersion === "string") {
        return { appName: source.appName, appVersion: source.appVersion };
    }
    return undefined;
}

function validateNoCircularFolderReferences(folders: ExportedFolder[]): void {
    const folderMap = new Map(folders.map(f => [f.id, f]));

    for (const folder of folders) {
        const visited = new Set<string>();
        let current: ExportedFolder | undefined = folder;

        while (current) {
            if (visited.has(current.id)) {
                throw new ValidationError(`Circular folder reference detected: ${folder.name}`);
            }
            visited.add(current.id);
            current = current.parentId ? folderMap.get(current.parentId) : undefined;
        }
    }
}
