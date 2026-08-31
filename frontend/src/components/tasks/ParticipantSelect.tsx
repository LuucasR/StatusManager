import { Autocomplete, TextField } from "@mui/material";
import type { TaskParticipant } from "./types";
import { t } from "../../i18n";

type Props = {
  options: TaskParticipant[];
  value: TaskParticipant[];
  onChange: (value: TaskParticipant[]) => void;
  disabled?: boolean;
};

export default function ParticipantSelect({ options, value, onChange, disabled }: Props) {
  return (
    <Autocomplete
      multiple
      disabled={disabled}
      options={options}
      value={value}
      onChange={(_, next) => onChange(next)}
      getOptionLabel={(option) => `#${option.employeeNumber} - ${option.name}`}
      // Required: without it MUI compares by object identity and warns when the
      // dialog is reopened in edit mode.
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      filterSelectedOptions
      renderInput={(params) => (
        <TextField
          {...params}
          label={t("board.participants")}
          placeholder={value.length ? "" : t("board.searchEmployee")}
        />
      )}
    />
  );
}
