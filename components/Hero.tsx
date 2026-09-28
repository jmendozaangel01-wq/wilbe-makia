interface HeroProps {
  /** Organization display name (design tenant-branding domain). Used as the
   * logo's alt text, shown as a small kicker when no logo is set, and as the
   * heading when no raffle could be resolved. */
  orgName: string;
  /** Organization logo (organizations.logo_url), null when unset. */
  logoUrl: string | null;
  /** Heading element for the title. The marketing page embeds this hero as a
   * demo below its own <h1>, so it passes "h2" there. Defaults to "h1". */
  headingAs?: "h1" | "h2";
  /** raffles.premio_nombre: the whole title phrase, shown exactly as the owner
   * typed it (no fixed prefix, so gender/plurals are never a problem). Omitted
   * when no raffle could be resolved: the heading falls back to orgName rather
   * than to another tenant's prize. */
  premioNombre?: string;
  /** raffles.premio_imagen_url, optional. No photo means no image block at
   * all, never a placeholder or another tenant's picture. */
  premioImagenUrl?: string | null;
  /** raffles.precio_por_numero for the resolved tenant. Omitted when no
   * raffle could be resolved: the price block is then hidden rather than
   * falling back to the platform owner's own legacy constant. */
  pricePerNumber?: number;
  /** raffles.sorteo_fecha for the resolved tenant, same omit-and-hide rule. */
  sorteoFecha?: string;
}

export default function Hero({
  orgName,
  logoUrl,
  headingAs: Heading = "h1",
  premioNombre,
  premioImagenUrl,
  pricePerNumber,
  sorteoFecha,
}: HeroProps) {
  const title = premioNombre ?? orgName;

  return (
    <div className="relative bg-charcoal px-6 py-16 sm:px-10 flex flex-col items-center gap-9">
      <div className="max-w-[640px] flex flex-col items-center gap-[18px] text-center">
        {logoUrl ? (
          // Plain <img>, not next/image: logoUrl comes from a Supabase
          // Storage public bucket (design D7) whose host isn't in
          // next.config.ts's images.remotePatterns -- matching the existing
          // convention for storage-hosted images elsewhere in this codebase
          // (components/admin/ReservasTab.tsx's comprobante preview).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={orgName} className="h-10 w-auto object-contain" />
        ) : (
          <div className="text-xs tracking-[2px] text-gray uppercase font-bold">{orgName}</div>
        )}

        <div className="inline-flex items-center gap-2 text-gold font-bold text-[13px] tracking-[2px] uppercase">
          <span className="w-2 h-2 rounded-full bg-red inline-block animate-pulse-dot" />
          Rifa en vivo
        </div>

        <Heading className="font-display text-[42px] sm:text-[64px] leading-[0.95] tracking-[0.5px] break-words">
          {title}
        </Heading>

        {sorteoFecha !== undefined && pricePerNumber !== undefined && (
          <div className="flex items-center gap-7 flex-wrap justify-center mt-1.5">
            <div>
              <div className="text-xs tracking-[1.5px] text-gray uppercase">Sorteo</div>
              <div className="font-display text-[22px] text-gold">{sorteoFecha}</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <div className="text-xs tracking-[1.5px] text-gray uppercase">Precio por número</div>
              <div className="font-display text-[22px] text-gold">${pricePerNumber}</div>
            </div>
          </div>
        )}

        <a
          href="#paquetes"
          className="mt-2.5 inline-flex items-center justify-center bg-red text-white font-extrabold text-base px-8 py-4 rounded-sm w-fit shadow-[0_8px_24px_oklch(0.52_0.21_26_/_0.4)] hover:brightness-110 transition"
        >
          Comprar números
        </a>
      </div>

      {premioImagenUrl && (
        <div className="flex-none w-[680px] max-w-[90vw] h-[420px] sm:h-[600px] md:h-[760px] border-2 border-gold rounded-[10px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
          {/* Plain <img>, same reason as the logo above: the prize photo lives
              in the Storage public bucket (or, for the first tenant, its own
              domain), neither of which is in images.remotePatterns. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={premioImagenUrl} alt={title} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[center_30%]" />
          <div className="absolute inset-0 shadow-[inset_0_0_60px_oklch(0.15_0.014_40_/_0.35)]" />
        </div>
      )}
    </div>
  );
}
