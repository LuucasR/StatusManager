import { Chip, Stack, Typography } from "@mui/material";
import { t, tf } from "../../i18n";
import type { HalfSummary } from "./attendanceApi";

/** Late allowance spent in one half of the month: red once it is exceeded. */
export function HalfCell({ half }: { half: HalfSummary }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
      <Chip
        size="small"
        color={half.exceeded ? "error" : "success"}
        label={tf("attendance.used", { used: half.lateMinutes, tolerance: half.tolerance })}
      />
      <Typography variant="caption" color="text.secondary">
        {tf("attendance.lateDays", { days: half.lateDays })}
      </Typography>
    </Stack>
  );
}

export function LateChip({ minutes }: { minutes: number }) {
  return minutes > 0 ? (
    <Chip size="small" color="warning" label={tf("attendance.lateMinutes", { minutes })} />
  ) : (
    <Chip size="small" color="success" variant="outlined" label={t("attendance.onTime")} />
  );
}
