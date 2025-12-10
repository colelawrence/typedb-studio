/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    ApiResponse, Database, DatabasesListResponse, QueryOptions, QueryResponse,
    TransactionOpenResponse, TransactionOptions, TransactionType, User, UsersListResponse,
    VersionResponse, isApiError, AnalyzeOptions, AnalyzeResponse
} from "@typedb/driver-http";

/**
 * Parameters for creating a driver with a pre-authenticated token.
 */
export interface DriverParamsWithToken {
    /** Pre-authenticated JWT token */
    token: string;
    /** Server address (e.g., "http://localhost:8000") */
    address: string;
}

/**
 * A TypeDB HTTP driver that uses a pre-authenticated token instead of username/password.
 *
 * This is used for auto-login scenarios where the server provides a JWT in the URL.
 * Unlike the standard TypeDBHttpDriver, this driver:
 * - Does not call /v1/signin
 * - Cannot refresh tokens (the token must remain valid for the session)
 * - Uses the provided token directly for all API calls
 */
export class TypeDBHttpDriverWithToken {
    private token: string;
    private address: string;

    constructor(params: DriverParamsWithToken) {
        this.token = params.token;
        this.address = params.address;
    }

    getDatabases(): Promise<ApiResponse<DatabasesListResponse>> {
        return this.apiGet(`/v1/databases`);
    }

    getDatabase(name: string): Promise<ApiResponse<Database>> {
        return this.apiGet(`/v1/databases/${encodeURIComponent(name)}`);
    }

    createDatabase(name: string): Promise<ApiResponse> {
        return this.apiPost(`/v1/databases/${encodeURIComponent(name)}`, {});
    }

    deleteDatabase(name: string): Promise<ApiResponse> {
        return this.apiDelete(`/v1/databases/${encodeURIComponent(name)}`);
    }

    getDatabaseSchema(name: string): Promise<ApiResponse<string>> {
        return this.apiGetString(`/v1/databases/${encodeURIComponent(name)}/schema`);
    }

    getDatabaseTypeSchema(name: string): Promise<ApiResponse<string>> {
        return this.apiGetString(`/v1/databases/${encodeURIComponent(name)}/type-schema`);
    }

    getUsers(): Promise<ApiResponse<UsersListResponse>> {
        return this.apiGet(`/v1/users`);
    }

    getCurrentUser(): Promise<ApiResponse<User>> {
        // For token-based auth, we can't know the username from params
        // The server will identify the user from the token
        // Try to get admin user (common for auto-login tokens)
        return this.apiGet<User>(`/v1/users/admin`);
    }

    getUser(username: string): Promise<ApiResponse<User>> {
        return this.apiGet(`/v1/users/${encodeURIComponent(username)}`);
    }

    createUser(username: string, password: string): Promise<ApiResponse> {
        return this.apiPost(`/v1/users/${encodeURIComponent(username)}`, { password });
    }

    updateUser(username: string, password: string): Promise<ApiResponse> {
        return this.apiPut(`/v1/users/${encodeURIComponent(username)}`, { password });
    }

    deleteUser(username: string): Promise<ApiResponse> {
        return this.apiDelete(`/v1/users/${encodeURIComponent(username)}`);
    }

    openTransaction(
        databaseName: string,
        transactionType: TransactionType,
        transactionOptions?: TransactionOptions
    ): Promise<ApiResponse<TransactionOpenResponse>> {
        return this.apiPost(`/v1/transactions/open`, { databaseName, transactionType, transactionOptions });
    }

    commitTransaction(transactionId: string): Promise<ApiResponse> {
        return this.apiPost(`/v1/transactions/${encodeURIComponent(transactionId)}/commit`, {});
    }

    closeTransaction(transactionId: string): Promise<ApiResponse> {
        return this.apiPost(`/v1/transactions/${encodeURIComponent(transactionId)}/close`, {});
    }

    rollbackTransaction(transactionId: string): Promise<ApiResponse> {
        return this.apiPost(`/v1/transactions/${encodeURIComponent(transactionId)}/rollback`, {});
    }

    analyze(
        transactionId: string,
        query: string,
        analyzeOptions?: AnalyzeOptions
    ): Promise<ApiResponse<AnalyzeResponse>> {
        return this.apiPost(`/v1/transactions/${encodeURIComponent(transactionId)}/analyze`, { query, analyzeOptions });
    }

    query(
        transactionId: string,
        query: string,
        queryOptions?: QueryOptions
    ): Promise<ApiResponse<QueryResponse>> {
        return this.apiPost(`/v1/transactions/${encodeURIComponent(transactionId)}/query`, { query, queryOptions });
    }

    oneShotQuery(
        query: string,
        commit: boolean,
        databaseName: string,
        transactionType: TransactionType,
        transactionOptions?: TransactionOptions,
        queryOptions?: QueryOptions
    ): Promise<ApiResponse<QueryResponse>> {
        return this.apiPost(`/v1/query`, { query, commit, databaseName, transactionType, transactionOptions, queryOptions });
    }

    health(): Promise<ApiResponse> {
        return this.apiGet(`/v1/health`);
    }

    version(): Promise<ApiResponse<VersionResponse>> {
        return this.apiGet(`/v1/version`);
    }

    private async apiGetString(path: string): Promise<ApiResponse<string>> {
        const resp = await this.apiReq("GET", path);
        if ("err" in resp) return resp;
        if (resp.ok) return { ok: await this.stringOrNull(resp) ?? "" };
        else {
            const json = await this.jsonOrNull(resp);
            if (isApiError(json)) return { err: json, status: resp.status };
            else throw resp;
        }
    }

    private async apiGet<T>(path: string): Promise<ApiResponse<T>> {
        return this.jsonApiReq("GET", path);
    }

    private async apiDelete<T>(path: string): Promise<ApiResponse<T>> {
        return this.jsonApiReq("DELETE", path);
    }

    private async apiPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
        return this.jsonApiReq("POST", path, body);
    }

    private async apiPut<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
        return this.jsonApiReq("PUT", path, body);
    }

    private async jsonApiReq<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
        const resp = await this.apiReq(method, path, body);
        if ("err" in resp) return resp;
        const json = await this.jsonOrNull(resp);
        if (resp.ok) return { ok: json };
        else if (isApiError(json)) return { err: json, status: resp.status };
        else throw resp;
    }

    private async apiReq(method: string, path: string, body?: unknown): Promise<Response | { err: { code: string; message: string }; status: number }> {
        const url = `${this.address}${path}`;
        const headers: Record<string, string> = {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json"
        };
        const bodyString = body !== undefined ? JSON.stringify(body) : undefined;

        let resp: Response;
        try {
            resp = await fetch(url, { method, body: bodyString, headers });
        } catch (networkError) {
            // Network error (server unreachable, CORS, etc.)
            const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
            return {
                err: {
                    code: "NET01",
                    message: `Failed to connect to server at ${this.address}. ${errorMessage}`
                },
                status: 0
            };
        }

        // For token-based auth, we cannot refresh the token
        // If we get 401, the token is invalid/expired
        if (resp.status === 401) {
            return {
                err: {
                    code: "AUT03",
                    message: "Auto-login token is invalid or expired. Please refresh the page to get a new token."
                },
                status: 401
            };
        }

        // Handle other common HTTP errors with helpful messages
        if (resp.status === 403) {
            return {
                err: {
                    code: "AUT04",
                    message: "Access denied. The auto-login token does not have permission for this operation."
                },
                status: 403
            };
        }

        if (resp.status >= 500) {
            return {
                err: {
                    code: "SRV01",
                    message: `Server error (${resp.status}). Please check if TypeDB server is running correctly.`
                },
                status: resp.status
            };
        }

        return resp;
    }

    private async jsonOrNull(resp: Response): Promise<any> {
        const contentLengthRaw = resp.headers.get("Content-Length");
        if (!contentLengthRaw) return null;
        const contentLength = parseInt(contentLengthRaw || "");
        if (isNaN(contentLength)) throw `Received invalid Content-Length header: ${contentLengthRaw}`;
        return contentLength > 0 ? await resp.json() : null;
    }

    private async stringOrNull(resp: Response): Promise<string | null> {
        const contentLengthRaw = resp.headers.get("Content-Length");
        if (!contentLengthRaw) return null;
        const contentLength = parseInt(contentLengthRaw || "");
        if (isNaN(contentLength)) throw `Received invalid Content-Length header: ${contentLengthRaw}`;
        return contentLength > 0 ? await resp.text() : null;
    }
}
