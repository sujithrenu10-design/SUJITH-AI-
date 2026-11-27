import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { BuildDiagnostic, WorkspaceFile } from "../lib/types";
import { cn } from "../utils/cn";

type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; file: WorkspaceFile };

function buildTree(files: WorkspaceFile[], emptyFolders: string[]): TreeNode[] {
  const rootFolders = new Map<string, { children: Set<string>; files: WorkspaceFile[] }>();
  const ensureDir = (dirPath: string) => {
    if (!rootFolders.has(dirPath)) rootFolders.set(dirPath, { children: new Set(), files: [] });
  };
  ensureDir("");

  const addDirHierarchy = (dirPath: string) => {
    if (!dirPath) return;
    const parts = dirPath.split("/").filter(Boolean);
    let curr = "";
    for (const part of parts) {
      const parent = curr;
      curr = curr ? `${curr}/${part}` : part;
      ensureDir(parent);
      ensureDir(curr);
      rootFolders.get(parent)!.children.add(curr);
    }
  };

  for (const folder of emptyFolders) {
    addDirHierarchy(folder);
  }
  for (const file of files) {
    const parts = file.path.split("/");
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    addDirHierarchy(dirPath);
    ensureDir(dirPath);
    rootFolders.get(dirPath)!.files.push(file);
  }

  const toNodes = (dirPath: string): TreeNode[] => {
    const bucket = rootFolders.get(dirPath);
    if (!bucket) return [];
    const folderNodes: TreeNode[] = [...bucket.children]
      .sort((a, b) => a.localeCompare(b))
      .map((childPath) => ({
        kind: "folder" as const,
        name: childPath.split("/").pop() || childPath,
        path: childPath,
        children: toNodes(childPath),
      }));
    const fileNodes: TreeNode[] = [...bucket.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({
        kind: "file" as const,
        name: file.path.split("/").pop() || file.path,
        path: file.path,
        file,
      }));
    return [...folderNodes, ...fileNodes];
  };

  return toNodes("");
}

function extBadge(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || ext === path.toLowerCase()) return "TXT";
  return ext.slice(0, 4).toUpperCase();
}

export function FileExplorer({
  files,
  emptyFolders,
  activePath,
  diagnostics,
  busy,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRenameFile,
  onDeleteFile,
  onImportFiles,
  onExportZip,
}: {
  files: WorkspaceFile[];
  emptyFolders: string[];
  activePath: string;
  diagnostics: BuildDiagnostic[];
  busy: boolean;
  onOpenFile: (path: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRenameFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onImportFiles: () => void;
  onExportZip: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const tree = useMemo(() => buildTree(files, emptyFolders), [files, emptyFolders]);
  const errorMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of diagnostics) {
      if (d.severity === "error") counts[d.path] = (counts[d.path] || 0) + 1;
    }
    return counts;
  }, [diagnostics]);

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNodes = (nodes: TreeNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.kind === "folder") {
        const isClosed = Boolean(collapsed[node.path]);
        return (
          <div key={`dir:${node.path}`}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${10 + depth * 14}px` }}
              className="flex w-full items-center gap-2 rounded-xl py-2 pr-2.5 text-left text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            >
              {isClosed ? <ChevronRight size={12} className="shrink-0 text-[var(--muted)]" /> : <ChevronDown size={12} className="shrink-0 text-[var(--muted)]" />}
              {isClosed ? <Folder size={14} className="shrink-0 text-[var(--blue)]" /> : <FolderOpen size={14} className="shrink-0 text-[var(--blue)]" />}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
            {!isClosed && <div>{renderNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const selected = node.path === activePath;
      const errCount = errorMap[node.path] || 0;
      return (
        <div
          key={`file:${node.path}`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          className={cn(
            "group flex items-center gap-2 rounded-xl py-2 pr-2 transition",
            selected ? "bg-[var(--surface-muted)] text-[var(--ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          )}
        >
          <button
            type="button"
            onClick={() => onOpenFile(node.path)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <FileCode2 size={14} className="shrink-0 text-[var(--muted)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium">{node.name}</span>
              <span className="mt-0.5 block text-[9px] text-[var(--muted)]">
                {new Blob([node.file.content]).size.toLocaleString()} B · {node.file.language}
              </span>
            </span>
          </button>
          <span className="shrink-0 rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-[var(--muted)]">
            {extBadge(node.path)}
          </span>
          {errCount > 0 && (
            <span className="shrink-0 rounded bg-[#fce8e6] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#bb3c37]">
              {errCount}
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRenameFile(node.path)}
            aria-label={`Rename ${node.path}`}
            className="icon-button !h-7 !w-7 shrink-0"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeleteFile(node.path)}
            aria-label={`Delete ${node.path}`}
            className="icon-button !h-7 !w-7 shrink-0 hover:!text-[#bb3c37]"
          >
            <Trash2 size={11} />
          </button>
        </div>
      );
    });

  return (
    <section className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5 px-1">
        <h2 className="text-[12px] font-semibold text-[var(--ink)]">Project files ({files.length})</h2>
        <div className="flex items-center gap-1">
          <button type="button" disabled={busy} onClick={onNewFile} className="toolbar-action">
            <Plus size={12} />File
          </button>
          <button type="button" disabled={busy} onClick={onNewFolder} className="toolbar-action">
            <FolderPlus size={12} />Folder
          </button>
          <button type="button" disabled={busy} onClick={onImportFiles} className="toolbar-action">
            <Upload size={12} />Import
          </button>
          <button type="button" disabled={!files.length} onClick={onExportZip} className="toolbar-action">
            <Download size={12} />ZIP
          </button>
        </div>
      </div>
      <div className="space-y-0.5">{renderNodes(tree)}</div>
    </section>
  );
}
