/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, Inject, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { SavedQueryFolder } from "../../../concept/saved-query";
import { FolderAutocompleteComponent, FolderOption } from "./folder-autocomplete.component";

export interface SavedQueryDialogData {
    mode: "create" | "rename";
    name?: string;
    description?: string;
    queryText?: string;
    folderId?: string | null;
    folders?: SavedQueryFolder[];
}

export interface SavedQueryDialogResult {
    action: "save" | "cancel";
    name: string;
    description?: string;
    queryText?: string;
    folderId?: string | null;
    newFolderName?: string;
}

@Component({
    selector: "ts-saved-query-dialog",
    template: `
        <h2 mat-dialog-title>{{ data.mode === 'create' ? 'New Query' : 'Rename Query' }}</h2>
        <mat-dialog-content>
            <mat-form-field class="full-width">
                <mat-label>Query name</mat-label>
                <input matInput [(ngModel)]="name" (keyup.enter)="save()" autofocus>
            </mat-form-field>
            <mat-form-field class="full-width">
                <mat-label>Description (optional)</mat-label>
                <textarea matInput [(ngModel)]="description" rows="2"></textarea>
            </mat-form-field>
            @if (data.mode === 'create' && data.folders) {
                <ts-folder-autocomplete
                    [folders]="data.folders"
                    [selectedFolderId]="data.folderId ?? null"
                    label="Save to folder"
                    (selectionChange)="onFolderSelected($event)"
                ></ts-folder-autocomplete>
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button (click)="cancel()">Cancel</button>
            <button mat-flat-button color="primary" [disabled]="!name.trim()" (click)="save()">
                {{ data.mode === 'create' ? 'Create' : 'Save' }}
            </button>
        </mat-dialog-actions>
    `,
    styles: [`
        .full-width {
            width: 100%;
            margin-bottom: 8px;
        }
    `],
    imports: [
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        FolderAutocompleteComponent,
    ],
})
export class SavedQueryDialogComponent {
    @ViewChild(FolderAutocompleteComponent) folderAutocomplete?: FolderAutocompleteComponent;

    name: string;
    description: string;
    selectedFolderOption: FolderOption | null = null;

    constructor(
        private dialogRef: MatDialogRef<SavedQueryDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: SavedQueryDialogData,
    ) {
        this.name = data.name || "";
        this.description = data.description || "";
    }

    onFolderSelected(option: FolderOption): void {
        this.selectedFolderOption = option;
    }

    save(): void {
        if (this.name.trim()) {
            const result: SavedQueryDialogResult = {
                action: "save",
                name: this.name.trim(),
                description: this.description.trim() || undefined,
                queryText: this.data.queryText,
            };

            if (this.data.mode === "create" && this.data.folders) {
                const option = this.selectedFolderOption ?? this.folderAutocomplete?.getCurrentSelection();
                if (option?.type === "create-new") {
                    result.newFolderName = option.name;
                    result.folderId = null;
                } else {
                    result.folderId = option?.id ?? null;
                }
            }

            this.dialogRef.close(result);
        }
    }

    cancel(): void {
        this.dialogRef.close({ action: "cancel", name: "" } as SavedQueryDialogResult);
    }
}
