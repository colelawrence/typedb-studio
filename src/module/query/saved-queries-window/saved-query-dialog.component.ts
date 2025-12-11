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
import { MatInputModule } from "@angular/material/input";

export interface SavedQueryDialogData {
    mode: "create" | "rename";
    name?: string;
    description?: string;
    queryText?: string;
    folderId?: string | null;
}

export interface SavedQueryDialogResult {
    action: "save" | "cancel";
    name: string;
    description?: string;
    queryText?: string;
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
    ],
})
export class SavedQueryDialogComponent {
    name: string;
    description: string;

    constructor(
        private dialogRef: MatDialogRef<SavedQueryDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: SavedQueryDialogData,
    ) {
        this.name = data.name || "";
        this.description = data.description || "";
    }

    save(): void {
        if (this.name.trim()) {
            this.dialogRef.close({
                action: "save",
                name: this.name.trim(),
                description: this.description.trim() || undefined,
                queryText: this.data.queryText,
            } as SavedQueryDialogResult);
        }
    }

    cancel(): void {
        this.dialogRef.close({ action: "cancel", name: "" } as SavedQueryDialogResult);
    }
}
