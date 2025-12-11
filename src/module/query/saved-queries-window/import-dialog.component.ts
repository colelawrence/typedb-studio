/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, Inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatRadioModule } from "@angular/material/radio";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
    ExportedQueriesFile,
    ImportStrategy,
    ValidationError,
} from "../../../concept/query-export";
import { QueryExportService } from "../../../service/query-export.service";

export interface ImportDialogData {
    mode: "file" | "url";
    url?: string;
}

export interface ImportDialogResult {
    action: "import" | "cancel";
    data?: ExportedQueriesFile;
    strategy: ImportStrategy;
}

type DialogState = "selecting" | "loading" | "preview" | "error";

@Component({
    selector: "ts-import-dialog",
    template: `
        <h2 mat-dialog-title>Import Queries</h2>
        <mat-dialog-content>
            @switch (state) {
                @case ("selecting") {
                    <div class="file-input-container">
                        <p class="instructions">Select a JSON file exported from TypeDB Studio.</p>
                        <input
                            type="file"
                            accept=".json,application/json"
                            (change)="onFileSelected($event)"
                            #fileInput
                        >
                        <button mat-stroked-button (click)="fileInput.click()">
                            <i class="fa-light fa-file-import"></i>
                            Choose File
                        </button>
                        @if (selectedFileName) {
                            <span class="file-name">{{ selectedFileName }}</span>
                        }
                    </div>
                }
                @case ("loading") {
                    <div class="loading-container">
                        <mat-spinner diameter="40"></mat-spinner>
                        <p>{{ data.mode === 'url' ? 'Fetching from URL...' : 'Reading file...' }}</p>
                    </div>
                }
                @case ("preview") {
                    <div class="preview-container">
                        @if (data.mode === 'url') {
                            <div class="url-display">
                                <strong>URL:</strong>
                                <code class="url-text">{{ data.url }}</code>
                            </div>
                        }
                        <div class="preview-summary">
                            <h4>Import Preview</h4>
                            <ul>
                                <li><strong>{{ parsedData!.folders.length }}</strong> folder(s)</li>
                                <li><strong>{{ parsedData!.queries.length }}</strong> query/queries</li>
                            </ul>
                            @if (parsedData!.source) {
                                <p class="source-info">
                                    Exported from {{ parsedData!.source.appName }} v{{ parsedData!.source.appVersion }}
                                </p>
                            }
                            @if (parsedData!.exportedAt) {
                                <p class="export-date">
                                    Exported: {{ formatDate(parsedData!.exportedAt) }}
                                </p>
                            }
                        </div>

                        <div class="strategy-selector">
                            <h4>Import Strategy</h4>
                            <mat-radio-group [(ngModel)]="strategy">
                                <mat-radio-button value="merge">
                                    <strong>Merge</strong> – Add new items, update existing by ID
                                </mat-radio-button>
                                <mat-radio-button value="replace">
                                    <strong>Replace</strong> – Clear all existing, import fresh
                                </mat-radio-button>
                            </mat-radio-group>
                        </div>

                        @if (strategy === 'replace') {
                            <div class="warning-box">
                                <i class="fa-light fa-triangle-exclamation"></i>
                                <span>Replace will delete all your existing saved queries and folders.</span>
                            </div>
                        }
                    </div>
                }
                @case ("error") {
                    <div class="error-container">
                        <i class="fa-light fa-circle-exclamation error-icon"></i>
                        <p class="error-message">{{ errorMessage }}</p>
                        <button mat-stroked-button (click)="reset()">Try Again</button>
                    </div>
                }
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button (click)="cancel()">Cancel</button>
            @if (state === 'preview') {
                <button mat-flat-button color="primary" (click)="doImport()">
                    Import
                </button>
            }
        </mat-dialog-actions>
    `,
    styles: [`
        .file-input-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
        }

        .file-input-container input[type="file"] {
            display: none;
        }

        .instructions {
            color: var(--color-text-secondary, #888);
            margin: 0;
        }

        .file-name {
            color: var(--color-text-secondary, #888);
            font-size: 0.9em;
        }

        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 24px 0;
        }

        .preview-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .url-display {
            background: var(--color-surface, #1a1a1a);
            padding: 8px 12px;
            border-radius: 4px;
            overflow-x: auto;
        }

        .url-text {
            word-break: break-all;
            font-size: 0.85em;
        }

        .preview-summary h4,
        .strategy-selector h4 {
            margin: 0 0 8px 0;
            font-size: 1em;
        }

        .preview-summary ul {
            margin: 0;
            padding-left: 20px;
        }

        .source-info,
        .export-date {
            color: var(--color-text-secondary, #888);
            font-size: 0.9em;
            margin: 4px 0 0 0;
        }

        .strategy-selector mat-radio-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .strategy-selector mat-radio-button {
            display: block;
        }

        .warning-box {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--color-warning-bg, #3d2a00);
            color: var(--color-warning, #ffb800);
            padding: 12px;
            border-radius: 4px;
        }

        .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 16px 0;
            text-align: center;
        }

        .error-icon {
            font-size: 2em;
            color: var(--color-error, #f44336);
        }

        .error-message {
            color: var(--color-error, #f44336);
            margin: 0;
        }
    `],
    imports: [
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatRadioModule,
        MatProgressSpinnerModule,
    ],
})
export class ImportDialogComponent {
    state: DialogState = "selecting";
    strategy: ImportStrategy = "merge";
    parsedData: ExportedQueriesFile | null = null;
    errorMessage = "";
    selectedFileName = "";

    constructor(
        private dialogRef: MatDialogRef<ImportDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: ImportDialogData,
        private queryExportService: QueryExportService,
    ) {
        if (data.mode === "url" && data.url) {
            this.fetchFromUrl(data.url);
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.selectedFileName = file.name;
        this.state = "loading";

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const content = reader.result as string;
                this.parsedData = this.queryExportService.parseAndValidate(content);
                this.state = "preview";
            } catch (e) {
                this.errorMessage = e instanceof ValidationError
                    ? e.message
                    : `Failed to parse file: ${e instanceof Error ? e.message : String(e)}`;
                this.state = "error";
            }
        };
        reader.onerror = () => {
            this.errorMessage = "Failed to read file";
            this.state = "error";
        };
        reader.readAsText(file);
    }

    async fetchFromUrl(url: string): Promise<void> {
        this.state = "loading";

        try {
            const response = await fetch(url, {
                method: "GET",
                credentials: "omit",
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get("content-type");
            if (contentType && !contentType.includes("application/json") && !contentType.includes("text/")) {
                throw new Error(`Invalid content type: ${contentType}`);
            }

            const contentLength = response.headers.get("content-length");
            if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
                throw new Error("Response too large (>5MB)");
            }

            const text = await response.text();
            if (text.length > 5 * 1024 * 1024) {
                throw new Error("Response too large (>5MB)");
            }

            this.parsedData = this.queryExportService.parseAndValidate(text);
            this.state = "preview";
        } catch (e) {
            if (e instanceof ValidationError) {
                this.errorMessage = e.message;
            } else if (e instanceof Error && e.name === "AbortError") {
                this.errorMessage = "Request timed out";
            } else {
                this.errorMessage = `Failed to fetch: ${e instanceof Error ? e.message : String(e)}`;
            }
            this.state = "error";
        }
    }

    reset(): void {
        this.state = this.data.mode === "url" ? "loading" : "selecting";
        this.parsedData = null;
        this.errorMessage = "";
        this.selectedFileName = "";

        if (this.data.mode === "url" && this.data.url) {
            this.fetchFromUrl(this.data.url);
        }
    }

    formatDate(isoString: string): string {
        try {
            return new Date(isoString).toLocaleString();
        } catch {
            return isoString;
        }
    }

    doImport(): void {
        if (this.parsedData) {
            this.dialogRef.close({
                action: "import",
                data: this.parsedData,
                strategy: this.strategy,
            } as ImportDialogResult);
        }
    }

    cancel(): void {
        this.dialogRef.close({ action: "cancel", strategy: "merge" } as ImportDialogResult);
    }
}
