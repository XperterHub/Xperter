import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  classifyFile,
  clearXperterFolderCache,
  DOCUMENT_SUBFOLDERS,
  getXperterFolderCache,
  initializeXperterDriveHierarchy,
  resolveDestinationFolder,
  saveXperterFolderCache,
  XPERTER_CATEGORIES,
  XPERTER_ROOT_FOLDER_NAME,
  type XperterFolderCache,
} from "@/lib/xperter-drive-organizer";

describe("Xperter Google Drive Folder Management & Intelligent File Organization", () => {
  beforeEach(() => {
    clearXperterFolderCache();
    vi.restoreAllMocks();
  });

  it("defines the exact required categories and document subfolders", () => {
    expect(XPERTER_ROOT_FOLDER_NAME).toBe("Xperter");

    expect(XPERTER_CATEGORIES).toEqual([
      "Videos",
      "Pictures",
      "Documents",
      "Music",
      "Audio",
      "Archives",
      "Design_And_3D",
      "Applications",
      "Other_Files",
    ]);

    expect(DOCUMENT_SUBFOLDERS).toEqual([
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
    ]);
  });

  it("correctly classifies all primary example files into their target destinations", () => {
    // 1. Video.mp4 -> Xperter/Videos/
    const video = classifyFile("Video.mp4");
    expect(video.category).toBe("Videos");
    expect(video.folderPath).toBe("Xperter/Videos");

    // 2. Photo.png -> Xperter/Pictures/
    const photo = classifyFile("Photo.png");
    expect(photo.category).toBe("Pictures");
    expect(photo.folderPath).toBe("Xperter/Pictures");

    // 3. Report.pdf -> Xperter/Documents/PDF/
    const pdf = classifyFile("Report.pdf");
    expect(pdf.category).toBe("Documents");
    expect(pdf.documentSubfolder).toBe("PDF");
    expect(pdf.folderPath).toBe("Xperter/Documents/PDF");

    // 4. Project.docx -> Xperter/Documents/DOCX/
    const docx = classifyFile("Project.docx");
    expect(docx.category).toBe("Documents");
    expect(docx.documentSubfolder).toBe("DOCX");
    expect(docx.folderPath).toBe("Xperter/Documents/DOCX");

    // 5. Presentation.pptx -> Xperter/Documents/PPTX/
    const pptx = classifyFile("Presentation.pptx");
    expect(pptx.category).toBe("Documents");
    expect(pptx.documentSubfolder).toBe("PPTX");
    expect(pptx.folderPath).toBe("Xperter/Documents/PPTX");

    // 6. Music.mp3 -> Xperter/Music/
    const music = classifyFile("Music.mp3");
    expect(music.category).toBe("Music");
    expect(music.folderPath).toBe("Xperter/Music");

    // 7. Recording.wav -> Xperter/Audio/
    const audio = classifyFile("Recording.wav");
    expect(audio.category).toBe("Audio");
    expect(audio.folderPath).toBe("Xperter/Audio");

    // 8. Model.stl -> Xperter/Design_And_3D/
    const stl = classifyFile("Model.stl");
    expect(stl.category).toBe("Design_And_3D");
    expect(stl.folderPath).toBe("Xperter/Design_And_3D");

    // 9. Backup.zip -> Xperter/Archives/
    const zip = classifyFile("Backup.zip");
    expect(zip.category).toBe("Archives");
    expect(zip.folderPath).toBe("Xperter/Archives");
  });

  it("correctly classifies all document subfolder extensions", () => {
    expect(classifyFile("contract.pdf").folderPath).toBe("Xperter/Documents/PDF");
    expect(classifyFile("letter.doc").folderPath).toBe("Xperter/Documents/DOC");
    expect(classifyFile("paper.docx").folderPath).toBe("Xperter/Documents/DOCX");
    expect(classifyFile("slides.ppt").folderPath).toBe("Xperter/Documents/PPT");
    expect(classifyFile("deck.pptx").folderPath).toBe("Xperter/Documents/PPTX");
    expect(classifyFile("budget.xls").folderPath).toBe("Xperter/Documents/XLS");
    expect(classifyFile("calc.xlsx").folderPath).toBe("Xperter/Documents/XLSX");
    expect(classifyFile("users.csv").folderPath).toBe("Xperter/Documents/CSV");
    expect(classifyFile("notes.txt").folderPath).toBe("Xperter/Documents/TXT");
    expect(classifyFile("formatted.rtf").folderPath).toBe("Xperter/Documents/RTF");
    expect(classifyFile("text.odt").folderPath).toBe("Xperter/Documents/ODT");
    expect(classifyFile("pres.odp").folderPath).toBe("Xperter/Documents/ODP");
    expect(classifyFile("sheet.ods").folderPath).toBe("Xperter/Documents/ODS");
    expect(classifyFile("readme.md").folderPath).toBe("Xperter/Documents/MD");
    expect(classifyFile("novel.epub").folderPath).toBe("Xperter/Documents/EPUB");

    // Other doc extensions go to OTHER_DOCUMENTS
    expect(classifyFile("apple.pages").folderPath).toBe("Xperter/Documents/OTHER_DOCUMENTS");
    expect(classifyFile("system.log").folderPath).toBe("Xperter/Documents/OTHER_DOCUMENTS");
    expect(classifyFile("data.tsv").folderPath).toBe("Xperter/Documents/OTHER_DOCUMENTS");
    expect(classifyFile("config.json").folderPath).toBe("Xperter/Documents/OTHER_DOCUMENTS");
  });

  it("correctly classifies 3D, Design, Applications, and unknown files", () => {
    expect(classifyFile("character.blend").folderPath).toBe("Xperter/Design_And_3D");
    expect(classifyFile("artwork.psd").folderPath).toBe("Xperter/Design_And_3D");
    expect(classifyFile("vector.ai").folderPath).toBe("Xperter/Design_And_3D");
    expect(classifyFile("cad.dwg").folderPath).toBe("Xperter/Design_And_3D");
    expect(classifyFile("scene.gltf").folderPath).toBe("Xperter/Design_And_3D");

    expect(classifyFile("setup.exe").folderPath).toBe("Xperter/Applications");
    expect(classifyFile("game.apk").folderPath).toBe("Xperter/Applications");
    expect(classifyFile("install.dmg").folderPath).toBe("Xperter/Applications");
    expect(classifyFile("tool.jar").folderPath).toBe("Xperter/Applications");

    expect(classifyFile("unknown_binary.xyz").folderPath).toBe("Xperter/Other_Files");
  });

  it("stores, retrieves, and clears folder cache in memory and localStorage", () => {
    const testUser = "usr_xperter_test";
    expect(getXperterFolderCache(testUser)).toBeNull();

    const sampleCache: XperterFolderCache = {
      rootFolderId: "root_123",
      rootFolderName: "Xperter",
      categoryFolders: {
        Videos: "vid_1",
        Pictures: "pic_1",
        Documents: "doc_1",
        Music: "mus_1",
        Audio: "aud_1",
        Archives: "arc_1",
        Design_And_3D: "des_1",
        Applications: "app_1",
        Other_Files: "oth_1",
      },
      documentSubfolders: {
        PDF: "pdf_1",
        DOCX: "docx_1",
      },
      lastUpdatedIso: new Date().toISOString(),
    };

    saveXperterFolderCache(testUser, sampleCache);
    const retrieved = getXperterFolderCache(testUser);
    expect(retrieved).toBeDefined();
    expect(retrieved?.rootFolderId).toBe("root_123");
    expect(retrieved?.categoryFolders["Videos"]).toBe("vid_1");
    expect(retrieved?.documentSubfolders["PDF"]).toBe("pdf_1");

    clearXperterFolderCache(testUser);
    expect(getXperterFolderCache(testUser)).toBeNull();
  });

  it("initializes hierarchy reusing existing folders or creating missing folders", async () => {
    const createdFolders: Array<{ name: string; parentId?: string }> = [];

    // Mock fetch for Google Drive API
    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const urlStr = String(url);

      // Search queries
      if (urlStr.includes("/drive/v3/files?q=")) {
        // Return empty files array to trigger folder creations
        return {
          ok: true,
          status: 200,
          json: async () => ({ files: [] }),
        };
      }

      // POST create folder
      if (options?.method === "POST" && urlStr.includes("/drive/v3/files")) {
        const body = JSON.parse(String(options.body));
        createdFolders.push({ name: body.name, parentId: body.parents?.[0] });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `id_${body.name}`, name: body.name }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
      };
    });

    vi.stubGlobal("fetch", mockFetch);

    const cache = await initializeXperterDriveHierarchy({
      userKey: "user_api_test",
      accessToken: "mock_token_abc",
      forceRefresh: true,
    });

    expect(cache.rootFolderId).toBe("id_Xperter");
    expect(cache.categoryFolders["Videos"]).toBe("id_Videos");
    expect(cache.categoryFolders["Documents"]).toBe("id_Documents");
    expect(cache.documentSubfolders["PDF"]).toBe("id_PDF");

    // Verify root folder was created first
    expect(createdFolders.some((f) => f.name === "Xperter")).toBe(true);

    // Verify all 9 category folders were created
    for (const cat of XPERTER_CATEGORIES) {
      expect(createdFolders.some((f) => f.name === cat)).toBe(true);
    }

    // Verify all 16 document subfolders were created
    for (const sub of DOCUMENT_SUBFOLDERS) {
      expect(createdFolders.some((f) => f.name === sub)).toBe(true);
    }
  });

  it("resolves destination folder using cached IDs without duplicate API calls", async () => {
    const userKey = "user_dest_test";
    const sampleCache: XperterFolderCache = {
      rootFolderId: "root_999",
      rootFolderName: "Xperter",
      categoryFolders: {
        Videos: "cat_vid_999",
        Documents: "cat_doc_999",
      },
      documentSubfolders: {
        PDF: "sub_pdf_999",
      },
      lastUpdatedIso: new Date().toISOString(),
    };
    saveXperterFolderCache(userKey, sampleCache);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // Resolve PDF document
    const pdfClass = classifyFile("my_thesis.pdf");
    const pdfDest = await resolveDestinationFolder({
      classification: pdfClass,
      userKey,
      accessToken: "mock_token",
    });

    expect(pdfDest.folderId).toBe("sub_pdf_999");
    expect(pdfDest.folderPath).toBe("Xperter/Documents/PDF");
    // No fetch needed because it was in cache!
    expect(fetchSpy).not.toHaveBeenCalled();

    // Resolve Video
    const vidClass = classifyFile("trip.mp4");
    const vidDest = await resolveDestinationFolder({
      classification: vidClass,
      userKey,
      accessToken: "mock_token",
    });

    expect(vidDest.folderId).toBe("cat_vid_999");
    expect(vidDest.folderPath).toBe("Xperter/Videos");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
