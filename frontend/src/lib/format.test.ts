import { describe, expect, it } from "vitest";
import {
  PRIORITE_LABEL,
  ROLE_LABEL,
  STATUT_LABEL,
  formatTicketRef,
  prioriteRail,
  statutDot,
} from "./format";
import type { Role, TicketPriorite, TicketStatut } from "@/types";

const STATUTS: TicketStatut[] = ["nouveau", "en_cours", "resolu", "cloture", "annule"];
const PRIORITES: TicketPriorite[] = ["urgent", "normal", "faible"];
const ROLES: Role[] = ["admin", "informaticien", "demandeur"];

describe("formatTicketRef", () => {
  it("pads to four digits so numbers stay column-aligned", () => {
    expect(formatTicketRef(1)).toBe("#0001");
    expect(formatTicketRef(42)).toBe("#0042");
    expect(formatTicketRef(1234)).toBe("#1234");
  });

  it("does not truncate once past four digits", () => {
    expect(formatTicketRef(12345)).toBe("#12345");
  });
});

describe("colour helpers", () => {
  it("resolves priority rails from theme tokens, not literal colours", () => {
    // These were hardcoded HSL once, and survived a palette change untouched —
    // brown rails on a blue interface. Reading the tokens is what prevents it.
    for (const p of PRIORITES) {
      expect(prioriteRail(p)).toContain("var(--");
    }
  });

  it("gives urgent and faible visibly different rails", () => {
    expect(prioriteRail("urgent")).not.toBe(prioriteRail("faible"));
    expect(prioriteRail("urgent")).not.toBe(prioriteRail("normal"));
  });

  it("resolves a status dot for every status", () => {
    for (const s of STATUTS) {
      expect(statutDot(s)).toContain("var(--");
    }
  });

  it("keeps the open statuses distinguishable from the closed ones", () => {
    expect(statutDot("nouveau")).not.toBe(statutDot("cloture"));
    expect(statutDot("en_cours")).not.toBe(statutDot("annule"));
  });
});

describe("label maps", () => {
  it("covers every status", () => {
    for (const s of STATUTS) {
      expect(STATUT_LABEL[s]).toBeTruthy();
    }
  });

  it("covers every priority", () => {
    for (const p of PRIORITES) {
      expect(PRIORITE_LABEL[p]).toBeTruthy();
    }
  });

  it("covers every role", () => {
    for (const r of ROLES) {
      expect(ROLE_LABEL[r]).toBeTruthy();
    }
  });
});
