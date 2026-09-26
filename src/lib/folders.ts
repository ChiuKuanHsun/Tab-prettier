/**
 * Folders on this computer as image sources (File System Access API): one for backgrounds, one
 * for characters. The directory handle is kept in IndexedDB, so the offscreen pipeline can read
 * it too; files are listed when a scene is made, so whatever is in the folder then counts. Chrome
 * may ask again for read access after a restart — until the user allows it (a click on the new
 * tab or in the settings), the folder is skipped.
 */
import { kvGet, kvSet, db } from './db';
import type { MediaKind, Upload } from './types';

// Not in TypeScript's DOM types yet.
type Access = 'granted' | 'denied' | 'prompt';
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(d: { mode: 'read' }): Promise<Access>;
  requestPermission(d: { mode: 'read' }): Promise<Access>;
};
declare global {
  interface Window {
    showDirectoryPicker(o?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

export type FolderRole = Upload['role'];
export type FolderHandle = DirHandle;

const key = (role: FolderRole) => `folder:${role}`;

export const getFolder = (role: FolderRole) => kvGet<FolderHandle>(key(role));

/** Lets the user pick the folder (from a click); undefined when they cancel. */
export async function bindFolder(role: FolderRole): Promise<FolderHandle | undefined> {
  try {
    const h = (await window.showDirectoryPicker({ id: `tab-prettier-${role}`, mode: 'read' })) as FolderHandle;
    await kvSet(key(role), h);
    return h;
  } catch {
    return undefined;
  }
}

export const unbindFolder = async (role: FolderRole) => (await db()).delete('kv', key(role));

export const folderAccess = (h: FolderHandle) => h.queryPermission({ mode: 'read' });

/** Asks Chrome for read access again; must run from a click. */
export const allowFolder = (h: FolderHandle) => h.requestPermission({ mode: 'read' }).then((a) => a === 'granted');

const MEDIA = /\.(jpe?g|png|webp|avif|gif|bmp|mp4|webm)$/i;
export const mediaKind = (name: string): MediaKind => (/\.(mp4|webm)$/i.test(name) ? 'video' : /\.gif$/i.test(name) ? 'gif' : 'image');

/** Whether a file name is one this role can use: characters are still images only. */
export const usableFile = (name: string, role: FolderRole) => MEDIA.test(name) && (role === 'bg' || mediaKind(name) === 'image');

export interface FolderFile { path: string; handle: FileSystemFileHandle }

/** The usable files in the folder and its subfolders (two levels down), skipping hidden ones. */
export async function listFolder(h: FolderHandle, role: FolderRole, depth = 2, prefix = ''): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for await (const entry of h.values()) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix + entry.name;
    if (entry.kind === 'file') {
      if (usableFile(entry.name, role)) out.push({ path, handle: entry as FileSystemFileHandle });
    } else if (depth > 0) {
      out.push(...(await listFolder(entry as FolderHandle, role, depth - 1, `${path}/`)));
    }
  }
  return out;
}

/** The folder's files if it's bound and readable right now (no prompts: this runs in the background). */
export async function readableFolderFiles(role: FolderRole): Promise<FolderFile[]> {
  const h = await getFolder(role);
  if (!h) return [];
  try {
    return (await folderAccess(h)) === 'granted' ? await listFolder(h, role) : [];
  } catch {
    return []; // moved or deleted since it was chosen
  }
}

/** A folder file read in as an upload, so the pipeline treats it like one. */
export async function folderUpload(f: FolderFile, role: FolderRole): Promise<Upload> {
  const file = await f.handle.getFile();
  return { id: `folder:${role}:${f.path}`, name: f.path, blob: file, kind: mediaKind(f.path), role, addedAt: file.lastModified };
}
