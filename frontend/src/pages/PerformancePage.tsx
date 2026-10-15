import { GavelRounded, HowToRegRounded, InsightsRounded } from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import { Box, Container, Tab, Tabs, Typography } from "@mui/material";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { t, type TranslationKey } from "../i18n";
import SummaryPage from "./SummaryPage";
import AttendancePage from "./AttendancePage";
import WarningsPage from "./WarningsPage";

export const PERFORMANCE_TABS = ["attendance", "warnings", "summary"] as const;
type PerformanceTab = (typeof PERFORMANCE_TABS)[number];

const TAB_META: Record<PerformanceTab, { key: TranslationKey; Icon: SvgIconComponent }> = {
  attendance: { key: "nav.attendance", Icon: HowToRegRounded },
  warnings: { key: "nav.warnings", Icon: GavelRounded },
  summary: { key: "nav.summary", Icon: InsightsRounded },
};

/**
 * "Performance": attendance, warnings and the personal summary, one sidebar
 * entry with a tab each (/performance/:tab). The pages themselves are the same
 * ones that used to have an entry of their own; their old paths redirect here.
 */
export default function PerformancePage() {
  const { tab } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();

  const current = (PERFORMANCE_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as PerformanceTab)
    : null;
  if (!current) return <Navigate to={{ pathname: `/performance/${PERFORMANCE_TABS[0]}`, search }} replace />;

  return (
    <Box>
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Box className="page-heading">
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("nav.performance")}
          </Typography>
        </Box>
        <Tabs
          value={current}
          onChange={(_, next: PerformanceTab) => navigate(`/performance/${next}`)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mt: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {PERFORMANCE_TABS.map((value) => {
            const { key, Icon } = TAB_META[value];
            return <Tab key={value} value={value} label={t(key)} icon={<Icon />} iconPosition="start" />;
          })}
        </Tabs>
      </Container>

      {current === "attendance" && <AttendancePage />}
      {current === "warnings" && <WarningsPage />}
      {current === "summary" && <SummaryPage />}
    </Box>
  );
}
