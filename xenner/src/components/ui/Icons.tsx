import type { JSX } from "solid-js";

interface IconProps {
  class?: string;
  classList?: Record<string, boolean>;
}

function iconProps(props: IconProps): JSX.SvgSVGAttributes<SVGSVGElement> {
  return {
    class: props.class,
    classList: props.classList,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 7.5h6l2-2h4l2 2h4v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 7.5h6l2-2h4l2 2h4v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2 5" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m4 16-.8 4 4-.8L18 8.4 14.6 5Z" />
      <path d="m13.2 6.4 3.4 3.4M4 16l3.4 3.4" />
    </svg>
  );
}

export function ShapesIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="11" height="11" rx="2" />
      <circle cx="17" cy="17" r="4" />
      <path d="M14 4h7v7" />
    </svg>
  );
}

export function MarkdownIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14" />
    </svg>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 5h14M12 5v14M8 19h8" />
    </svg>
  );
}

export function HeadingIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 5v14M12 5v14M4 12h8" />
    </svg>
  );
}

export function BulletListIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 5.5h.01M4 11.5h.01M4 17.5h.01" stroke-width="2.4" />
    </svg>
  );
}

export function OrderedListIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 6h11M9 12h11M9 18h11M3 5h2v4M3 15.5c0-1 2.5-1.2 2.5.2 0 1-2.5 1.4-2.5 2.8h3M3 10h2" />
    </svg>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 7h5v5H6.5C6.5 15 8 17 10 18M14 7h5v5h-3.5c0 3 1.5 5 3.5 6" />
    </svg>
  );
}

export function SelectIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 3 10 8-5 1 3 6-2.5 1.2-3-6L4 17Z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10.3 4.4 2.8 17.5A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.5L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </svg>
  );
}

export function SquareIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function LineIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 19 19 5" />
    </svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 19 19 5M11 5h8v8" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 7.5h6l2-2h4l2 2h4v3" />
      <path d="m3 10 1.3 9.2a2 2 0 0 0 2 1.8h10.8a2 2 0 0 0 2-1.6L21 10Z" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4 3 2.5 2.5-2 6 5.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
