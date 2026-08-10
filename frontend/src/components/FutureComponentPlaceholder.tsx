import { LockKeyhole } from "lucide-react";

interface Props {
  alt: string;
  caption: string;
  imageSrc: string;
  label: string;
  variant?: "card" | "strip";
}

export function FutureComponentPlaceholder({ alt, caption, imageSrc, label, variant = "card" }: Props) {
  return (
    <figure className={`future-component-placeholder future-component-placeholder-${variant}`} aria-disabled="true" data-placeholder="future-component">
      <div className="future-component-placeholder-heading">
        <LockKeyhole size={11} aria-hidden="true" />
        <strong>{label}</strong>
      </div>
      <div className="future-component-placeholder-image" aria-hidden="true">
        <img src={imageSrc} alt={alt} />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
