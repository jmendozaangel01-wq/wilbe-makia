interface SiteFooterProps {
  /** Organization display name (design tenant-branding domain). */
  orgName: string;
}

export default function SiteFooter({ orgName }: SiteFooterProps) {
  return (
    <div className="px-6 py-8 sm:px-10 text-center text-gray-dim text-[13px] border-t border-border">
      {orgName} © 2026 — Rifas seguras y verificadas
    </div>
  );
}
