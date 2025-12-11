/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, EventEmitter, HostBinding, Output, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { SchemaToolWindowComponent } from "../../schema/tool-window/schema-tool-window.component";
import { SavedQueriesWindowComponent } from "../saved-queries-window/saved-queries-window.component";
import { SavedQuery } from "../../../concept/saved-query";

export type SidebarTab = "schema" | "queries";

@Component({
    selector: "ts-query-sidebar",
    templateUrl: "query-sidebar.component.html",
    styleUrls: ["query-sidebar.component.scss"],
    imports: [
        FormsModule,
        MatButtonToggleModule,
        SchemaToolWindowComponent,
        SavedQueriesWindowComponent,
    ],
})
export class QuerySidebarComponent {
    @HostBinding("class") readonly clazz = "query-sidebar";
    @Output() querySelected = new EventEmitter<SavedQuery>();
    @ViewChild(SavedQueriesWindowComponent) savedQueriesWindow?: SavedQueriesWindowComponent;

    activeTab: SidebarTab = "schema";

    onQuerySelected(query: SavedQuery): void {
        this.querySelected.emit(query);
    }

    refreshSavedQueries(): void {
        this.savedQueriesWindow?.refreshTree();
    }
}
