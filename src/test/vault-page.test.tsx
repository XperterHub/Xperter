import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuthState: () => ({
    user: {
      uid: "test_vault_uid_01",
      lumenId: "nagaraj_test",
      name: "Eshwaran",
      email: "nagarajamutha0@gmail.com",
      photoURL: "",
    },
    loading: false,
  }),
}));

import { Route } from "@/routes/app.page-4";
import { buildDocumentPreviewSvgDataUrl } from "@/lib/vault-specimen";

const VaultPage = (Route as any).component as React.ComponentType;

describe("Vault Page (/app/page-4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      configurable: true,
      value: vi.fn(() => "blob:mock-vault-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders a single centered lock card initially and unlocks cleanly with inline setup", async () => {
    render(<VaultPage />);

    expect(screen.getByTestId("vault-page-root")).toBeInTheDocument();
    expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Protected");
    expect(screen.getByTestId("vault-lock-status-badge").closest(".box-lens-open")).not.toBeNull();
    // Only a single unlock/setup button exists
    expect(screen.getAllByTestId("unlock-vault-btn")).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText("New password (min 4 chars)"), {
      target: { value: "Vault#1234" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Vault#1234" },
    });
    fireEvent.click(screen.getByTestId("unlock-vault-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Unlocked");
    });

    // Separate View and Add tabs are visible
    expect(screen.getByRole("button", { name: /View \(0\)/i })).toBeInTheDocument();
    expect(screen.getByTestId("add-private-doc-btn")).toBeInTheDocument();
  });

  it("stays unlocked across window blur/visibility events and allows uploading & viewing a PDF without locking", async () => {
    const { unmount } = render(<VaultPage />);

    // First-time password setup
    fireEvent.change(screen.getByPlaceholderText("New password (min 4 chars)"), {
      target: { value: "Pass9876" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Pass9876" },
    });
    fireEvent.click(screen.getByTestId("unlock-vault-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Unlocked");
    });

    // Simulate OS file picker / tab blur — MUST NOT lock the vault
    fireEvent(window, new Event("blur"));
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Unlocked");

    // Switch to Add tab
    fireEvent.click(screen.getByTestId("add-private-doc-btn"));
    fireEvent.change(screen.getByPlaceholderText("XXXX-XXXX-XXXX"), {
      target: { value: "145523655236" },
    });

    // Attach a PDF file via hidden file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const pdfFile = new File(["%PDF-1.4 sample content"], "Signature.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    expect(screen.getByText("Signature.pdf")).toBeInTheDocument();

    // Save document
    fireEvent.click(screen.getByRole("button", { name: "Save Document" }));

    await waitFor(() => {
      expect(screen.getByTestId("view-doc-btn-aadharcard")).toBeInTheDocument();
    });
    expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Unlocked");

    // Open Custom Document Viewer
    fireEvent.click(screen.getByTestId("view-doc-btn-aadharcard"));
    const viewerModal = await screen.findByTestId("vault-document-viewer-modal");
    expect(viewerModal).toHaveClass("settings-popover");
    expect(within(viewerModal).getByText("145523655236")).toBeInTheDocument();
    expect(within(viewerModal).getByTitle("Aadhaar Card")).toBeInTheDocument();

    // Close viewer and test explicit lock
    fireEvent.click(within(viewerModal).getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("vault-document-viewer-modal")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("lock-vault-btn"));
    expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Protected");

    // Verify route unmount / remount starts locked with stored password
    unmount();
    render(<VaultPage />);
    expect(screen.getByTestId("vault-lock-status-badge")).toHaveTextContent("Protected");
    expect(screen.getByPlaceholderText("Vault password")).toBeInTheDocument();
  });

  it("generates theme-adaptive Xperter SVG specimen preview URLs", () => {
    const url = buildDocumentPreviewSvgDataUrl({
      label: "Aadhaar Card",
      docKey: "aadharcard",
      renamedFileName: "eshwaran_aadharcard.pdf",
      driveFolderName: "eshwaran_doc",
      holderName: "Eshwaran",
      documentNumber: "1455-2365-5236",
      theme: "dark",
    });
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("XPERTER VAULT");
    expect(decoded).toContain("eshwaran_aadharcard.pdf");
  });
});
