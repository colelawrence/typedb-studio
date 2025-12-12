/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AsyncPipe, DatePipe, NgTemplateOutlet } from "@angular/common";
import { Component, EventEmitter, HostBinding, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatTreeModule } from "@angular/material/tree";
import { BehaviorSubject, debounceTime, distinctUntilChanged, Subject } from "rxjs";
import { AppData } from "../../../service/app-data.service";
import { QueryExportService } from "../../../service/query-export.service";
import { SnackbarService } from "../../../service/snackbar.service";
import { UrlShareService } from "../../../service/url-share.service";
import {
    SavedQuery,
    SavedQueryFolder,
    UNSORTED_FOLDER_ID,
    URL_IMPORTS_FOLDER_ID,
} from "../../../concept/saved-query";
import { SavedQueryDialogComponent, SavedQueryDialogData, SavedQueryDialogResult } from "./saved-query-dialog.component";
import { FolderDialogComponent, FolderDialogData, FolderDialogResult } from "./folder-dialog.component";
import { MoveDialogComponent, MoveDialogData, MoveDialogResult } from "./move-dialog.component";
import { ImportDialogComponent, ImportDialogData, ImportDialogResult } from "./import-dialog.component";

export interface SavedQueryTreeNode {
    id: string;
    name: string;
    type: "folder" | "query" | "unsorted" | "url-imports" | "shared-section" | "shared-folder" | "shared-query";
    children?: SavedQueryTreeNode[];
    data?: SavedQuery | SavedQueryFolder | any;
    level: number;
    /** True if this item was imported from URL and can be saved to user's folders */
    isImported?: boolean;
    /** True if this is part of the shared section */
    isShared?: boolean;
    /** True if this query is currently selected in the shared section */
    isSelected?: boolean;
}

@Component({
    selector: "ts-saved-queries-window",
    templateUrl: "saved-queries-window.component.html",
    styleUrls: ["saved-queries-window.component.scss"],
    imports: [
        AsyncPipe,
        DatePipe,
        FormsModule,
        NgTemplateOutlet,
        MatButtonModule,
        MatDividerModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatTooltipModule,
        MatTreeModule,
    ],
})
export class SavedQueriesWindowComponent {
    @HostBinding("class") readonly clazz = "saved-queries-pane";
    @Output() querySelected = new EventEmitter<SavedQuery>();

    readonly treeData$ = new BehaviorSubject<SavedQueryTreeNode[]>([]);
    readonly filteredTreeData$ = new BehaviorSubject<SavedQueryTreeNode[]>([]);
    readonly expandedNodes = new Set<string>([UNSORTED_FOLDER_ID]);
    
    searchText = "";
    private searchSubject = new Subject<string>();

    constructor(
        private appData: AppData,
        private dialog: MatDialog,
        private snackbar: SnackbarService,
        private queryExportService: QueryExportService,
        private urlShareService: UrlShareService,
    ) {
        this.refreshTree();

        this.searchSubject.pipe(
            debounceTime(200),
            distinctUntilChanged(),
        ).subscribe((searchText) => {
            this.applyFilter(searchText);
        });

        // Subscribe to shared queries and refresh tree when they change
        this.appData.sharedQueries$.subscribe(() => {
            this.refreshTree();
        });
    }

    onSearchChange(value: string): void {
        this.searchSubject.next(value);
    }

    clearSearch(): void {
        this.searchText = "";
        this.applyFilter("");
    }

    private applyFilter(searchText: string): void {
        const tree = this.treeData$.value;
        if (!searchText.trim()) {
            this.filteredTreeData$.next(tree);
            return;
        }

        const lowerSearch = searchText.toLowerCase();
        const filtered = this.filterTree(tree, lowerSearch);
        this.filteredTreeData$.next(filtered);
        
        this.expandAllFilteredFolders(filtered);
    }

    private filterTree(nodes: SavedQueryTreeNode[], searchText: string): SavedQueryTreeNode[] {
        const result: SavedQueryTreeNode[] = [];
        
        for (const node of nodes) {
            if (node.type === "query") {
                const query = node.data as SavedQuery;
                const nameMatch = node.name.toLowerCase().includes(searchText);
                const textMatch = query.queryText?.toLowerCase().includes(searchText);
                if (nameMatch || textMatch) {
                    result.push(node);
                }
            } else {
                const filteredChildren = node.children ? this.filterTree(node.children, searchText) : [];
                const folderNameMatch = node.name.toLowerCase().includes(searchText);
                
                if (filteredChildren.length > 0 || (folderNameMatch && node.type !== "unsorted")) {
                    result.push({
                        ...node,
                        children: filteredChildren.length > 0 ? filteredChildren : node.children,
                    });
                }
            }
        }
        
        return result;
    }

    private expandAllFilteredFolders(nodes: SavedQueryTreeNode[]): void {
        for (const node of nodes) {
            if (node.type === "folder" || node.type === "unsorted") {
                this.expandedNodes.add(node.id);
                if (node.children) {
                    this.expandAllFilteredFolders(node.children);
                }
            }
        }
    }

    refreshTree(): void {
        const folders = this.appData.savedQueries.listFolders();
        const queries = this.appData.savedQueries.listQueries();
        const sharedState = this.appData.getSharedQueries();
        const tree = this.buildTree(folders, queries, sharedState);
        this.treeData$.next(tree);
        this.applyFilter(this.searchText);
    }

    private buildTree(
        folders: SavedQueryFolder[],
        queries: SavedQuery[],
        sharedState: any | null
    ): SavedQueryTreeNode[] {
        const result: SavedQueryTreeNode[] = [];

        const unsortedQueries = queries.filter(q => !q.folderId && !q.importKey);

        // Only show Unsorted section if there are queries in it
        if (unsortedQueries.length > 0) {
            const unsortedNode: SavedQueryTreeNode = {
                id: UNSORTED_FOLDER_ID,
                name: "Unsorted",
                type: "unsorted",
                level: 0,
                children: unsortedQueries.map(q => ({
                    id: q.id,
                    name: q.name,
                    type: "query" as const,
                    data: q,
                    level: 1,
                })),
            };
            result.push(unsortedNode);
        }

        const rootFolders = folders.filter(f => !f.parentId && f.id !== URL_IMPORTS_FOLDER_ID);
        for (const folder of rootFolders) {
            result.push(this.buildFolderNode(folder, folders, queries, 0, false));
        }

        // Add shared section if present
        if (sharedState) {
            const sharedNode = this.buildSharedSection(sharedState);
            result.push(sharedNode);
            // Auto-expand shared section
            this.expandedNodes.add("__shared__");
        }

        const urlImportsFolder = folders.find(f => f.id === URL_IMPORTS_FOLDER_ID);
        if (urlImportsFolder) {
            const urlImportsNode = this.buildUrlImportsFolderNode(urlImportsFolder, folders, queries);
            result.push(urlImportsNode);
        }

        return result;
    }

    private buildUrlImportsFolderNode(
        folder: SavedQueryFolder,
        allFolders: SavedQueryFolder[],
        allQueries: SavedQuery[],
    ): SavedQueryTreeNode {
        const childFolders = allFolders.filter(f => f.parentId === folder.id);
        const childQueries = allQueries.filter(q => q.folderId === folder.id);

        const children: SavedQueryTreeNode[] = [
            ...childFolders.map(f => this.buildFolderNode(f, allFolders, allQueries, 1, true)),
            ...childQueries.map(q => ({
                id: q.id,
                name: q.name,
                type: "query" as const,
                data: q,
                level: 1,
                isImported: true,
            })),
        ];

        return {
            id: folder.id,
            name: folder.name,
            type: "url-imports",
            data: folder,
            level: 0,
            children,
        };
    }

    private buildFolderNode(
        folder: SavedQueryFolder,
        allFolders: SavedQueryFolder[],
        allQueries: SavedQuery[],
        level: number,
        isImported: boolean,
    ): SavedQueryTreeNode {
        const childFolders = allFolders.filter(f => f.parentId === folder.id);
        const childQueries = allQueries.filter(q => q.folderId === folder.id);

        const children: SavedQueryTreeNode[] = [
            ...childFolders.map(f => this.buildFolderNode(f, allFolders, allQueries, level + 1, isImported)),
            ...childQueries.map(q => ({
                id: q.id,
                name: q.name,
                type: "query" as const,
                data: q,
                level: level + 1,
                isImported,
            })),
        ];

        return {
            id: folder.id,
            name: folder.name,
            type: "folder",
            data: folder,
            level,
            children,
            isImported,
        };
    }

    private buildSharedSection(sharedState: any): SavedQueryTreeNode {
        const selectedQueryId = sharedState.selectedQueryId;

        // Build children from shared data
        const children: SavedQueryTreeNode[] = [];

        // Add folders
        const rootFolders = sharedState.data.folders.filter((f: any) => !f.parentId);
        for (const folder of rootFolders) {
            children.push(this.buildSharedFolderNode(folder, sharedState.data.folders, sharedState.data.queries, 1, selectedQueryId));
        }

        // Add root-level queries (no folderId)
        const rootQueries = sharedState.data.queries.filter((q: any) => !q.folderId);
        for (const query of rootQueries) {
            children.push({
                id: `shared_${query.id}`,
                name: query.name,
                type: "shared-query" as const,
                data: query,
                level: 1,
                isShared: true,
                isSelected: query.id === selectedQueryId,
            });
        }

        return {
            id: "__shared__",
            name: sharedState.displayName,
            type: "shared-section",
            level: 0,
            isShared: true,
            children,
        };
    }

    private buildSharedFolderNode(
        folder: any,
        allFolders: any[],
        allQueries: any[],
        level: number,
        selectedQueryId?: string
    ): SavedQueryTreeNode {
        const childFolders = allFolders.filter(f => f.parentId === folder.id);
        const childQueries = allQueries.filter(q => q.folderId === folder.id);

        const children: SavedQueryTreeNode[] = [
            ...childFolders.map(f => this.buildSharedFolderNode(f, allFolders, allQueries, level + 1, selectedQueryId)),
            ...childQueries.map(q => ({
                id: `shared_${q.id}`,
                name: q.name,
                type: "shared-query" as const,
                data: q,
                level: level + 1,
                isShared: true,
                isSelected: q.id === selectedQueryId,
            })),
        ];

        return {
            id: `shared_folder_${folder.id}`,
            name: folder.name,
            type: "shared-folder",
            data: folder,
            level,
            isShared: true,
            children,
        };
    }

    childrenAccessor = (node: SavedQueryTreeNode): SavedQueryTreeNode[] => node.children ?? [];

    hasChild = (_: number, node: SavedQueryTreeNode): boolean =>
        node.type === "folder" || node.type === "unsorted" || node.type === "url-imports" ||
        node.type === "shared-section" || node.type === "shared-folder";

    isExpanded(node: SavedQueryTreeNode): boolean {
        return this.expandedNodes.has(node.id);
    }

    toggleNode(node: SavedQueryTreeNode): void {
        if (this.expandedNodes.has(node.id)) {
            this.expandedNodes.delete(node.id);
        } else {
            this.expandedNodes.add(node.id);
        }
    }

    selectQuery(node: SavedQueryTreeNode): void {
        if (node.type === "query" && node.data) {
            this.querySelected.emit(node.data as SavedQuery);
        } else if (node.type === "shared-query" && node.data) {
            // Emit shared query as if it's a saved query for loading in editor
            const sharedQuery: SavedQuery = {
                id: node.data.id,
                name: node.data.name,
                queryText: node.data.queryText,
                description: node.data.description,
                folderId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            this.querySelected.emit(sharedQuery);

            // Mark as selected in shared state
            this.appData.markSharedQueryAsSelected(node.data.id);
        }
    }

    nodeIcon(node: SavedQueryTreeNode): string {
        switch (node.type) {
            case "unsorted":
                return "fa-light fa-inbox";
            case "url-imports":
                return this.isExpanded(node) ? "fa-light fa-cloud-arrow-down" : "fa-light fa-cloud";
            case "folder":
            case "shared-folder":
                return this.isExpanded(node) ? "fa-light fa-folder-open" : "fa-light fa-folder";
            case "query":
            case "shared-query":
                return node.isImported ? "fa-light fa-file-arrow-down" : "fa-light fa-file-code";
            case "shared-section":
                return "fa-light fa-share-nodes";
            default:
                return "fa-light fa-file";
        }
    }

    trackByFn(_: number, node: SavedQueryTreeNode): string {
        return node.id;
    }

    createFolder(parentId: string | null = null): void {
        const dialogRef = this.dialog.open(FolderDialogComponent, {
            width: "400px",
            data: { mode: "create", parentId } as FolderDialogData,
        });

        dialogRef.afterClosed().subscribe((result: FolderDialogResult | undefined) => {
            if (result?.action === "save") {
                this.appData.savedQueries.createFolder(result.name, parentId);
                this.refreshTree();
                if (parentId) {
                    this.expandedNodes.add(parentId);
                }
            }
        });
    }

    renameFolder(folder: SavedQueryFolder): void {
        const dialogRef = this.dialog.open(FolderDialogComponent, {
            width: "400px",
            data: { mode: "rename", name: folder.name } as FolderDialogData,
        });

        dialogRef.afterClosed().subscribe((result: FolderDialogResult | undefined) => {
            if (result?.action === "save") {
                this.appData.savedQueries.updateFolder(folder.id, { name: result.name });
                this.refreshTree();
            }
        });
    }

    deleteFolder(folder: SavedQueryFolder): void {
        const queries = this.appData.savedQueries.listQueries().filter(q => q.folderId === folder.id);
        const childFolders = this.appData.savedQueries.listFolders().filter(f => f.parentId === folder.id);
        
        if (queries.length > 0 || childFolders.length > 0) {
            const count = queries.length + childFolders.length;
            if (!confirm(`Delete folder "${folder.name}" and its ${count} item(s)?`)) {
                return;
            }
        }

        this.appData.savedQueries.deleteFolder(folder.id, true);
        this.refreshTree();
        this.snackbar.success(`Folder "${folder.name}" deleted`);
    }

    createQuery(folderId: string | null = null): void {
        const dialogRef = this.dialog.open(SavedQueryDialogComponent, {
            width: "500px",
            data: { mode: "create", folderId } as SavedQueryDialogData,
        });

        dialogRef.afterClosed().subscribe((result: SavedQueryDialogResult | undefined) => {
            if (result?.action === "save") {
                this.appData.savedQueries.createQuery({
                    name: result.name,
                    queryText: result.queryText || "",
                    folderId,
                    description: result.description,
                });
                this.refreshTree();
                if (folderId) {
                    this.expandedNodes.add(folderId);
                } else {
                    this.expandedNodes.add(UNSORTED_FOLDER_ID);
                }
            }
        });
    }

    renameQuery(query: SavedQuery): void {
        const dialogRef = this.dialog.open(SavedQueryDialogComponent, {
            width: "500px",
            data: { mode: "rename", name: query.name, description: query.description } as SavedQueryDialogData,
        });

        dialogRef.afterClosed().subscribe((result: SavedQueryDialogResult | undefined) => {
            if (result?.action === "save") {
                this.appData.savedQueries.updateQuery(query.id, {
                    name: result.name,
                    description: result.description,
                });
                this.refreshTree();
            }
        });
    }

    deleteQuery(query: SavedQuery): void {
        if (!confirm(`Delete query "${query.name}"?`)) {
            return;
        }

        this.appData.savedQueries.deleteQuery(query.id);
        this.refreshTree();
        this.snackbar.success(`Query "${query.name}" deleted`);
    }

    moveItem(node: SavedQueryTreeNode): void {
        const folders = this.appData.savedQueries.listFolders()
            .filter(f => !f.importKey && f.id !== URL_IMPORTS_FOLDER_ID);
        const dialogRef = this.dialog.open(MoveDialogComponent, {
            width: "400px",
            data: {
                itemName: node.name,
                itemType: node.type,
                currentFolderId: node.type === "query"
                    ? (node.data as SavedQuery).folderId
                    : (node.data as SavedQueryFolder).parentId,
                folders,
            } as MoveDialogData,
        });

        dialogRef.afterClosed().subscribe((result: MoveDialogResult | undefined) => {
            if (result?.action === "move" || result?.action === "create-folder-and-move") {
                let targetFolderId = result.targetFolderId;

                if (result.action === "create-folder-and-move" && result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    targetFolderId = newFolder.id;
                }

                if (node.type === "query") {
                    this.appData.savedQueries.updateQuery(node.id, { folderId: targetFolderId });
                } else if (node.type === "folder") {
                    this.appData.savedQueries.updateFolder(node.id, { parentId: targetFolderId });
                }
                this.refreshTree();
                if (targetFolderId) {
                    this.expandedNodes.add(targetFolderId);
                } else {
                    this.expandedNodes.add(UNSORTED_FOLDER_ID);
                }
            }
        });
    }

    onContextMenu(event: MouseEvent, node: SavedQueryTreeNode, menuTrigger: any): void {
        event.preventDefault();
        menuTrigger.openMenu();
    }

    exportQueries(): void {
        this.queryExportService.downloadAsFile();
        this.snackbar.success("Queries exported");
    }

    importQueries(): void {
        const dialogRef = this.dialog.open(ImportDialogComponent, {
            width: "500px",
            data: { mode: "file" } as ImportDialogData,
        });

        dialogRef.afterClosed().subscribe((result: ImportDialogResult | undefined) => {
            if (result?.action === "import" && result.data) {
                const importResult = this.queryExportService.importQueries(result.data, result.strategy);
                this.refreshTree();

                if (importResult.success) {
                    const parts: string[] = [];
                    const added = importResult.foldersAdded + importResult.queriesAdded;
                    const updated = importResult.foldersUpdated + importResult.queriesUpdated;
                    if (added > 0) parts.push(`${added} added`);
                    if (updated > 0) parts.push(`${updated} updated`);
                    this.snackbar.success(`Import complete: ${parts.join(", ") || "no changes"}`);
                } else {
                    this.snackbar.warnPersistent(
                        `Import completed with errors: ${importResult.errors.join("; ")}`
                    );
                }
            }
        });
    }

    exportFolder(folder: SavedQueryFolder): void {
        this.queryExportService.downloadFolderAsFile(folder.id, folder.name);
        this.snackbar.success(`Folder "${folder.name}" exported`);
    }

    exportSingleQuery(query: SavedQuery): void {
        this.queryExportService.downloadQueryAsFile(query.id, query.name);
        this.snackbar.success(`Query "${query.name}" exported`);
    }

    saveImportedQueryToMyQueries(query: SavedQuery): void {
        const folders = this.appData.savedQueries.listFolders()
            .filter(f => !f.importKey && f.id !== URL_IMPORTS_FOLDER_ID);

        const dialogRef = this.dialog.open(MoveDialogComponent, {
            width: "400px",
            data: {
                itemName: query.name,
                itemType: "query",
                currentFolderId: null,
                folders,
            } as MoveDialogData,
        });

        dialogRef.afterClosed().subscribe((result: MoveDialogResult | undefined) => {
            if (result?.action === "move" || result?.action === "create-folder-and-move") {
                let targetFolderId = result.targetFolderId;

                if (result.action === "create-folder-and-move" && result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    targetFolderId = newFolder.id;
                    this.expandedNodes.add(newFolder.id);
                }

                this.appData.savedQueries.createQuery({
                    name: query.name,
                    queryText: query.queryText,
                    description: query.description,
                    folderId: targetFolderId,
                });
                this.refreshTree();
                this.snackbar.success(`Query "${query.name}" saved to your queries`);
            }
        });
    }

    async copyFolderShareLink(folder: SavedQueryFolder): Promise<void> {
        try {
            const result = await this.urlShareService.generateShareLink(folder.id);

            if ('error' in result) {
                // Too large
                this.snackbar.errorPersistent(`${result.error}. ${result.suggestion}`);
                return;
            }

            // Copy to clipboard
            await navigator.clipboard.writeText(result.link);

            // Show success
            const count = result.stats.queries;
            const message = `Share link copied! (${count} quer${count === 1 ? 'y' : 'ies'})`;

            if (result.warning) {
                this.snackbar.warn(message + ' - ' + result.warning);
            } else {
                this.snackbar.success(message);
            }
        } catch (e) {
            this.snackbar.errorPersistent(`Failed to generate share link: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async copyQueryShareLink(query: SavedQuery): Promise<void> {
        try {
            const result = await this.urlShareService.generateQueryShareLink(query.id);

            if ('error' in result) {
                this.snackbar.errorPersistent(`${result.error}. ${result.suggestion}`);
                return;
            }

            // Copy to clipboard
            await navigator.clipboard.writeText(result.link);

            // Show success
            this.snackbar.success('Share link copied!');
        } catch (e) {
            this.snackbar.errorPersistent(`Failed to generate share link: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    nameAndOrganizeUnsorted(): void {
        const unsortedQueries = this.appData.savedQueries.listQueries().filter(q => !q.folderId && !q.importKey);

        if (unsortedQueries.length === 0) {
            this.snackbar.warn('No unsorted queries to organize');
            return;
        }

        const dialogRef = this.dialog.open(FolderDialogComponent, {
            width: "400px",
            data: {
                mode: "create",
                parentId: null,
                name: "Unsorted Queries" // Default suggestion
            } as FolderDialogData,
        });

        dialogRef.afterClosed().subscribe((result: FolderDialogResult | undefined) => {
            if (result?.action === "save") {
                // Create the new folder
                const newFolder = this.appData.savedQueries.createFolder(result.name, null);

                // Move all unsorted queries into it
                for (const query of unsortedQueries) {
                    this.appData.savedQueries.updateQuery(query.id, { folderId: newFolder.id });
                }

                this.refreshTree();
                this.expandedNodes.add(newFolder.id);
                this.snackbar.success(`Organized ${unsortedQueries.length} quer${unsortedQueries.length === 1 ? 'y' : 'ies'} into "${result.name}"`);
            }
        });
    }

    dismissSharedQueries(): void {
        this.appData.dismissSharedQueries();
        this.snackbar.success('Shared queries dismissed');
    }

    saveAllSharedQueries(): void {
        const folders = this.appData.savedQueries.listFolders()
            .filter(f => !f.importKey && f.id !== URL_IMPORTS_FOLDER_ID);

        const dialogRef = this.dialog.open(MoveDialogComponent, {
            width: "400px",
            data: {
                itemName: "all shared queries",
                itemType: "folder",
                currentFolderId: null,
                folders,
            } as MoveDialogData,
        });

        dialogRef.afterClosed().subscribe((result: MoveDialogResult | undefined) => {
            if (result?.action === "move" || result?.action === "create-folder-and-move") {
                let targetFolderId = result.targetFolderId;

                if (result.action === "create-folder-and-move" && result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    targetFolderId = newFolder.id;
                    this.expandedNodes.add(newFolder.id);
                }

                this.appData.saveAllSharedQueries(targetFolderId);
                this.refreshTree();
                this.snackbar.success('All shared queries saved to your queries');
            }
        });
    }

    saveSharedQueryToMyQueries(query: any): void {
        const folders = this.appData.savedQueries.listFolders()
            .filter(f => !f.importKey && f.id !== URL_IMPORTS_FOLDER_ID);

        const dialogRef = this.dialog.open(MoveDialogComponent, {
            width: "400px",
            data: {
                itemName: query.name,
                itemType: "query",
                currentFolderId: null,
                folders,
            } as MoveDialogData,
        });

        dialogRef.afterClosed().subscribe((result: MoveDialogResult | undefined) => {
            if (result?.action === "move" || result?.action === "create-folder-and-move") {
                let targetFolderId = result.targetFolderId;

                if (result.action === "create-folder-and-move" && result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    targetFolderId = newFolder.id;
                    this.expandedNodes.add(newFolder.id);
                }

                const savedQuery = this.appData.saveSharedQueryToMyQueries(query.id, targetFolderId);
                if (savedQuery) {
                    this.refreshTree();
                    this.snackbar.success(`Query "${query.name}" saved to your queries`);
                }
            }
        });
    }

    saveSharedFolderToMyQueries(folder: any): void {
        const folders = this.appData.savedQueries.listFolders()
            .filter(f => !f.importKey && f.id !== URL_IMPORTS_FOLDER_ID);

        const dialogRef = this.dialog.open(MoveDialogComponent, {
            width: "400px",
            data: {
                itemName: folder.name,
                itemType: "folder",
                currentFolderId: null,
                folders,
            } as MoveDialogData,
        });

        dialogRef.afterClosed().subscribe((result: MoveDialogResult | undefined) => {
            if (result?.action === "move" || result?.action === "create-folder-and-move") {
                let targetFolderId = result.targetFolderId;

                if (result.action === "create-folder-and-move" && result.newFolderName) {
                    const newFolder = this.appData.savedQueries.createFolder(result.newFolderName, null);
                    targetFolderId = newFolder.id;
                    this.expandedNodes.add(newFolder.id);
                }

                this.appData.saveSharedFolderToMyQueries(folder.id, targetFolderId);
                this.refreshTree();
                this.snackbar.success(`Folder "${folder.name}" saved to your queries`);
            }
        });
    }
}
