import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/config";
import { checkUsernameAvailability } from "@/lib/auth";
import {
  hasVaultPassword,
  hashVaultSecret,
  setVaultPassword,
  verifyVaultPassword,
} from "@/lib/google-drive-vault";
import {
  formatVaultDocumentFileName,
  formatVaultFolderName,
  generateUsernameSuggestions,
  RESERVED_USERNAMES,
  sanitizeUsernameId,
  validateUsernameFormat,
} from "@/lib/username-id";

describe("Page 2 Profile & Document Vault + Unique Username Logic", () => {
  it("renames Page 2 to Profile and marks it live in APP_PAGES", () => {
    const page2 = APP_PAGES.find((p) => p.to === "/app/page-2");
    expect(page2).toBeDefined();
    expect(page2?.label).toBe("Profile");
    expect(page2?.live).toBe(true);
  });

  it("formats Google Drive vault folder as <username>_doc and auto-renames documents", () => {
    expect(formatVaultFolderName("Nagaraj_98")).toBe("nagaraj_98_doc");
    expect(formatVaultFolderName("LMN-NAGARAJ")).toBe("nagaraj_doc");

    const voter = formatVaultDocumentFileName("nagaraj", "voterid", "scan_front.pdf");
    expect(voter.baseName).toBe("nagaraj_voterd");
    expect(voter.fullFileName).toBe("nagaraj_voterd.pdf");

    const aadhar = formatVaultDocumentFileName("nagaraj", "aadharcard", "uidai_card.png");
    expect(aadhar.baseName).toBe("nagaraj_aadharcard");
    expect(aadhar.fullFileName).toBe("nagaraj_aadharcard.png");

    const pan = formatVaultDocumentFileName("nagaraj", "pancard", "my_pan.jpg");
    expect(pan.baseName).toBe("nagaraj_pancard");
    expect(pan.fullFileName).toBe("nagaraj_pancard.jpg");

    const passbook = formatVaultDocumentFileName("nagaraj", "passbook", "sbi.pdf");
    expect(passbook.baseName).toBe("nagaraj_passbook");
    expect(passbook.fullFileName).toBe("nagaraj_passbook.pdf");

    const dl = formatVaultDocumentFileName("nagaraj", "drivinglicense", "dl.png");
    expect(dl.baseName).toBe("nagaraj_drivinglicense");

    const passport = formatVaultDocumentFileName("nagaraj", "passport", "pass.pdf");
    expect(passport.baseName).toBe("nagaraj_passport");

    const ration = formatVaultDocumentFileName("nagaraj", "rationcard", "rc.jpg");
    expect(ration.baseName).toBe("nagaraj_rationcard");
  });

  it("detects taken/reserved usernames and generates non-colliding randomizer variations", async () => {
    // "nagaraj" and "admin" are in RESERVED_USERNAMES to test collision detection
    const takenCheck = await checkUsernameAvailability("nagaraj");
    expect(takenCheck.available).toBe(false);
    expect(takenCheck.suggestions.length).toBeGreaterThanOrEqual(3);
    for (const sug of takenCheck.suggestions) {
      expect(RESERVED_USERNAMES.has(sug.toLowerCase())).toBe(false);
    }

    // A unique variation should be available
    const firstSuggestion = takenCheck.suggestions[0]!;
    const availableCheck = await checkUsernameAvailability(firstSuggestion);
    expect(availableCheck.available).toBe(true);
    expect(availableCheck.normalized).toBe(sanitizeUsernameId(firstSuggestion));
  });

  it("validates username format length and characters", () => {
    expect(validateUsernameFormat("ab").valid).toBe(false);
    expect(validateUsernameFormat("nagaraj_98").valid).toBe(true);
    expect( generateUsernameSuggestions("arjun", ["arjun_101"], 4).length ).toBe(4);
  });

  it("hashes and verifies separate vault password accurately", () => {
    const testUserKey = "usr_test_vault_99";
    expect(hasVaultPassword(testUserKey)).toBe(false);

    setVaultPassword(testUserKey, "MySecretVault#2026");
    expect(hasVaultPassword(testUserKey)).toBe(true);
    expect(verifyVaultPassword(testUserKey, "WrongPass")).toBe(false);
    expect(verifyVaultPassword(testUserKey, "MySecretVault#2026")).toBe(true);
    expect(hashVaultSecret("MySecretVault#2026")).toBe(hashVaultSecret("MySecretVault#2026"));
  });

  it("stores and updates user profile with about bio field", async () => {
    const { signIn, updateUserProfile, getUser } = await import("@/lib/auth");
    signIn("test_user@lumen.app", "Nagaraj Test", true, "nagaraj_test_id");
    await updateUserProfile({
      name: "Nagaraj Test",
      lumenId: "nagaraj_test_id",
      about: "Full stack developer crafting next-gen experiences.",
    });

    const user = getUser();
    expect(user).toBeDefined();
    expect(user?.about).toBe("Full stack developer crafting next-gen experiences.");
    expect(user?.lumenId).toBe("nagaraj_test_id");
  });

  it("enforces secondary password requirement before unlocking vault actions", () => {
    const userKey = "usr_sec_check_01";
    // Initially not set
    expect(hasVaultPassword(userKey)).toBe(false);
    expect(verifyVaultPassword(userKey, "Pass123")).toBe(false);

    // Set secondary password
    setVaultPassword(userKey, "Secure#VaultPass99");
    expect(hasVaultPassword(userKey)).toBe(true);

    // Rejects wrong passwords
    expect(verifyVaultPassword(userKey, "")).toBe(false);
    expect(verifyVaultPassword(userKey, "wrong")).toBe(false);
    expect(verifyVaultPassword(userKey, "Secure#VaultPass")).toBe(false);

    // Accepts exact secondary password
    expect(verifyVaultPassword(userKey, "Secure#VaultPass99")).toBe(true);
  });

  it("manages Cloud Uploading custom folder name and uploaded items storage", async () => {
    const {
      getCustomCloudFolderName,
      setCustomCloudFolderName,
      loadCloudFiles,
      saveCloudFiles,
    } = await import("@/lib/google-drive-vault");

    const uid = "usr_cloud_test_01";
    // Default fallback
    expect(getCustomCloudFolderName(uid, "default_doc")).toBe("default_doc");

    // Renaming folder persists
    setCustomCloudFolderName(uid, "my_custom_project_vault");
    expect(getCustomCloudFolderName(uid, "default_doc")).toBe("my_custom_project_vault");

    // Uploaded cloud items storage
    expect(loadCloudFiles(uid)).toEqual([]);
    saveCloudFiles(uid, [
      {
        id: "c_1",
        name: "architecture_diagram.png",
        sizeBytes: 1024,
        sizeFormatted: "1 KB",
        mimeType: "image/png",
        folderName: "my_custom_project_vault",
        uploadedAtIso: new Date().toISOString(),
        syncedToDrive: false,
      },
    ]);

    const loaded = loadCloudFiles(uid);
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.name).toBe("architecture_diagram.png");
    expect(loaded[0]?.folderName).toBe("my_custom_project_vault");
  });
});

