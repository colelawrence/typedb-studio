/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Injectable } from "@angular/core";

/**
 * Information extracted from an auto-login URL hash fragment.
 * The hash contains a JWT that can be used for authentication.
 */
export interface AutoLoginInfo {
    /** The JWT token extracted from the URL hash */
    token: string;
    /** The server address derived from the current page URL */
    serverAddress: string;
}

/**
 * Service for handling auto-login via JWT tokens passed in URL hash fragments.
 *
 * When TypeDB server starts with Studio enabled, it can print a URL like:
 *   http://localhost:8000/studio/#<JWT_TOKEN>
 *
 * This service extracts the token from the hash and provides the server address
 * for automatic connection.
 */
@Injectable({
    providedIn: "root",
})
export class AutoLoginService {

    /**
     * Extracts auto-login information from the current URL hash fragment.
     * Returns null if no valid token is present.
     */
    extractAutoLoginInfo(): AutoLoginInfo | null {
        const hash = window.location.hash;
        if (!hash || hash.length <= 1) {
            return null;
        }

        const token = hash.substring(1); // Remove the leading '#'

        // Basic JWT format validation (three base64url-encoded parts separated by dots)
        if (!this.isValidJwtFormat(token)) {
            return null;
        }

        // Derive the server address from the current page URL
        // When served from TypeDB's embedded Studio, the server is at the same origin
        const serverAddress = window.location.origin;

        return { token, serverAddress };
    }

    /**
     * Clears the hash fragment from the URL without triggering a page reload.
     * This should be called after successfully extracting the token to avoid
     * exposing it in the browser history or when sharing URLs.
     */
    clearHashFragment(): void {
        const cleanUrl = window.location.pathname + window.location.search;
        history.replaceState(null, "", cleanUrl);
    }

    /**
     * Checks if a string looks like a valid JWT format.
     * JWTs consist of three base64url-encoded parts separated by dots.
     */
    private isValidJwtFormat(token: string): boolean {
        const parts = token.split(".");
        if (parts.length !== 3) {
            return false;
        }
        // Each part should be non-empty and contain only valid base64url characters
        const base64urlRegex = /^[A-Za-z0-9_-]+$/;
        return parts.every(part => part.length > 0 && base64urlRegex.test(part));
    }
}
