/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Injectable } from "@angular/core";
import {
    ExportedFolder,
    ExportedQueriesFile,
    ExportedQuery,
    EXPORT_VERSION,
    ImportResult,
    ImportStrategy,
    parseExportedQueriesFile,
    ValidationError,
} from "../concept/query-export";
import { SavedQueriesData, URL_IMPORTS_FOLDER_ID } from "../concept/saved-query";
import { AppData } from "./app-data.service";

const APP_NAME = "TypeDB Studio";
const APP_VERSION = "3.7.0";

@Injectable({
    providedIn: "root",
})
export class QueryExportService {
    constructor(private appData: AppData) {}

    exportQueries(): ExportedQueriesFile {
        const folders = this.appData.savedQueries.listFolders();
        const queries = this.appData.savedQueries.listQueries();
        return this.toExportFormat({ folders, queries });
    }

    private toExportFormat(data: SavedQueriesData): ExportedQueriesFile {
        const exportedFolders: ExportedFolder[] = data.folders.map(folder => ({
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
        }));

        const exportedQueries: ExportedQuery[] = data.queries.map(query => ({
            id: query.id,
            name: query.name,
            queryText: query.queryText,
            description: query.description,
            folderId: query.folderId,
        }));

        return {
            $schema: "https://typedb.com/studio/schemas/queries-v1.schema.json",
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            source: {
                appName: APP_NAME,
                appVersion: APP_VERSION,
            },
            folders: exportedFolders,
            queries: exportedQueries,
        };
    }

    downloadAsFile(filename?: string): void {
        const exportData = this.exportQueries();
        const jsonString = JSON.stringify(exportData, null, 2);

        const effectiveFilename = filename ?? this.generateFilename();
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = effectiveFilename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        URL.revokeObjectURL(url);
    }

    private generateFilename(): string {
        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `typedb-queries-${yyyy}-${mm}-${dd}.json`;
    }

    parseAndValidate(jsonString: string): ExportedQueriesFile {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            throw new ValidationError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
        }
        return parseExportedQueriesFile(parsed);
    }

    validateImport(data: unknown): ExportedQueriesFile {
        return parseExportedQueriesFile(data);
    }

    importQueries(data: ExportedQueriesFile, strategy: ImportStrategy): ImportResult {
        if (strategy === "replace") {
            return this.replaceImport(data);
        } else {
            return this.mergeImport(data);
        }
    }

    /**
     * Import queries from URL with importKey-based deduplication.
     * Items are placed under a folder inside "URL Imports" and deduplicated by importKey.
     */
    importFromUrl(data: ExportedQueriesFile, url: string): ImportResult {
        const result: ImportResult = {
            success: true,
            foldersAdded: 0,
            foldersUpdated: 0,
            queriesAdded: 0,
            queriesUpdated: 0,
            errors: [],
        };

        const importKey = data.importKey || this.generateImportKeyFromUrl(url);
        const importName = data.importName || this.extractNameFromUrl(url);

        this.appData.savedQueries.ensureUrlImportsFolder();

        this.appData.savedQueries.deleteByImportKey(importKey);

        const importFolderId = `__import_${importKey}__`;
        try {
            this.appData.savedQueries.createFolderWithImportKey({
                id: importFolderId,
                name: importName,
                parentId: URL_IMPORTS_FOLDER_ID,
                importKey,
            });
            result.foldersAdded++;
        } catch (e) {
            result.errors.push(`Failed to create import folder: ${e instanceof Error ? e.message : String(e)}`);
        }

        const folderIdMap = new Map<string, string>();
        folderIdMap.set("", importFolderId);

        const sortedFolders = this.topologicalSortFolders(data.folders);
        for (const folder of sortedFolders) {
            const newFolderId = `__import_${importKey}_${folder.id}__`;
            const parentId = folder.parentId
                ? folderIdMap.get(folder.parentId) ?? importFolderId
                : importFolderId;

            try {
                this.appData.savedQueries.createFolderWithImportKey({
                    id: newFolderId,
                    name: folder.name,
                    parentId,
                    importKey,
                });
                folderIdMap.set(folder.id, newFolderId);
                result.foldersAdded++;
            } catch (e) {
                result.errors.push(`Failed to import folder "${folder.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        for (const query of data.queries) {
            const folderId = query.folderId
                ? folderIdMap.get(query.folderId) ?? importFolderId
                : importFolderId;

            try {
                this.appData.savedQueries.createQueryWithImportKey({
                    name: query.name,
                    queryText: query.queryText,
                    description: query.description,
                    folderId,
                    importKey,
                });
                result.queriesAdded++;
            } catch (e) {
                result.errors.push(`Failed to import query "${query.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        result.success = result.errors.length === 0;
        return result;
    }

    private generateImportKeyFromUrl(url: string): string {
        try {
            const parsed = new URL(url);
            return `url:${parsed.host}${parsed.pathname}`;
        } catch {
            return `url:${url.slice(0, 100)}`;
        }
    }

    private extractNameFromUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const pathParts = parsed.pathname.split("/").filter(Boolean);
            const filename = pathParts[pathParts.length - 1] || "";

            const nameWithoutExt = filename.replace(/\.json$/i, "");
            if (nameWithoutExt) {
                return nameWithoutExt
                    .replace(/[-_]/g, " ")
                    .replace(/\b\w/g, c => c.toUpperCase());
            }

            return parsed.host;
        } catch {
            return "URL Import";
        }
    }

    private mergeImport(data: ExportedQueriesFile): ImportResult {
        const result: ImportResult = {
            success: true,
            foldersAdded: 0,
            foldersUpdated: 0,
            queriesAdded: 0,
            queriesUpdated: 0,
            errors: [],
        };

        const existingFolderIds = new Set(this.appData.savedQueries.listFolders().map(f => f.id));
        const existingQueryIds = new Set(this.appData.savedQueries.listQueries().map(q => q.id));

        const sortedFolders = this.topologicalSortFolders(data.folders);

        for (const importedFolder of sortedFolders) {
            try {
                if (existingFolderIds.has(importedFolder.id)) {
                    this.appData.savedQueries.updateFolder(importedFolder.id, {
                        name: importedFolder.name,
                        parentId: importedFolder.parentId,
                    });
                    result.foldersUpdated++;
                } else {
                    this.appData.savedQueries.createFolderWithId(
                        importedFolder.id,
                        importedFolder.name,
                        importedFolder.parentId
                    );
                    existingFolderIds.add(importedFolder.id);
                    result.foldersAdded++;
                }
            } catch (e) {
                result.errors.push(`Failed to import folder "${importedFolder.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        for (const importedQuery of data.queries) {
            try {
                if (existingQueryIds.has(importedQuery.id)) {
                    this.appData.savedQueries.updateQuery(importedQuery.id, {
                        name: importedQuery.name,
                        queryText: importedQuery.queryText,
                        description: importedQuery.description,
                        folderId: importedQuery.folderId,
                    });
                    result.queriesUpdated++;
                } else {
                    this.appData.savedQueries.createQueryWithId({
                        id: importedQuery.id,
                        name: importedQuery.name,
                        queryText: importedQuery.queryText,
                        description: importedQuery.description,
                        folderId: importedQuery.folderId,
                    });
                    existingQueryIds.add(importedQuery.id);
                    result.queriesAdded++;
                }
            } catch (e) {
                result.errors.push(`Failed to import query "${importedQuery.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        result.success = result.errors.length === 0;
        return result;
    }

    private replaceImport(data: ExportedQueriesFile): ImportResult {
        const result: ImportResult = {
            success: true,
            foldersAdded: 0,
            foldersUpdated: 0,
            queriesAdded: 0,
            queriesUpdated: 0,
            errors: [],
        };

        this.appData.savedQueries.clearAll();

        const sortedFolders = this.topologicalSortFolders(data.folders);

        for (const importedFolder of sortedFolders) {
            try {
                this.appData.savedQueries.createFolderWithId(
                    importedFolder.id,
                    importedFolder.name,
                    importedFolder.parentId
                );
                result.foldersAdded++;
            } catch (e) {
                result.errors.push(`Failed to import folder "${importedFolder.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        for (const importedQuery of data.queries) {
            try {
                this.appData.savedQueries.createQueryWithId({
                    id: importedQuery.id,
                    name: importedQuery.name,
                    queryText: importedQuery.queryText,
                    description: importedQuery.description,
                    folderId: importedQuery.folderId,
                });
                result.queriesAdded++;
            } catch (e) {
                result.errors.push(`Failed to import query "${importedQuery.name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        result.success = result.errors.length === 0;
        return result;
    }

    private topologicalSortFolders(folders: ExportedFolder[]): ExportedFolder[] {
        const sorted: ExportedFolder[] = [];
        const visited = new Set<string>();
        const folderMap = new Map(folders.map(f => [f.id, f]));

        const visit = (folder: ExportedFolder) => {
            if (visited.has(folder.id)) return;
            if (folder.parentId && folderMap.has(folder.parentId)) {
                const parent = folderMap.get(folder.parentId)!;
                visit(parent);
            }
            visited.add(folder.id);
            sorted.push(folder);
        };

        for (const folder of folders) {
            visit(folder);
        }

        return sorted;
    }

    exportFolder(folderId: string): ExportedQueriesFile {
        const allFolders = this.appData.savedQueries.listFolders();
        const allQueries = this.appData.savedQueries.listQueries();

        const folderIds = this.collectFolderAndDescendantIds(folderId, allFolders);
        const folders = allFolders.filter(f => folderIds.has(f.id));
        const queries = allQueries.filter(q => q.folderId && folderIds.has(q.folderId));

        const rootExportedFolders = folders.map(f => ({
            id: f.id,
            name: f.name,
            parentId: f.id === folderId ? null : f.parentId,
        }));

        return {
            $schema: "https://typedb.com/studio/schemas/queries-v1.schema.json",
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            source: {
                appName: APP_NAME,
                appVersion: APP_VERSION,
            },
            folders: rootExportedFolders,
            queries: queries.map(q => ({
                id: q.id,
                name: q.name,
                queryText: q.queryText,
                description: q.description,
                folderId: q.folderId,
            })),
        };
    }

    private collectFolderAndDescendantIds(folderId: string, allFolders: { id: string; parentId: string | null }[]): Set<string> {
        const result = new Set<string>([folderId]);
        const queue = [folderId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            for (const folder of allFolders) {
                if (folder.parentId === currentId && !result.has(folder.id)) {
                    result.add(folder.id);
                    queue.push(folder.id);
                }
            }
        }

        return result;
    }

    exportQuery(queryId: string): ExportedQueriesFile {
        const query = this.appData.savedQueries.getQueryById(queryId);
        if (!query) {
            throw new Error(`Query not found: ${queryId}`);
        }

        return {
            $schema: "https://typedb.com/studio/schemas/queries-v1.schema.json",
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            source: {
                appName: APP_NAME,
                appVersion: APP_VERSION,
            },
            folders: [],
            queries: [{
                id: query.id,
                name: query.name,
                queryText: query.queryText,
                description: query.description,
                folderId: null,
            }],
        };
    }

    downloadFolderAsFile(folderId: string, folderName: string): void {
        const exportData = this.exportFolder(folderId);
        const jsonString = JSON.stringify(exportData, null, 2);

        const safeName = folderName.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
        const filename = `typedb-queries-${safeName}-${this.getDateString()}.json`;

        this.triggerDownload(jsonString, filename);
    }

    downloadQueryAsFile(queryId: string, queryName: string): void {
        const exportData = this.exportQuery(queryId);
        const jsonString = JSON.stringify(exportData, null, 2);

        const safeName = queryName.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
        const filename = `typedb-query-${safeName}-${this.getDateString()}.json`;

        this.triggerDownload(jsonString, filename);
    }

    private getDateString(): string {
        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    private triggerDownload(content: string, filename: string): void {
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        URL.revokeObjectURL(url);
    }
}
