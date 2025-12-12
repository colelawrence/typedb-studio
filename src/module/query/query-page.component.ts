/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { CodeEditor } from "@acrodata/code-editor";
import { AsyncPipe } from "@angular/common";
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatDialog } from "@angular/material/dialog";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSortModule } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterLink } from "@angular/router";
import { Prec } from "@codemirror/state";
import { ResizableDirective } from "@hhangular/resizable";
import { filter, map, startWith } from "rxjs";
import { CodeEditorComponent } from "../../framework/code-editor/code-editor.component";
import { otherExampleLinter, TypeQL, typeqlAutocompleteExtension } from "../../framework/codemirror-lang-typeql";
import { basicDark } from "../../framework/code-editor/theme";
import { AppData } from "../../service/app-data.service";
import { DriverState } from "../../service/driver-state.service";
import { QueryPageState, QueryType } from "../../service/query-page-state.service";
import { SnackbarService } from "../../service/snackbar.service";
import { VibeQueryComponent } from "../ai/vibe-query.component";
import { DatabaseSelectDialogComponent } from "../database/select-dialog/database-select-dialog.component";
import { PageScaffoldComponent } from "../scaffold/page/page-scaffold.component";
import { keymap } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { MatMenuModule } from "@angular/material/menu";
import { QuerySidebarComponent } from "./sidebar/query-sidebar.component";
import { SavedQuery } from "../../concept/saved-query";
import { SavedQueryDialogComponent, SavedQueryDialogData, SavedQueryDialogResult } from "./saved-queries-window/saved-query-dialog.component";
import { ConfirmationModalComponent, ConfirmationModalData } from "../../framework/modal";
import { HistoryBarComponent } from "./history-bar/history-bar.component";

@Component({
    selector: "ts-query-page",
    templateUrl: "query-page.component.html",
    styleUrls: ["query-page.component.scss"],
    imports: [
        RouterLink, AsyncPipe, PageScaffoldComponent, MatDividerModule, MatFormFieldModule, MatIconModule,
        MatInputModule, FormsModule, ReactiveFormsModule, MatButtonToggleModule, ResizableDirective,
        MatTableModule, MatSortModule, MatTooltipModule, MatButtonModule,
        MatMenuModule, VibeQueryComponent, CodeEditorComponent, QuerySidebarComponent, HistoryBarComponent,
    ]
})
export class QueryPageComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild(CodeEditor) codeEditor!: CodeEditor;
    @ViewChild("articleRef") articleRef!: ElementRef<HTMLElement>;
    @ViewChild(QuerySidebarComponent) querySidebar!: QuerySidebarComponent;
    @ViewChildren("graphViewRef") graphViewRef!: QueryList<ElementRef<HTMLElement>>;
    @ViewChildren(ResizableDirective) resizables!: QueryList<ResizableDirective>;

    state = inject(QueryPageState);
    driver = inject(DriverState);
    private appData = inject(AppData);
    private snackbar = inject(SnackbarService);
    private dialog = inject(MatDialog);

    readonly codeEditorTheme = basicDark;
    codeEditorHidden = true;
    editorKeymap = Prec.highest(keymap.of([
        { key: "Alt-Space", run: startCompletion, preventDefault: true },
        {
            key: "Mod-Enter",
            run: () => {
                this.runQuery();
                return true;
            },
        },
        indentWithTab,
    ]));
    copiedLog = false;
    sentLogToAI = false;

    ngOnInit() {
        this.appData.viewState.setLastUsedTool("query");
        this.renderCodeEditorWithDelay();
    }

    private renderCodeEditorWithDelay() {
        // omitting this causes the left sidebar to flicker
        setTimeout(() => {
            this.codeEditorHidden = false;
        }, 0);
    }

    ngAfterViewInit() {
        this.graphViewRef.changes.pipe(
            map(x => x as QueryList<ElementRef<HTMLElement>>),
            startWith(this.graphViewRef),
            filter(queryList => queryList.length > 0),
            map(x => x.first.nativeElement),
        ).subscribe((canvasEl) => {
            this.state.graphOutput.canvasEl = canvasEl;
        });
    }

    ngOnDestroy() {
        this.state.graphOutput.destroy();
    }

    openSelectDatabaseDialog() {
        this.dialog.open(DatabaseSelectDialogComponent);
    }

    runQuery() {
        this.state.runQuery(this.state.queryEditorControl.value);
    }

    queryTypeIconClass(queryType: QueryType): string {
        switch (queryType) {
            case "code": return "fa-light fa-code";
            case "chat": return "fa-light fa-wand-magic-sparkles";
            default: return "";
        }
    }

    clearChat() {
        this.state.clearChat();
    }

    async copyLog() {
        try {
            await navigator.clipboard.writeText(this.state.logOutput.control.value);
            this.copiedLog = true;

            // Reset copied state after 3 seconds
            setTimeout(() => {
                this.copiedLog = false;
            }, 3000);
        } catch (err) {
            console.error('Failed to copy results log:', err);
        }
    }

    sendLogToAI() {
        this.sentLogToAI = true;
        this.state.vibeQuery.promptControl.patchValue(this.state.logOutput.control.value);
        setTimeout(() => {
            this.state.vibeQuery.submitPrompt();
        });
        setTimeout(() => {
            this.sentLogToAI = false;
        }, 3000);
    }

    loadSavedQuery(query: SavedQuery): void {
        this.state.loadSavedQuery(query.id, query.queryText);
    }

    saveQueryChanges(): void {
        if (this.state.saveCurrentQueryChanges()) {
            this.snackbar.success("Query saved");
            this.querySidebar?.refreshSavedQueries();
        }
    }

    saveCurrentQuery(): void {
        const queryText = this.state.queryEditorControl.value;
        if (!queryText.trim()) {
            this.snackbar.warn("Cannot save an empty query");
            return;
        }

        const folders = this.appData.savedQueries.listFolders().filter(f => !f.importKey);
        const defaultName = this.extractDefaultQueryName(queryText);
        const dialogRef = this.dialog.open(SavedQueryDialogComponent, {
            width: "500px",
            data: { mode: "create", queryText, folders, folderId: null, name: defaultName } as SavedQueryDialogData,
        });

        dialogRef.afterClosed().subscribe((result: SavedQueryDialogResult | undefined) => {
            if (result?.action === "save") {
                let folderId = result.folderId ?? null;

                if (result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    folderId = newFolder.id;
                }

                this.appData.savedQueries.createQuery({
                    name: result.name,
                    queryText,
                    description: result.description,
                    folderId,
                });
                this.snackbar.success(`Query "${result.name}" saved`);
                this.querySidebar?.refreshSavedQueries();
            }
        });
    }

    newScratchQuery(): void {
        if (this.state.hasUnsavedChanges()) {
            const dialogRef = this.dialog.open(ConfirmationModalComponent, {
                width: "400px",
                data: {
                    title: "Discard changes?",
                    body: "You have unsaved changes. Creating a new scratch query will discard them.",
                    confirmText: "Discard",
                    confirmButtonStyle: "primary-outline red stroke",
                } as ConfirmationModalData,
            });

            dialogRef.componentInstance.confirmed.subscribe(() => {
                dialogRef.close();
                this.state.clearToScratch();
            });
        } else {
            this.state.clearToScratch();
        }
    }

    private extractDefaultQueryName(queryText: string): string {
        const maxLength = 60;
        const lines = queryText.split('\n');
        const parts: string[] = [];
        let totalLength = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
                continue;
            }
            const separator = parts.length > 0 ? ' ' : '';
            if (totalLength + separator.length + trimmed.length > maxLength) {
                const remaining = maxLength - totalLength - separator.length;
                if (remaining > 10) {
                    parts.push(trimmed.slice(0, remaining) + '…');
                } else if (parts.length > 0) {
                    parts[parts.length - 1] = parts[parts.length - 1].replace(/[;,]?$/, '…');
                }
                break;
            }
            parts.push(trimmed);
            totalLength += separator.length + trimmed.length;
        }

        return parts.join(' ');
    }

    readonly JSON = JSON;
    readonly TypeQL = TypeQL;
    readonly linter = otherExampleLinter;
    readonly typeqlAutocompleteExtension = typeqlAutocompleteExtension;
}
