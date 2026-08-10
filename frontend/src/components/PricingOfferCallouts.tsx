import { Badge } from './ui/badge';

export function PricingValueBadge() {
  return (
    <div className="space-y-2 flex flex-col items-center">
      <Badge variant="secondary" className="text-xs font-medium">
        ~98% cheaper than a 1% advisor fee
      </Badge>
    </div>
  );
}
