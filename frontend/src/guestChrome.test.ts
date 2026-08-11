import { describe, expect, it } from "vitest";
import { CLICK_ME_COPY, landingHeadline, SIGN_IN_COPY, SIGN_IN_NOTICE, SUB_CARD_COPY } from "./guestChrome";

describe("owner-approved guest chrome copy", () => {
  it("keeps every final static string byte-identical", () => {
    expect(CLICK_ME_COPY).toBe("Do not click me. Use the keyboard — the one you have covered in crumbs and fingerprints. Your keyboard hates you. Tap it anyway: ← or → and ⏎.");
    expect(SIGN_IN_NOTICE).toBe("Account registration is currently unavailable. Coming soon.");
    expect(SIGN_IN_COPY).toBe("Do not sign in. Instead, be amazed by an obscure long word beginning with the first letter you type. You get ninety-nine seconds to reflect on why you are a hooman, while the AI reads you the correct pronunciation and some highly optimistic predictions about what your friends would think if you dropped that word into conversation as though it had always been part of your vocabulary.");
    expect(SUB_CARD_COPY).toBe("The timer has started. You shouldn't still be clicking. Are you clicking? Stop clicking.");
  });

  it("substitutes the three counter values without rendering spec brackets", () => {
    const rendered = landingHeadline({ guest_number: 13, total_guests: 13, completions_to_date: 0 });
    expect(rendered).toBe("Salutations, SirGuest#13! 0 of 13 visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#14. Mwahaha! Kittens and cookies! Mwahaha, yessss.");
    expect(rendered).not.toContain("[");
    expect(rendered).not.toContain("]");
  });

  it("renders zero for every unavailable landing value", () => {
    const rendered = landingHeadline({ guest_number: 0, total_guests: 0, completions_to_date: 0 });
    expect(rendered).toContain("SirGuest#0! 0 of 0 visitors");
    expect(rendered).toContain("new name, SirGuest#0.");
    expect(rendered).not.toContain("[");
    expect(rendered).not.toContain("]");
  });
});
