import type { LucideIcon } from "lucide-react";

export function AdminMetric({
  icon: Icon,
  label,
  value,
  note,
  trailingIcon: TrailingIcon,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note?: string;
  trailingIcon?: LucideIcon;
}) {
  return (
    <article className="admin-metric">
      <div className="admin-metric__icon">
        <Icon size={23} strokeWidth={1.8} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
      {TrailingIcon && (
        <TrailingIcon
          className="admin-metric__decoration"
          size={34}
          aria-hidden="true"
        />
      )}
    </article>
  );
}
