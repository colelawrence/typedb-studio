/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from "@angular/material/autocomplete";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { map, Observable, startWith } from "rxjs";
import { AsyncPipe } from "@angular/common";
import { SavedQueryFolder } from "../../../concept/saved-query";

export interface FolderOption {
    type: "unsorted" | "folder" | "create-new";
    id: string | null;
    name: string;
    folder?: SavedQueryFolder;
}

@Component({
    selector: "ts-folder-autocomplete",
    template: `
        <mat-form-field class="full-width">
            <mat-label>{{ label }}</mat-label>
            <input
                matInput
                [formControl]="inputControl"
                [matAutocomplete]="auto"
                (blur)="onBlur()"
            >
            <mat-autocomplete
                #auto="matAutocomplete"
                [displayWith]="displayFn"
                (optionSelected)="onOptionSelected($event)"
            >
                @for (option of filteredOptions$ | async; track option.type + option.id) {
                    <mat-option [value]="option">
                        @if (option.type === "unsorted") {
                            <i class="fa-light fa-inbox option-icon"></i> {{ option.name }}
                        } @else if (option.type === "create-new") {
                            <i class="fa-light fa-folder-plus option-icon"></i> Create "{{ option.name }}"
                        } @else {
                            <i class="fa-light fa-folder option-icon"></i> {{ option.name }}
                        }
                    </mat-option>
                }
            </mat-autocomplete>
        </mat-form-field>
    `,
    styles: [`
        .full-width {
            width: 100%;
        }
        .option-icon {
            margin-right: 8px;
            opacity: 0.7;
        }
    `],
    imports: [
        AsyncPipe,
        FormsModule,
        ReactiveFormsModule,
        MatAutocompleteModule,
        MatFormFieldModule,
        MatInputModule,
    ],
})
export class FolderAutocompleteComponent implements OnInit, OnChanges {
    @Input() folders: SavedQueryFolder[] = [];
    @Input() selectedFolderId: string | null = null;
    @Input() label = "Folder";
    @Output() selectionChange = new EventEmitter<FolderOption>();

    inputControl = new FormControl<string | FolderOption>("");
    filteredOptions$!: Observable<FolderOption[]>;

    private allOptions: FolderOption[] = [];

    ngOnInit(): void {
        this.buildOptions();
        this.initFilteredOptions();
        this.setInitialValue();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes["folders"] || changes["selectedFolderId"]) {
            this.buildOptions();
            if (changes["selectedFolderId"]) {
                this.setInitialValue();
            }
        }
    }

    private buildOptions(): void {
        this.allOptions = [
            { type: "unsorted", id: null, name: "Unsorted" },
            ...this.folders.map(f => ({
                type: "folder" as const,
                id: f.id,
                name: f.name,
                folder: f,
            })),
        ];
    }

    private setInitialValue(): void {
        const selected = this.allOptions.find(o => o.id === this.selectedFolderId);
        if (selected) {
            this.inputControl.setValue(selected);
        } else {
            this.inputControl.setValue(this.allOptions[0]);
        }
    }

    private initFilteredOptions(): void {
        this.filteredOptions$ = this.inputControl.valueChanges.pipe(
            startWith(this.inputControl.value),
            map(value => this.filterOptions(value)),
        );
    }

    private filterOptions(value: string | FolderOption | null): FolderOption[] {
        const filterText = typeof value === "string" ? value : value?.name || "";
        const lowerFilter = filterText.toLowerCase().trim();

        let filtered: FolderOption[];
        if (!lowerFilter) {
            filtered = [...this.allOptions];
        } else {
            filtered = this.allOptions.filter(option =>
                option.name.toLowerCase().includes(lowerFilter)
            );
        }

        const exactMatch = this.allOptions.some(
            o => o.name.toLowerCase() === lowerFilter
        );
        if (lowerFilter && !exactMatch) {
            filtered.push({
                type: "create-new",
                id: null,
                name: filterText.trim(),
            });
        }

        return filtered;
    }

    displayFn = (option: FolderOption | string | null): string => {
        if (!option) return "";
        if (typeof option === "string") return option;
        return option.name;
    };

    onOptionSelected(event: MatAutocompleteSelectedEvent): void {
        const option = event.option.value as FolderOption;
        this.selectionChange.emit(option);
    }

    onBlur(): void {
        const value = this.inputControl.value;
        if (typeof value === "string" && value.trim()) {
            const lowerValue = value.toLowerCase().trim();
            const match = this.allOptions.find(o => o.name.toLowerCase() === lowerValue);
            if (match) {
                this.inputControl.setValue(match);
                this.selectionChange.emit(match);
            } else {
                const createOption: FolderOption = {
                    type: "create-new",
                    id: null,
                    name: value.trim(),
                };
                this.inputControl.setValue(createOption);
                this.selectionChange.emit(createOption);
            }
        }
    }

    getCurrentSelection(): FolderOption | null {
        const value = this.inputControl.value;
        if (!value) return null;
        if (typeof value === "string") {
            const lowerValue = value.toLowerCase().trim();
            const match = this.allOptions.find(o => o.name.toLowerCase() === lowerValue);
            if (match) return match;
            if (value.trim()) {
                return { type: "create-new", id: null, name: value.trim() };
            }
            return null;
        }
        return value;
    }
}
