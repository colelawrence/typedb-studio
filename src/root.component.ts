/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Component, OnInit } from "@angular/core";
import { SpinnerComponent } from "./framework/spinner/spinner.component";
import { AnalyticsService } from "./service/analytics.service";
import { GuardsCheckEnd, GuardsCheckStart, NavigationCancel, Router, RouterOutlet, Event as RouterEvent, NavigationEnd } from "@angular/router";
import { EMPTY, filter, of, switchMap } from "rxjs";
import { AsyncPipe } from "@angular/common";
import { AppData } from "./service/app-data.service";
import { DriverState } from "./service/driver-state.service";
import { SnackbarService } from "./service/snackbar.service";
import { AutoLoginService } from "./service/auto-login.service";
import { QueryImportUrlService } from "./service/query-import-url.service";

@Component({
    selector: "ts-root", // eslint-disable-line @angular-eslint/component-selector
    templateUrl: "./root.component.html",
    styleUrls: ["root.component.scss"],
    imports: [RouterOutlet, SpinnerComponent, AsyncPipe]
})
export class RootComponent implements OnInit {
    routeIsLoading$ = this.router.events.pipe(
        switchMap((event) => {
            if (event instanceof GuardsCheckStart) {
                return of(true);
            } else if (event instanceof GuardsCheckEnd || event instanceof NavigationCancel) {
                return of(false);
            } else {
                return EMPTY;
            }
        })
    );
    initialised = false;

    constructor(
        analytics: AnalyticsService,
        private router: Router,
        private appData: AppData,
        private driver: DriverState,
        private snackbar: SnackbarService,
        private autoLogin: AutoLoginService,
        private queryImportUrl: QueryImportUrlService,
    ) {
        this.informAnalyticsOnPageView(router, analytics);
    }

    private informAnalyticsOnPageView(router: Router, analytics: AnalyticsService) {
        router.events.pipe(filter((event: RouterEvent) => event instanceof NavigationEnd)).subscribe(() => {
            analytics.posthog.capturePageView();
            analytics.cio.page();
        });
    }

    ngOnInit() {
        // Check for auto-login token in URL hash (e.g., from server startup URL)
        const autoLoginInfo = this.autoLogin.extractAutoLoginInfo();
        if (autoLoginInfo) {
            // Clear the hash fragment to avoid exposing the token
            this.autoLogin.clearHashFragment();

            this.driver.tryConnectWithToken({
                token: autoLoginInfo.token,
                address: autoLoginInfo.serverAddress,
            }).subscribe({
                next: () => {
                    this.snackbar.info(`Connected via auto-login`);
                    this.initialised = true;
                    this.checkImportUrlParam();
                },
                error: (err) => {
                    console.warn("Auto-login failed:", err);
                    const errorMessage = this.extractErrorMessage(err);
                    this.snackbar.errorPersistent(`Auto-login failed: ${errorMessage}`);
                    this.initialised = true;
                    this.checkImportUrlParam();
                },
            });
            return;
        }

        // Fall back to saved startup connection
        const initialConnectionConfig = this.appData.connections.findStartupConnection();
        if (initialConnectionConfig) {
            this.driver.tryConnect(initialConnectionConfig).subscribe({
                next: () => {
                    this.snackbar.info(`Connected to ${initialConnectionConfig.name}`);
                    this.initialised = true;
                    this.checkImportUrlParam();
                },
                error: (err) => {
                    console.warn(err);
                    this.appData.connections.clearStartupConnection();
                    this.initialised = true;
                    this.checkImportUrlParam();
                },
            });
        } else {
            this.initialised = true;
            this.checkImportUrlParam();
        }
    }

    private checkImportUrlParam(): void {
        this.queryImportUrl.checkAndHandleImportParam();
    }

    /**
     * Extracts a user-friendly error message from various error types.
     */
    private extractErrorMessage(err: unknown): string {
        // Handle errors with customError field (from version check)
        if (err && typeof err === "object" && "customError" in err) {
            return String((err as { customError: unknown }).customError);
        }

        // Handle API error responses (has err.message structure)
        if (err && typeof err === "object" && "err" in err) {
            const innerErr = (err as { err: unknown }).err;
            if (innerErr && typeof innerErr === "object" && "message" in innerErr) {
                return String((innerErr as { message: unknown }).message);
            }
        }

        // Handle standard Error objects
        if (err instanceof Error) {
            return err.message;
        }

        // Handle string errors
        if (typeof err === "string") {
            return err;
        }

        // Fallback
        return "An unexpected error occurred. Please try connecting manually.";
    }
}
