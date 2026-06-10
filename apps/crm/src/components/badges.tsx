import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PERSONA_LABEL,
  CHANNEL_LABEL,
  COMM_STATUS_LABEL,
  CAMPAIGN_STATUS_LABEL,
} from "@/lib/display";
import type { Persona, Channel, CommStatus, CampaignStatus } from "@prisma/client";

const PERSONA_CLASS: Record<Persona, string> = {
  HIGH_SPENDER: "bg-violet-100 text-violet-700",
  DORMANT: "bg-amber-100 text-amber-700",
  NEW: "bg-sky-100 text-sky-700",
  DISCOUNT_HUNTER: "bg-rose-100 text-rose-700",
  BRAND_LOYAL: "bg-emerald-100 text-emerald-700",
};

export function PersonaBadge({ persona }: { persona: Persona }) {
  return (
    <Badge className={cn("border-transparent", PERSONA_CLASS[persona])}>
      {PERSONA_LABEL[persona]}
    </Badge>
  );
}

const CHANNEL_CLASS: Record<Channel, string> = {
  WHATSAPP: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  SMS: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  EMAIL: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  RCS: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200",
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <Badge className={cn("border-transparent", CHANNEL_CLASS[channel])}>
      {CHANNEL_LABEL[channel]}
    </Badge>
  );
}

const COMM_STATUS_VARIANT: Record<
  CommStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "muted"
> = {
  QUEUED: "muted",
  SENT: "secondary",
  DELIVERED: "secondary",
  OPENED: "default",
  READ: "default",
  CLICKED: "warning",
  CONVERTED: "success",
  FAILED: "destructive",
};

export function CommStatusBadge({ status }: { status: CommStatus }) {
  return <Badge variant={COMM_STATUS_VARIANT[status]}>{COMM_STATUS_LABEL[status]}</Badge>;
}

const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "muted"
> = {
  PROPOSED: "default",
  APPROVED: "warning",
  SENDING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={CAMPAIGN_STATUS_VARIANT[status]}>{CAMPAIGN_STATUS_LABEL[status]}</Badge>
  );
}
