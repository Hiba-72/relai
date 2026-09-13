import { describe, expect, it } from "vitest";
import { apiError } from "./errors";

describe("apiError", () => {
  it("returns FastAPI's string detail", () => {
    const err = { response: { data: { detail: "Ce ticket est déjà assigné" } } };
    expect(apiError(err)).toBe("Ce ticket est déjà assigné");
  });

  it("reads a 422 validation body, which is a list and not a string", () => {
    // The reason this helper exists: passing `detail` straight to the toast
    // rendered "[object Object]" whenever FastAPI answered with a validation
    // error, which is exactly when the user most needs to be told why.
    const err = {
      response: {
        data: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            { loc: ["body", "password"], msg: "String should have at least 8 characters" },
          ],
        },
      },
    };
    expect(apiError(err)).toBe(
      "value is not a valid email address · String should have at least 8 characters",
    );
  });

  it("falls back when the server sends no detail", () => {
    expect(apiError({ response: { data: {} } }, "Erreur.")).toBe("Erreur.");
  });

  it("falls back when detail is an empty string", () => {
    expect(apiError({ response: { data: { detail: "   " } } }, "Erreur.")).toBe("Erreur.");
  });

  it("falls back on a network error, which has no response at all", () => {
    expect(apiError(new Error("Network Error"), "Hors ligne.")).toBe("Hors ligne.");
  });

  it("falls back on null and undefined rather than throwing", () => {
    expect(apiError(null, "Erreur.")).toBe("Erreur.");
    expect(apiError(undefined, "Erreur.")).toBe("Erreur.");
  });

  it("uses a default message when none is given", () => {
    expect(apiError(null)).toBe("Erreur.");
  });
});
