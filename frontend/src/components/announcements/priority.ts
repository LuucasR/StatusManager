import { CampaignRounded, NewReleasesRounded, ReportRounded } from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import type { AnnouncementPriority } from "./announcementsApi";

/**
 * Colour and icon per priority. The colours are the theme's semantic tokens, so
 * they hold in every palette and both modes; INFO takes the palette's accent.
 */
export const PRIORITY_META: Record<AnnouncementPriority, { color: string; Icon: SvgIconComponent }> = {
  CRITICAL: { color: "var(--danger)", Icon: ReportRounded },
  IMPORTANT: { color: "var(--warning)", Icon: NewReleasesRounded },
  INFO: { color: "var(--accent-base)", Icon: CampaignRounded },
};
