/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Injectable } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { IMPORT_URL } from "../framework/util/url-params";
import {
    ImportDialogComponent,
    ImportDialogData,
    ImportDialogResult,
} from "../module/query/saved-queries-window/import-dialog.component";
import { QueryExportService } from "./query-export.service";
import { SnackbarService } from "./snackbar.service";
import { UrlShareService } from "./url-share.service";
import { AppData } from "./app-data.service";
import { QueryPageState } from "./query-page-state.service";
import { ExportedQuery } from "../concept/query-export";

@Injectable({
    providedIn: "root",
})
export class QueryImportUrlService {
    constructor(
        private dialog: MatDialog,
        private router: Router,
        private queryExportService: QueryExportService,
        private snackbar: SnackbarService,
        private urlShareService: UrlShareService,
        private appData: AppData,
        private queryPageState: QueryPageState,
    ) {}

    checkAndHandleImportParam(): boolean {
        const url = this.extractImportUrl();
        if (!url) return false;

        const validationError = this.validateUrl(url);
        if (validationError) {
            this.snackbar.errorPersistent(`Invalid import URL: ${validationError}`);
            this.clearImportParam();
            return true;
        }

        this.openImportDialog(url);
        return true;
    }

    private extractImportUrl(): string | null {
        const params = new URLSearchParams(window.location.search);
        return params.get(IMPORT_URL);
    }

    private validateUrl(url: string): string | null {
        try {
            const parsed = new URL(url);

            if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
                return "Only HTTPS URLs are allowed (except localhost)";
            }

            if (url.length > 2000) {
                return "URL is too long";
            }

            return null;
        } catch {
            return "Invalid URL format";
        }
    }

    private clearImportParam(): void {
        const url = new URL(window.location.href);
        url.searchParams.delete(IMPORT_URL);
        window.history.replaceState({}, "", url.toString());
    }

    private openImportDialog(url: string): void {
        const dialogRef = this.dialog.open(ImportDialogComponent, {
            width: "500px",
            disableClose: true,
            data: { mode: "url", url } as ImportDialogData,
        });

        dialogRef.afterClosed().subscribe((result: ImportDialogResult | undefined) => {
            this.clearImportParam();

            if (result?.action === "import" && result.data) {
                const importResult = this.queryExportService.importFromUrl(result.data, url);

                if (importResult.success) {
                    const parts: string[] = [];
                    const added = importResult.foldersAdded + importResult.queriesAdded;
                    const updated = importResult.foldersUpdated + importResult.queriesUpdated;
                    if (added > 0) parts.push(`${added} added`);
                    if (updated > 0) parts.push(`${updated} updated`);
                    this.snackbar.success(`Imported to "URL Imports" folder: ${parts.join(", ") || "no changes"}`);
                } else {
                    this.snackbar.warnPersistent(
                        `Import completed with errors: ${importResult.errors.join("; ")}`
                    );
                }

                this.router.navigate(["/query"]);
            }
        });
    }

    /**
     * Check for #share parameter and handle URL-encoded shared queries
     * This will navigate to /query and auto-load the first query
     */
    async checkAndHandleShareHash(): Promise<boolean> {
        const hash = window.location.hash;
        if (!hash.startsWith('#share=')) return false;

        const encoded = hash.substring(7); // Remove '#share='

        try {
            // Decode the shared queries
            const data = await this.urlShareService.decodeFromUrl(encoded);

            // Load into temporary shared state
            this.appData.loadSharedQueries(data, window.location.href);

            // Navigate to query page if not already there
            const currentUrl = this.router.url;
            if (!currentUrl.includes('/query')) {
                await this.router.navigate(['/query']);
            }

            // Wait a moment for the query page to initialize, then select first query
            setTimeout(() => {
                this.selectFirstSharedQuery(data);
            }, 150);

            // Show success toast
            this.snackbar.success(`Loaded ${data.queries.length} shared quer${data.queries.length === 1 ? 'y' : 'ies'}`);

            return true;
        } catch (e) {
            this.snackbar.errorPersistent('Invalid or corrupted share link');
            console.error('Failed to load shared queries:', e);

            // Clear the invalid hash
            if (window.location.hash.startsWith('#share=')) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            return false;
        }
    }

    /**
     * Find and select the first query from shared data
     */
    private selectFirstSharedQuery(data: { queries: ExportedQuery[], folders: any[] }): void {
        const firstQuery = this.findFirstQuery(data);

        if (firstQuery) {
            // Load it into the editor
            this.queryPageState.loadSavedQuery(
                `__shared_${firstQuery.id}__`,  // Temporary ID for tracking
                firstQuery.queryText
            );

            // Mark as selected in shared state
            this.appData.markSharedQueryAsSelected(firstQuery.id);
        }
    }

    /**
     * Find the first query in the data (respecting folder hierarchy)
     */
    private findFirstQuery(data: { queries: ExportedQuery[], folders: any[] }): ExportedQuery | null {
        if (data.queries.length === 0) return null;

        // If no folders, return first query
        if (data.folders.length === 0) {
            return data.queries[0];
        }

        // Get root-level queries first (no folderId)
        const rootQueries = data.queries.filter(q => !q.folderId);
        if (rootQueries.length > 0) return rootQueries[0];

        // Otherwise get queries from first folder
        const firstFolder = this.findFirstFolder(data.folders);
        if (firstFolder) {
            const folderQueries = data.queries.filter(q => q.folderId === firstFolder.id);
            if (folderQueries.length > 0) return folderQueries[0];
        }

        // Fallback: just return first query
        return data.queries[0];
    }

    /**
     * Find the first folder (root folders first, then by order)
     */
    private findFirstFolder(folders: any[]): any | null {
        const rootFolders = folders.filter(f => !f.parentId);
        return rootFolders[0] || folders[0] || null;
    }
}
