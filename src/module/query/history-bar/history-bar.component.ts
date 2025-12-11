/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, HostBinding, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { DriverAction, isQueryRun, isTransactionOperation, TransactionOperationAction } from "../../../concept/action";
import { QueryPageState } from "../../../service/query-page-state.service";
import { SpinnerComponent } from "../../../framework/spinner/spinner.component";
import { RichTooltipDirective } from "../../../framework/tooltip/rich-tooltip.directive";

@Component({
    selector: "ts-history-bar",
    templateUrl: "history-bar.component.html",
    styleUrls: ["history-bar.component.scss"],
    imports: [
        CommonModule,
        DatePipe,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        SpinnerComponent,
        RichTooltipDirective,
    ],
})
export class HistoryBarComponent {
    @HostBinding("class") readonly clazz = "history-bar";
    @HostBinding("class.expanded") expanded = false;

    state = inject(QueryPageState);

    get latestEntry(): DriverAction | null {
        return this.state.history.entries[0] ?? null;
    }

    toggle(): void {
        this.expanded = !this.expanded;
    }

    actionDurationString(action: DriverAction): string {
        if (action.completedAtTimestamp == undefined) return "";
        return `${action.completedAtTimestamp - action.startedAtTimestamp}ms`;
    }

    transactionOperationString(action: TransactionOperationAction): string {
        switch (action.operation) {
            case "open": return "opened transaction";
            case "commit": return "committed transaction";
            case "close": return "closed transaction";
        }
    }

    historyEntryErrorTooltip(entry: DriverAction): string {
        if (!entry.result) return "";
        else if ("err" in entry.result && !!entry.result.err?.message) return entry.result.err.message;
        else if ("message" in entry.result) return entry.result.message as string;
        else return entry.result.toString();
    }

    queryPreview(query: string): string {
        return query.split("\n").slice(0, 2).join(" ").substring(0, 60) + (query.length > 60 ? "..." : "");
    }

    readonly isQueryRun = isQueryRun;
    readonly isTransactionOperation = isTransactionOperation;
}
