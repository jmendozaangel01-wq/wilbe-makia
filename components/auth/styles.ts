/** Shared Tailwind class strings for the auth screens. */
export const LABEL = "block text-sm font-semibold text-cream";

export const INPUT =
  "block w-full min-h-11 rounded-md border border-border bg-charcoal-soft px-3.5 text-base text-cream placeholder:text-gray-dim " +
  "outline-none transition-colors focus:border-gold focus-visible:ring-2 focus-visible:ring-gold/50 " +
  "aria-[invalid=true]:border-red aria-[invalid=true]:focus-visible:ring-red/50 disabled:opacity-60";

export const PRIMARY_BUTTON =
  "flex w-full min-h-11 items-center justify-center rounded-md bg-gold px-4 text-sm font-extrabold text-charcoal " +
  "transition-colors hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const SECONDARY_BUTTON =
  "flex w-full min-h-11 items-center justify-center gap-3 rounded-md border border-border bg-charcoal-card-alt px-4 text-sm font-semibold text-cream " +
  "transition-colors hover:border-gray-dim hover:bg-charcoal-hatch focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const LINK =
  "rounded-sm font-semibold text-gold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export const ERROR_TEXT = "text-[13px] font-semibold text-[oklch(0.72_0.17_26)]";
