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
import { MatSelectModule } from "@angular/material/select";
import { SavedQueryFolder } from "../../../concept/saved-query";

export interface MoveDialogData {
    itemName: string;
    itemType: "folder" | "query";
    currentFolderId: string | null;
    folders: SavedQueryFolder[];
}

export interface MoveDialogResult {
    action: "move" | "cancel";
    targetFolderId: string | null;
}

@Component({
    selector: "ts-move-dialog",
    template: `
        <h2 mat-dialog-title>Move "{{ data.itemName }}"</h2>
        <mat-dialog-content>
            <mat-form-field class="full-width">
                <mat-label>Destination folder</mat-label>
                <mat-select [(ngModel)]="targetFolderId">
                    <mat-option [value]="null">Unsorted</mat-option>
                    @for (folder of availableFolders; track folder.id) {
                        <mat-option [value]="folder.id">{{ folder.name }}</mat-option>
                    }
                </mat-select>
            </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button (click)="cancel()">Cancel</button>
            <button mat-flat-button color="primary" (click)="move()">Move</button>
        </mat-dialog-actions>
    `,
    styles: [`
        .full-width {
            width: 100%;
        }
    `],
    imports: [
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatSelectModule,
    ],
})
export class MoveDialogComponent {
    targetFolderId: string | null;
    availableFolders: SavedQueryFolder[];

    constructor(
        private dialogRef: MatDialogRef<MoveDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MoveDialogData,
    ) {
        this.targetFolderId = data.currentFolderId;
        this.availableFolders = data.folders.filter(f => {
            if (data.itemType === "folder") {
                return f.id !== data.currentFolderId;
            }
            return true;
        });
    }

    move(): void {
        this.dialogRef.close({ action: "move", targetFolderId: this.targetFolderId } as MoveDialogResult);
    }

    cancel(): void {
        this.dialogRef.close({ action: "cancel", targetFolderId: null } as MoveDialogResult);
    }
}
