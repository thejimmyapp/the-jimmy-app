import { describe, expect, it } from "vitest";
import { CLICK_ME_COPY, landingHeadline, landingSubcopy, SIGN_IN_COPY, SIGN_IN_NOTICE, SUB_CARD_COPY } from "./guestChrome";

describe("owner-approved guest chrome copy", () => {
  it("keeps every final static string byte-identical", () => {
    expect(CLICK_ME_COPY).toBe("Do not click me. Use the keyboard — the one you have covered in crumbs and fingerprints. Your keyboard hates you. Tap it anyway: ← or → and ⏎.");
    expect(SIGN_IN_NOTICE).toBe("Account registration is currently unavailable. Coming soon.");
    expect(SIGN_IN_COPY).toBe("Do not sign in. Instead, be amazed by an obscure long word beginning with the first letter you type. You get ninety-nine seconds to reflect on why you are a hooman, while the AI reads you the correct pronunciation and some highly optimistic predictions about what your friends would think if you dropped that word into conversation as though it had always been part of your vocabulary.");
    expect(SUB_CARD_COPY).toBe("The timer has started. You shouldn't still be clicking. Are you clicking? Stop clicking.");
  });

  it("renders the unknown completion numerator honestly without rendering spec brackets", () => {
    const identity = { guest_number: 13, total_guests: 13, completions_to_date: null, saved_moment_count: 3, analysis_unlocked: false };
    const headline = landingHeadline(identity);
    const subcopy = landingSubcopy(identity);
    const rendered = `${headline} ${subcopy}`;
    expect(headline).toBe("Salutations, SirGuest#13!");
    expect(subcopy).toBe("— of 13 visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#14. Mwahaha! Kittens and cookies! Mwahaha, yessss.");
    expect(rendered).toBe("Salutations, SirGuest#13! — of 13 visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#14. Mwahaha! Kittens and cookies! Mwahaha, yessss.");
    expect(rendered).not.toContain("[");
    expect(rendered).not.toContain("]");
  });

  it("keeps unknown completion distinct from real zero values", () => {
    const identity = { guest_number: 0, total_guests: 0, completions_to_date: null, saved_moment_count: 0, analysis_unlocked: false };
    const rendered = `${landingHeadline(identity)} ${landingSubcopy(identity)}`;
    expect(rendered).toContain("SirGuest#0! — of 0 visitors");
    expect(rendered).toContain("new name, SirGuest#0.");
    expect(rendered).not.toContain("[");
    expect(rendered).not.toContain("]");
  });
});
