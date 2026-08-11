export interface GuestSessionIdentity {
  guest_number: number;
  total_guests: number;
  completions_to_date: number | null;
  saved_moment_count: number;
  analysis_unlocked: boolean;
  completed: boolean;
  completion_ordinal: number | null;
}

export const EMPTY_GUEST_SESSION: GuestSessionIdentity = {
  guest_number: 0,
  total_guests: 0,
  completions_to_date: null,
  saved_moment_count: 0,
  analysis_unlocked: false,
  completed: false,
  completion_ordinal: null,
};

export const CLICK_ME_COPY = "Do not click me. Use the keyboard — the one you have covered in crumbs and fingerprints. Your keyboard hates you. Tap it anyway: ← or → and ⏎.";
export const SIGN_IN_COPY = "Do not sign in. Instead, be amazed by an obscure long word beginning with the first letter you type. You get ninety-nine seconds to reflect on why you are a hooman, while the AI reads you the correct pronunciation and some highly optimistic predictions about what your friends would think if you dropped that word into conversation as though it had always been part of your vocabulary.";
export const SIGN_IN_NOTICE = "Account registration is currently unavailable. Coming soon.";
export const SUB_CARD_COPY = "The timer has started. You shouldn't still be clicking. Are you clicking? Stop clicking.";

export const landingHeadline = ({ guest_number }: Pick<GuestSessionIdentity, "guest_number">) =>
  `Salutations, SirGuest#${guest_number}!`;

export const landingSubcopy = ({ guest_number, total_guests, completions_to_date }: Pick<GuestSessionIdentity, "guest_number" | "total_guests" | "completions_to_date">) => {
  const nextGuestNumber = guest_number > 0 ? guest_number + 1 : 0;
  const completionCount = completions_to_date === null ? "—" : completions_to_date;
  return `${completionCount} of ${total_guests} visitors have completed the three-for-five challenge to date. Fail to complete it in time and you will be returned to the landing page under your new name, SirGuest#${nextGuestNumber}. Mwahaha! Kittens and cookies! Mwahaha, yessss.`;
};
