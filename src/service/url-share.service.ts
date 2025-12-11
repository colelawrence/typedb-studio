/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Injectable } from "@angular/core";
import { ExportedQueriesFile } from "../concept/query-export";
import { QueryExportService } from "./query-export.service";

export interface ShareLinkResult {
    link: string;
    stats: {
        queries: number;
        folders: number;
        sizeKB: number;
    };
    warning?: string;
}

export interface ShareLinkError {
    error: string;
    suggestion: string;
    stats: {
        queries: number;
        folders: number;
        sizeKB: number;
    };
}

const MAX_URL_SIZE_KB = 50; // Safe limit for most browsers
const WARN_URL_SIZE_KB = 20; // Warn if larger than this

@Injectable({
    providedIn: "root",
})
export class UrlShareService {
    constructor(private queryExportService: QueryExportService) {}

    /**
     * Encode exported queries data for URL sharing using gzip compression
     */
    async encodeForUrl(data: ExportedQueriesFile): Promise<string> {
        const json = JSON.stringify(data);
        const blob = new Blob([json]);

        // Use native browser compression
        const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
        const compressed = await new Response(stream).arrayBuffer();

        // Base64url encode (URL-safe variant)
        return this.base64UrlEncode(new Uint8Array(compressed));
    }

    /**
     * Decode and decompress shared queries from URL
     */
    async decodeFromUrl(encoded: string): Promise<ExportedQueriesFile> {
        try {
            const compressed = this.base64UrlDecode(encoded);
            const stream = new Blob([compressed])
                .stream()
                .pipeThrough(new DecompressionStream('gzip'));
            const json = await new Response(stream).text();

            // Parse and validate
            const data = JSON.parse(json);
            return this.queryExportService.validateImport(data);
        } catch (e) {
            throw new Error(`Failed to decode share link: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Generate a share link for a folder with size validation
     */
    async generateShareLink(folderId: string): Promise<ShareLinkResult | ShareLinkError> {
        const exportData = this.queryExportService.exportFolder(folderId);
        const encoded = await this.encodeForUrl(exportData);

        const stats = {
            queries: exportData.queries.length,
            folders: exportData.folders.length,
            sizeKB: encoded.length / 1024,
        };

        // Check size limits
        if (stats.sizeKB > MAX_URL_SIZE_KB) {
            return {
                error: 'Folder too large for link sharing',
                suggestion: 'Try: Export as file, or use GitHub Gist (coming soon)',
                stats,
            };
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}#share=${encoded}`;

        if (stats.sizeKB > WARN_URL_SIZE_KB) {
            return {
                link,
                stats,
                warning: 'Large link (may not work in some email clients)',
            };
        }

        return { link, stats };
    }

    /**
     * Generate a share link for a single query
     */
    async generateQueryShareLink(queryId: string): Promise<ShareLinkResult | ShareLinkError> {
        const exportData = this.queryExportService.exportQuery(queryId);
        const encoded = await this.encodeForUrl(exportData);

        const stats = {
            queries: exportData.queries.length,
            folders: exportData.folders.length,
            sizeKB: encoded.length / 1024,
        };

        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}#share=${encoded}`;

        return { link, stats };
    }

    /**
     * Estimate compressed size before actually compressing (approximate)
     */
    estimateCompressedSize(data: ExportedQueriesFile): number {
        const json = JSON.stringify(data);
        // Rough estimate: gzip typically achieves 60-70% compression on JSON
        return Math.ceil(json.length * 0.35);
    }

    /**
     * Convert Uint8Array to URL-safe base64 string
     */
    private base64UrlEncode(bytes: Uint8Array): string {
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));

        // Use standard base64 then make URL-safe
        return btoa(binary)
            .replace(/\+/g, '-')  // Replace + with -
            .replace(/\//g, '_')  // Replace / with _
            .replace(/=/g, '');   // Remove padding
    }

    /**
     * Convert URL-safe base64 string back to Uint8Array
     */
    private base64UrlDecode(str: string): Uint8Array {
        // Convert back to standard base64
        str = str.replace(/-/g, '+').replace(/_/g, '/');

        // Add padding back if needed
        while (str.length % 4) {
            str += '=';
        }

        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return bytes;
    }

    /**
     * Extract a friendly name from a URL
     */
    extractNameFromUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const filename = pathParts[pathParts.length - 1] || '';

            const nameWithoutExt = filename.replace(/\.json$/i, '');
            if (nameWithoutExt) {
                return nameWithoutExt
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
            }

            return parsed.host;
        } catch {
            return 'Shared Queries';
        }
    }
}
