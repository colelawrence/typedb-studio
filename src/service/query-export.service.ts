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
import { SavedQueriesData } from "../concept/saved-query";
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
}
