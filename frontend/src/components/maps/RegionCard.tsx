import { DeleteOutlineRounded, EditRounded, ViewKanbanRounded } from "@mui/icons-material";
import { Avatar, Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { STATE_META, participantColor } from "../tasks/types";
import { t } from "../../i18n";
import type { MapRegion } from "./mapsApi";

type Props = {
  region: MapRegion;
  selected: boolean;
  canEdit: boolean;
  onSelect: (region: MapRegion) => void;
  onEdit: (region: MapRegion) => void;
  onDelete: (region: MapRegion) => void;
};

/** The box of one sector: what is being done there, by whom, and for which task. */
export default function RegionCard({ region, selected, canEdit, onSelect, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  const meta = STATE_META[region.state];

  return (
    <Paper
      elevation={0}
      className="status-card"
      onClick={() => onSelect(region)}
      sx={{
        p: 1.5,
        cursor: "pointer",
        borderLeft: `4px solid ${meta.accent}`,
        outline: selected ? `2px solid ${meta.accent}` : "none",
        outlineOffset: -1,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{region.title}</Typography>
          <Chip
            size="small"
            icon={<meta.Icon />}
            label={meta.label}
            sx={{
              mt: 0.5,
              bgcolor: meta.soft,
              color: meta.ink,
              fontWeight: 700,
              "& .MuiChip-icon": { color: meta.accent, fontSize: 16 },
            }}
          />
        </Box>
        {canEdit && (
          <Stack direction="row" onClick={(event) => event.stopPropagation()}>
            <Tooltip title={t("common.edit")}>
              <IconButton size="small" onClick={() => onEdit(region)}>
                <EditRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("common.delete")}>
              <IconButton size="small" onClick={() => onDelete(region)}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      {region.description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {region.description}
        </Typography>
      )}

      {region.assignees.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
          {region.assignees.map((person) => (
            <Chip
              key={person.id}
              size="small"
              avatar={
                <Avatar sx={{ bgcolor: participantColor(person.id), color: "#fff !important" }}>
                  {person.name.slice(0, 1).toUpperCase()}
                </Avatar>
              }
              label={person.name}
            />
          ))}
        </Stack>
      )}

      {region.task && (
        <Chip
          size="small"
          variant="outlined"
          icon={<ViewKanbanRounded />}
          label={`#${region.task.id} · ${region.task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/tasks?task=${region.task!.id}`);
          }}
          sx={{ mt: 1, maxWidth: "100%" }}
        />
      )}
    </Paper>
  );
}
