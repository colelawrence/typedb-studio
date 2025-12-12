/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, Inject, ViewChild } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { SavedQueryFolder } from "../../../concept/saved-query";
import { FolderAutocompleteComponent, FolderOption } from "./folder-autocomplete.component";

export interface MoveDialogData {
    itemName: string;
    itemType: "folder" | "query";
    currentFolderId: string | null;
    folders: SavedQueryFolder[];
}

export interface MoveDialogResult {
    action: "move" | "create-folder-and-move" | "cancel";
    targetFolderId: string | null;
    newFolderName?: string;
}

@Component({
    selector: "ts-move-dialog",
    template: `
        <h2 mat-dialog-title>Move "{{ data.itemName }}"</h2>
        <mat-dialog-content>
            <ts-folder-autocomplete
                [folders]="availableFolders"
                [selectedFolderId]="currentFolderId"
                label="Destination folder"
                (selectionChange)="onFolderSelected($event)"
            ></ts-folder-autocomplete>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button (click)="cancel()">Cancel</button>
            <button mat-flat-button color="primary" (click)="move()">
                {{ selectedOption?.type === 'create-new' ? 'Create & Move' : 'Move' }}
            </button>
        </mat-dialog-actions>
    `,
    styles: [`
        mat-dialog-content {
            min-width: 300px;
        }
    `],
    imports: [
        MatButtonModule,
        MatDialogModule,
        FolderAutocompleteComponent,
    ],
})
export class MoveDialogComponent {
    @ViewChild(FolderAutocompleteComponent) autocomplete!: FolderAutocompleteComponent;

    currentFolderId: string | null;
    availableFolders: SavedQueryFolder[];
    selectedOption: FolderOption | null = null;

    constructor(
        private dialogRef: MatDialogRef<MoveDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MoveDialogData,
    ) {
        this.currentFolderId = data.currentFolderId;
        this.availableFolders = data.folders.filter(f => {
            if (data.itemType === "folder") {
                return f.id !== data.currentFolderId;
            }
            return true;
        });
    }

    onFolderSelected(option: FolderOption): void {
        this.selectedOption = option;
    }

    move(): void {
        const option = this.selectedOption ?? this.autocomplete?.getCurrentSelection();
        if (!option) {
            this.dialogRef.close({ action: "move", targetFolderId: null } as MoveDialogResult);
            return;
        }

        if (option.type === "create-new") {
            this.dialogRef.close({
                action: "create-folder-and-move",
                targetFolderId: null,
                newFolderName: option.name,
            } as MoveDialogResult);
        } else {
            this.dialogRef.close({
                action: "move",
                targetFolderId: option.id,
            } as MoveDialogResult);
        }
    }

    cancel(): void {
        this.dialogRef.close({ action: "cancel", targetFolderId: null } as MoveDialogResult);
    }
}
