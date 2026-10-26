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

  it("enforces username ID rename rate limit: 3 renames per 2-week period", async () => {
    const {
      checkUsernameRenameEligibility,
      recordUsernameRename,
      USERNAME_RENAME_LIMIT,
      USERNAME_RENAME_WINDOW_MS,
    } = await import("@/lib/username-id");

    const uid = "usr_rename_test_user";
    const now = 1700000000000; // Reference timestamp

    // 1. Initial state: full quota
    const initial = checkUsernameRenameEligibility(uid, now);
    expect(initial.canRename).toBe(true);
    expect(initial.renamesRemaining).toBe(USERNAME_RENAME_LIMIT); // 3
    expect(initial.renamesUsed).toBe(0);

    // 2. Perform 1st rename
    recordUsernameRename(uid, now);
    const after1 = checkUsernameRenameEligibility(uid, now);
    expect(after1.canRename).toBe(true);
    expect(after1.renamesRemaining).toBe(2);
    expect(after1.renamesUsed).toBe(1);

    // 3. Perform 2nd rename
    recordUsernameRename(uid, now + 1000);
    const after2 = checkUsernameRenameEligibility(uid, now + 1000);
    expect(after2.canRename).toBe(true);
    expect(after2.renamesRemaining).toBe(1);
    expect(after2.renamesUsed).toBe(2);

    // 4. Perform 3rd rename
    recordUsernameRename(uid, now + 2000);
    const after3 = checkUsernameRenameEligibility(uid, now + 2000);
    expect(after3.canRename).toBe(false);
    expect(after3.renamesRemaining).toBe(0);
    expect(after3.renamesUsed).toBe(3);
    expect(after3.daysUntilNextReset).toBeGreaterThanOrEqual(13);

    // 5. Check within the 2-week window (e.g. 7 days later): still blocked
    const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000;
    const midWindow = checkUsernameRenameEligibility(uid, sevenDaysLater);
    expect(midWindow.canRename).toBe(false);
    expect(midWindow.renamesRemaining).toBe(0);

    // 6. Check after the 2-week period (14 days + 1 minute later): 1st rename expired, can rename again!
    const afterWindow = now + USERNAME_RENAME_WINDOW_MS + 60 * 1000;
    const expiredStatus = checkUsernameRenameEligibility(uid, afterWindow);
    expect(expiredStatus.canRename).toBe(true);
    expect(expiredStatus.renamesRemaining).toBeGreaterThan(0);
  });

  it("Google Account Dictionary persists and reuses usernameId across logout and repeated logins", async () => {
    const {
      lookupAccountInDictionary,
      saveAccountToDictionary,
      listAllDictionaryAccounts,
      toAppUser,
      signOut,
    } = await import("@/lib/auth");

    const email = "nagarajamutha0@gmail.com";
    const uid = "firebase_test_uid_eshwaran";

    // 1. Initial login for a new Google Account profile generates and stores a randomized username ID
    const initialUser = toAppUser({
      uid,
      email,
      displayName: "Eshwaran N",
      photoURL: "https://example.com/avatar.png",
    } as any);

    expect(initialUser.lumenId).toBeDefined();
    expect(initialUser.lumenId.length).toBeGreaterThan(0);
    const assignedUsernameId = initialUser.lumenId;

    // Verify it is saved in the Account Dictionary
    const entry = lookupAccountInDictionary(email, uid);
    expect(entry).not.toBeNull();
    expect(entry?.usernameId).toBe(assignedUsernameId);
    expect(entry?.displayName).toBe("Eshwaran N");

    // 2. User logs out
    await signOut();

    // 3. User logs back in with the same Google account
    const secondLoginUser = toAppUser({
      uid,
      email,
      displayName: "Eshwaran N",
      photoURL: "https://example.com/avatar.png",
    } as any);

    // CRITICAL: Username ID must be reused, NOT newly created or regenerated
    expect(secondLoginUser.lumenId).toBe(assignedUsernameId);

    // 4. Multiple logouts and logins still return the exact same usernameId
    await signOut();
    const thirdLoginUser = toAppUser({
      uid,
      email,
      displayName: "Eshwaran N",
      photoURL: "https://example.com/avatar.png",
    } as any);
    expect(thirdLoginUser.lumenId).toBe(assignedUsernameId);

    // 5. Account Dictionary lists all registered user accounts for discovery and search
    const allAccounts = listAllDictionaryAccounts();
    const found = allAccounts.find((acc) => acc.email === email);
    expect(found).toBeDefined();
    expect(found?.usernameId).toBe(assignedUsernameId);
  });
});


