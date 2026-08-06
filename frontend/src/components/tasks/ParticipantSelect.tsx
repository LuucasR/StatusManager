import { Autocomplete, TextField } from "@mui/material";
import type { TaskParticipant } from "./types";

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
      // Obligatorio: sin esto MUI compara por identidad de objeto y tira
      // warnings al reabrir el diálogo en modo edición.
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      filterSelectedOptions
      renderInput={(params) => (
        <TextField
          {...params}
          label="Participantes"
          placeholder={value.length ? "" : "Buscar empleado…"}
        />
      )}
    />
  );
}
