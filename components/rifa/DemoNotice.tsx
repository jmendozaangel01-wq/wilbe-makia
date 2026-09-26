interface DemoNoticeProps {
  /** Extra line shown under the main notice (e.g. the "do not pay" warning). */
  detail?: string;
  className?: string;
}

export default function DemoNotice({ detail, className = "" }: DemoNoticeProps) {
  return (
    <div
      role="note"
      className={`mx-auto max-w-[640px] rounded-sm border border-dashed border-gold/60 px-4 py-3 text-center text-sm text-gold ${className}`}
    >
      <div className="font-semibold">Esto es una demo: no se guarda ninguna reserva</div>
      {detail && <div className="mt-1 text-gray">{detail}</div>}
    </div>
  );
}
