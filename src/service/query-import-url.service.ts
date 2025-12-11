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

@Injectable({
    providedIn: "root",
})
export class QueryImportUrlService {
    constructor(
        private dialog: MatDialog,
        private router: Router,
        private queryExportService: QueryExportService,
        private snackbar: SnackbarService,
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
}
