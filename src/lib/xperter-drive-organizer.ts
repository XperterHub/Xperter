/**
 * Xperter Google Drive Folder Management & Intelligent File Organization Engine
 *
 * Implements:
 * 1. Automatic "Xperter" root folder creation in user's Google Drive.
 * 2. 9 Category folders: Videos, Pictures, Documents, Music, Audio, Archives, Design_And_3D, Applications, Other_Files.
 * 3. 16 Document subfolders: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV, TXT, RTF, ODT, ODP, ODS, MD, EPUB, OTHER_DOCUMENTS.
 * 4. Intelligent file classification by MIME type and extension.
 * 5. Folder ID caching to prevent duplicate folders and repetitive searches.
 * 6. Direct automatic uploads to the correct destination folders preserving original filenames.
 */

export const XPERTER_ROOT_FOLDER_NAME = "Xperter";

export const XPERTER_CATEGORIES = [
  "Videos",
  "Pictures",
  "Documents",
  "Music",
  "Audio",
  "Archives",
  "Design_And_3D",
  "Applications",
  "Other_Files",
] as const;

export type XperterCategory = (typeof XPERTER_CATEGORIES)[number];

export const DOCUMENT_SUBFOLDERS = [
  "PDF",
  "DOC",
  "DOCX",
  "PPT",
  "PPTX",
  "XLS",
  "XLSX",
  "CSV",
  "TXT",
  "RTF",
  "ODT",
  "ODP",
  "ODS",
  "MD",
  "EPUB",
  "OTHER_DOCUMENTS",
] as const;

export type DocumentSubfolder = (typeof DOCUMENT_SUBFOLDERS)[number];

export interface FileClassificationResult {
  category: XperterCategory;
  documentSubfolder?: DocumentSubfolder;
  folderPath: string; // e.g. "Xperter/Documents/PDF" or "Xperter/Videos"
  folderName: string; // e.g. "PDF" or "Videos"
  extension: string;
  mimeType: string;
  originalName: string;
}

export interface XperterFolderCache {
  rootFolderId: string;
  rootFolderName: string;
  categoryFolders: Record<string, string>; // category -> folderId
  documentSubfolders: Record<string, string>; // subfolder -> folderId
  lastUpdatedIso: string;
}

const XPERTER_CACHE_PREFIX = "xperter.drive.tree.";
const inMemoryCacheMap = new Map<string, XperterFolderCache>();

// Extension dictionaries for high-precision classification
const EXTENSIONS_VIDEO = new Set([
  "mp4",
  "m4v",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "flv",
  "f4v",
  "webm",
  "3gp",
  "3g2",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "ogv",
  "divx",
  "rm",
  "rmvb",
  "asf",
]);

const EXTENSIONS_PICTURE = new Set([
  "png",
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "gif",
  "webp",
  "svg",
  "bmp",
  "dib",
  "tiff",
  "tif",
  "ico",
  "heic",
  "heif",
  "avif",
  "raw",
  "cr2",
  "nef",
  "arw",
  "dng",
  "orf",
  "rw2",
  "pef",
  "srw",
]);

const EXTENSIONS_MUSIC = new Set([
  "mp3",
  "flac",
  "aac",
  "alac",
  "ogg",
  "oga",
  "wma",
]);

const EXTENSIONS_AUDIO = new Set([
  "wav",
  "wave",
  "opus",
  "amr",
  "aiff",
  "aif",
  "pcm",
  "mid",
  "midi",
  "weba",
  "voc",
  "ra",
  "ram",
  "mka",
]);

const EXTENSIONS_ARCHIVE = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "gzip",
  "bz2",
  "bzip2",
  "xz",
  "iso",
  "img",
  "tgz",
  "tbz2",
  "z",
  "lz",
  "lzma",
  "cab",
  "ar",
  "cpio",
]);

const EXTENSIONS_DESIGN_3D = new Set([
  // 3D Formats
  "stl",
  "obj",
  "fbx",
  "blend",
  "dae",
  "step",
  "stp",
  "iges",
  "igs",
  "gltf",
  "glb",
  "3ds",
  "c4d",
  "max",
  "ma",
  "mb",
  "ply",
  "wrl",
  "x3d",
  "ifc",
  "skp",
  // CAD & Vector & Creative Design Formats
  "dwg",
  "dxf",
  "psd",
  "psb",
  "ai",
  "eps",
  "xd",
  "figma",
  "fig",
  "sketch",
  "indd",
  "idml",
  "cdr",
  "afdesign",
  "afphoto",
]);

const EXTENSIONS_APPLICATION = new Set([
  "exe",
  "msi",
  "apk",
  "apks",
  "xapk",
  "aab",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "appimage",
  "jar",
  "app",
  "ipa",
  "crx",
  "xpi",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "bin",
  "run",
]);

const DOCUMENT_EXT_MAP: Record<string, DocumentSubfolder> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  ppt: "PPT",
  pptx: "PPTX",
  xls: "XLS",
  xlsx: "XLSX",
  csv: "CSV",
  txt: "TXT",
  rtf: "RTF",
  odt: "ODT",
  odp: "ODP",
  ods: "ODS",
  md: "MD",
  markdown: "MD",
  epub: "EPUB",
};

const OTHER_DOC_EXTENSIONS = new Set([
  "pages",
  "key",
  "keynote",
  "numbers",
  "tex",
  "latex",
  "rst",
  "asciidoc",
  "log",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "mobi",
  "azw",
  "azw3",
  "djvu",
  "chm",
  "wpd",
  "wps",
  "dot",
  "dotx",
  "pot",
  "potx",
  "pps",
  "ppsx",
  "xlt",
  "xltx",
]);

/**
 * Intelligent file classification based on file name, extension, and MIME type.
 */
export function classifyFile(
  fileName: string,
  mimeType = "",
): FileClassificationResult {
  const cleanName = fileName.trim();
  const lastDot = cleanName.lastIndexOf(".");
  const ext =
    lastDot >= 0 ? cleanName.slice(lastDot + 1).toLowerCase().trim() : "";
  const mime = (mimeType || "").toLowerCase().trim();

  // 1. Videos
  if (EXTENSIONS_VIDEO.has(ext) || mime.startsWith("video/")) {
    return {
      category: "Videos",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Videos`,
      folderName: "Videos",
      extension: ext,
      mimeType: mime || `video/${ext}`,
      originalName: cleanName,
    };
  }

  // 2. Pictures (exclude Photoshop PSD or vector design if applicable)
  if (
    (EXTENSIONS_PICTURE.has(ext) || mime.startsWith("image/")) &&
    !EXTENSIONS_DESIGN_3D.has(ext)
  ) {
    return {
      category: "Pictures",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Pictures`,
      folderName: "Pictures",
      extension: ext,
      mimeType: mime || `image/${ext}`,
      originalName: cleanName,
    };
  }

  // 3. Music (pure music tracks)
  if (EXTENSIONS_MUSIC.has(ext)) {
    return {
      category: "Music",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Music`,
      folderName: "Music",
      extension: ext,
      mimeType: mime || `audio/${ext}`,
      originalName: cleanName,
    };
  }

  // 4. Audio (voice recordings, wav, amr, sound effects)
  if (EXTENSIONS_AUDIO.has(ext) || mime.startsWith("audio/")) {
    return {
      category: "Audio",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Audio`,
      folderName: "Audio",
      extension: ext,
      mimeType: mime || `audio/${ext}`,
      originalName: cleanName,
    };
  }

  // 5. Design & 3D
  if (
    EXTENSIONS_DESIGN_3D.has(ext) ||
    mime.startsWith("model/") ||
    mime === "image/vnd.adobe.photoshop"
  ) {
    return {
      category: "Design_And_3D",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Design_And_3D`,
      folderName: "Design_And_3D",
      extension: ext,
      mimeType: mime || "application/octet-stream",
      originalName: cleanName,
    };
  }

  // 6. Archives
  if (
    EXTENSIONS_ARCHIVE.has(ext) ||
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("compressed") ||
    mime.includes("archive")
  ) {
    return {
      category: "Archives",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Archives`,
      folderName: "Archives",
      extension: ext,
      mimeType: mime || "application/zip",
      originalName: cleanName,
    };
  }

  // 7. Applications
  if (
    EXTENSIONS_APPLICATION.has(ext) ||
    mime === "application/x-msdownload" ||
    mime === "application/vnd.android.package-archive" ||
    mime === "application/x-apple-diskimage" ||
    mime === "application/java-archive"
  ) {
    return {
      category: "Applications",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Applications`,
      folderName: "Applications",
      extension: ext,
      mimeType: mime || "application/octet-stream",
      originalName: cleanName,
    };
  }

  // 8. Documents (with dedicated subfolder per extension)
  if (DOCUMENT_EXT_MAP[ext]) {
    const subfolder = DOCUMENT_EXT_MAP[ext]!;
    return {
      category: "Documents",
      documentSubfolder: subfolder,
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Documents/${subfolder}`,
      folderName: subfolder,
      extension: ext,
      mimeType: mime || `application/${ext}`,
      originalName: cleanName,
    };
  }

  if (
    OTHER_DOC_EXTENSIONS.has(ext) ||
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("powerpoint") ||
    mime.includes("officedocument") ||
    mime.includes("opendocument") ||
    mime.includes("pdf")
  ) {
    return {
      category: "Documents",
      documentSubfolder: "OTHER_DOCUMENTS",
      folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Documents/OTHER_DOCUMENTS`,
      folderName: "OTHER_DOCUMENTS",
      extension: ext,
      mimeType: mime || "application/octet-stream",
      originalName: cleanName,
    };
  }

  // 9. Other_Files
  return {
    category: "Other_Files",
    folderPath: `${XPERTER_ROOT_FOLDER_NAME}/Other_Files`,
    folderName: "Other_Files",
    extension: ext,
    mimeType: mime || "application/octet-stream",
    originalName: cleanName,
  };
}

/**
 * Cache management for Google Drive folder IDs.
 */
export function getXperterFolderCache(
  userKey: string,
): XperterFolderCache | null {
  const normalizedKey = (userKey || "default").toLowerCase().trim();
  const mem = inMemoryCacheMap.get(normalizedKey);
  if (mem) return mem;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(
        `${XPERTER_CACHE_PREFIX}${normalizedKey}`,
      );
      if (raw) {
        const parsed = JSON.parse(raw) as XperterFolderCache;
        if (parsed?.rootFolderId && parsed?.categoryFolders) {
          inMemoryCacheMap.set(normalizedKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore parse/storage errors
    }
  }
  return null;
}

export function saveXperterFolderCache(
  userKey: string,
  cache: XperterFolderCache,
): void {
  const normalizedKey = (userKey || "default").toLowerCase().trim();
  inMemoryCacheMap.set(normalizedKey, cache);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        `${XPERTER_CACHE_PREFIX}${normalizedKey}`,
        JSON.stringify(cache),
      );
    } catch {
      // Ignore quota errors
    }
  }
}

export function clearXperterFolderCache(userKey?: string): void {
  if (userKey) {
    const normalizedKey = userKey.toLowerCase().trim();
    inMemoryCacheMap.delete(normalizedKey);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(
          `${XPERTER_CACHE_PREFIX}${normalizedKey}`,
        );
      } catch {}
    }
  } else {
    inMemoryCacheMap.clear();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key?.startsWith(XPERTER_CACHE_PREFIX)) {
            toRemove.push(key);
          }
        }
        for (const k of toRemove) window.localStorage.removeItem(k);
      } catch {}
    }
  }
}

/**
 * Finds or creates a single Google Drive folder.
 */
export async function findOrCreateDriveFolder(params: {
  name: string;
  parentId?: string;
  accessToken: string;
}): Promise<{ id: string; name: string }> {
  const { name, parentId, accessToken } = params;
  if (!accessToken) {
    throw new Error("Missing Google Drive access token.");
  }

  const escapedName = name.replace(/'/g, "\\'");
  const parentClause = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and ${parentClause} and trashed = false`,
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (searchRes.status === 401 || searchRes.status === 403) {
    throw new Error(
      "Google Drive authorization expired. Please reconnect your account.",
    );
  }

  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as {
      files?: Array<{ id: string; name: string }>;
    };
    if (searchData.files && searchData.files.length > 0 && searchData.files[0]) {
      return {
        id: searchData.files[0].id,
        name: searchData.files[0].name,
      };
    }
  }

  // Create folder
  const createPayload: Record<string, any> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    createPayload.parents = [parentId];
  }

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    },
  );

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => "");
    throw new Error(
      `Could not create Google Drive folder "${name}": ${err || createRes.statusText}`,
    );
  }

  const created = (await createRes.json()) as { id: string; name: string };
  return {
    id: created.id,
    name: created.name || name,
  };
}

/**
 * Lists all existing immediate subfolders under a parent folder in 1 query.
 */
export async function listExistingChildFolders(params: {
  parentId: string;
  accessToken: string;
}): Promise<Map<string, string>> {
  const { parentId, accessToken } = params;
  const folderMap = new Map<string, string>();
  if (!accessToken || !parentId) return folderMap;

  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
  );

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100&spaces=drive`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (res.ok) {
      const data = (await res.json()) as {
        files?: Array<{ id: string; name: string }>;
      };
      if (data.files) {
        for (const file of data.files) {
          if (file.name && file.id) {
            folderMap.set(file.name, file.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Failed to list child folders for parent:", parentId, err);
  }

  return folderMap;
}

/**
 * Initializes and verifies the full Xperter Google Drive folder hierarchy:
 *
 * Xperter/
 *   Videos/
 *   Pictures/
 *   Documents/
 *     PDF/
 *     DOC/
 *     DOCX/
 *     PPT/
 *     PPTX/
 *     XLS/
 *     XLSX/
 *     CSV/
 *     TXT/
 *     RTF/
 *     ODT/
 *     ODP/
 *     ODS/
 *     MD/
 *     EPUB/
 *     OTHER_DOCUMENTS/
 *   Music/
 *   Audio/
 *   Archives/
 *   Design_And_3D/
 *   Applications/
 *   Other_Files/
 *
 * Reuses existing folders, creates only missing ones, and caches all IDs.
 */
export async function initializeXperterDriveHierarchy(params: {
  userKey: string;
  accessToken: string;
  forceRefresh?: boolean;
}): Promise<XperterFolderCache> {
  const { userKey, accessToken, forceRefresh = false } = params;
  if (!accessToken) {
    throw new Error("Google Drive access token required to initialize Xperter.");
  }

  if (!forceRefresh) {
    const existingCache = getXperterFolderCache(userKey);
    if (
      existingCache &&
      existingCache.rootFolderId &&
      Object.keys(existingCache.categoryFolders).length >=
        XPERTER_CATEGORIES.length &&
      Object.keys(existingCache.documentSubfolders).length >=
        DOCUMENT_SUBFOLDERS.length
    ) {
      return existingCache;
    }
  }

  // 1. Root: "Xperter"
  const root = await findOrCreateDriveFolder({
    name: XPERTER_ROOT_FOLDER_NAME,
    accessToken,
  });

  // 2. Fetch existing category folders under "Xperter" in one batch
  const existingCategories = await listExistingChildFolders({
    parentId: root.id,
    accessToken,
  });

  const categoryFolders: Record<string, string> = {};

  for (const cat of XPERTER_CATEGORIES) {
    if (existingCategories.has(cat)) {
      categoryFolders[cat] = existingCategories.get(cat)!;
    } else {
      const created = await findOrCreateDriveFolder({
        name: cat,
        parentId: root.id,
        accessToken,
      });
      categoryFolders[cat] = created.id;
    }
  }

  // 3. Under "Documents", fetch existing subfolders in one batch
  const docRootId = categoryFolders["Documents"];
  const documentSubfolders: Record<string, string> = {};

  if (docRootId) {
    const existingDocSubs = await listExistingChildFolders({
      parentId: docRootId,
      accessToken,
    });

    for (const sub of DOCUMENT_SUBFOLDERS) {
      if (existingDocSubs.has(sub)) {
        documentSubfolders[sub] = existingDocSubs.get(sub)!;
      } else {
        const created = await findOrCreateDriveFolder({
          name: sub,
          parentId: docRootId,
          accessToken,
        });
        documentSubfolders[sub] = created.id;
      }
    }
  }

  const cache: XperterFolderCache = {
    rootFolderId: root.id,
    rootFolderName: XPERTER_ROOT_FOLDER_NAME,
    categoryFolders,
    documentSubfolders,
    lastUpdatedIso: new Date().toISOString(),
  };

  saveXperterFolderCache(userKey, cache);
  return cache;
}

/**
 * Resolves the target Google Drive folder ID for a classified file.
 * Automatically initializes or creates any missing folder on demand.
 */
export async function resolveDestinationFolder(params: {
  classification: FileClassificationResult;
  userKey: string;
  accessToken: string;
}): Promise<{ folderId: string; folderPath: string }> {
  const { classification, userKey, accessToken } = params;
  let cache = getXperterFolderCache(userKey);

  if (
    !cache ||
    !cache.rootFolderId ||
    !cache.categoryFolders[classification.category]
  ) {
    cache = await initializeXperterDriveHierarchy({ userKey, accessToken });
  }

  // If document with subfolder
  if (
    classification.category === "Documents" &&
    classification.documentSubfolder
  ) {
    const sub = classification.documentSubfolder;
    let targetSubId = cache.documentSubfolders[sub];

    if (!targetSubId) {
      // Create subfolder on demand under Documents
      const docFolderId =
        cache.categoryFolders["Documents"] ||
        (
          await findOrCreateDriveFolder({
            name: "Documents",
            parentId: cache.rootFolderId,
            accessToken,
          })
        ).id;

      const created = await findOrCreateDriveFolder({
        name: sub,
        parentId: docFolderId,
        accessToken,
      });

      targetSubId = created.id;
      cache.documentSubfolders[sub] = targetSubId;
      saveXperterFolderCache(userKey, cache);
    }

    return {
      folderId: targetSubId,
      folderPath: classification.folderPath,
    };
  }

  // Category root folder
  let targetCatId = cache.categoryFolders[classification.category];
  if (!targetCatId) {
    const created = await findOrCreateDriveFolder({
      name: classification.category,
      parentId: cache.rootFolderId,
      accessToken,
    });
    targetCatId = created.id;
    cache.categoryFolders[classification.category] = targetCatId;
    saveXperterFolderCache(userKey, cache);
  }

  return {
    folderId: targetCatId,
    folderPath: classification.folderPath,
  };
}

/**
 * Automatically classifies and uploads a file directly to the correct Google Drive folder.
 * Preserves original filename, type, and folder structure.
 */
export async function uploadClassifiedFileToXperter(params: {
  file: File;
  userKey: string;
  accessToken: string;
}): Promise<{
  driveFileId: string;
  fileName: string;
  folderPath: string;
  folderId: string;
  classification: FileClassificationResult;
  webViewLink?: string;
}> {
  const { file, userKey, accessToken } = params;
  if (!accessToken) {
    throw new Error(
      "Connect your Google Drive account before uploading files.",
    );
  }

  // 1. Classify file intelligently
  const classification = classifyFile(file.name, file.type);

  // 2. Resolve destination folder ID in Google Drive
  const { folderId, folderPath } = await resolveDestinationFolder({
    classification,
    userKey,
    accessToken,
  });

  // 3. Perform multipart upload to target folder
  const metadata = {
    name: file.name,
    parents: [folderId],
    description: `Organized via Xperter Cloud Uploading -> ${folderPath}`,
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  formData.append("file", file, file.name);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (uploadRes.status === 401 || uploadRes.status === 403) {
    throw new Error(
      "Google Drive authorization expired. Please reconnect your account.",
    );
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(
      `Upload to Google Drive failed (${uploadRes.status}): ${errText}`,
    );
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    driveFileId: uploaded.id,
    fileName: uploaded.name || file.name,
    folderPath,
    folderId,
    classification,
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
  };
}
