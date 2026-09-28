interface SiteNavProps {
  /** Organization display name (organizations.nombre), plain text. */
  orgName: string;
}

export default function SiteNav({ orgName }: SiteNavProps) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 sm:px-10 bg-charcoal/90 backdrop-blur-sm border-b border-border">
      <div className="min-w-0 truncate font-display text-[22px] tracking-wide text-cream">{orgName}</div>
    </div>
  );
}
