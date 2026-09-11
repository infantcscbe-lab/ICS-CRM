interface GpsDisabledModalProps {
  isOpen?: boolean;
  onRetry?: () => void;
}

export function GpsDisabledModal(_props: GpsDisabledModalProps) {
  // Modal popup completely disabled per user preference
  return null;
}
