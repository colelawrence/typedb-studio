/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, EventEmitter, HostBinding, inject, Output, ViewChild } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { SchemaToolWindowComponent } from "../../schema/tool-window/schema-tool-window.component";
import { SavedQueriesWindowComponent } from "../saved-queries-window/saved-queries-window.component";
import { SavedQuery } from "../../../concept/saved-query";
import { AppData } from "../../../service/app-data.service";

@Component({
    selector: "ts-query-sidebar",
    templateUrl: "query-sidebar.component.html",
    styleUrls: ["query-sidebar.component.scss"],
    imports: [
        MatIconModule,
        MatButtonModule,
        SchemaToolWindowComponent,
        SavedQueriesWindowComponent,
    ],
})
export class QuerySidebarComponent {
    @HostBinding("class") readonly clazz = "query-sidebar";
    @Output() querySelected = new EventEmitter<SavedQuery>();
    @ViewChild(SavedQueriesWindowComponent) savedQueriesWindow?: SavedQueriesWindowComponent;

    private appData = inject(AppData);

    schemaCollapsed: boolean;
    queriesCollapsed: boolean;

    constructor() {
        const state = this.appData.viewState.querySidebarState();
        this.schemaCollapsed = state.schemaCollapsed;
        this.queriesCollapsed = state.queriesCollapsed;
    }

    toggleSchema(): void {
        this.schemaCollapsed = !this.schemaCollapsed;
        this.persistState();
    }

    toggleQueries(): void {
        this.queriesCollapsed = !this.queriesCollapsed;
        this.persistState();
    }

    private persistState(): void {
        this.appData.viewState.setQuerySidebarState({
            schemaCollapsed: this.schemaCollapsed,
            queriesCollapsed: this.queriesCollapsed,
        });
    }

    onQuerySelected(query: SavedQuery): void {
        this.querySelected.emit(query);
    }

    refreshSavedQueries(): void {
        this.savedQueriesWindow?.refreshTree();
    }
}
