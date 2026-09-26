export default function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-dim" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span>o</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
