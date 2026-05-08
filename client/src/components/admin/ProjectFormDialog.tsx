import { useEffect, useState } from 'react';
import { AppDialog, AppDialogTitle, AppDialogContent, AppDialogActions, cancelBtnSx, saveBtnSx } from '../ui';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import type { Project, UpsertProjectRequest, Department } from '../../lib/types';
import { useQuery } from '@tanstack/react-query';
import { getDepartments } from '../../lib/api';

interface ProjectFormDialogProps {
  open: boolean;
  title: string;
  initial?: Project;
  isPending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (payload: UpsertProjectRequest) => void;
}

export default function ProjectFormDialog({ open, title, initial, isPending, error, onClose, onSubmit }: ProjectFormDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [departmentId, setDepartmentId] = useState<number | null>(null);

  const { data: departments = [], isLoading: deptsLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: getDepartments,
  });

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setIsActive(initial?.isActive ?? true);
      setDepartmentId(initial?.departmentId ?? null);
      setCode(initial?.code ?? '');
    }
  }, [open, initial]);

  useEffect(() => {
    // Auto-generate code from name (e.g., "Payroll Automation" -> "PAY-001")
    if (!initial || !initial.code) {
      if (name.trim()) {
        // Use first 3 uppercase letters of each word, joined by '-', fallback to 'PRJ'
        const codeGen = name
          .split(' ')
          .map(w => w[0]?.toUpperCase() || '')
          .join('')
          .padEnd(3, 'X');
        setCode(codeGen + '-001');
      } else {
        setCode('');
      }
    }
  }, [name, initial]);

  const handleSubmit = () => {
    onSubmit({ name: name.trim(), code: code.trim(), description: description.trim(), isActive, departmentId });
  };

  return (
    <AppDialog open={open} onClose={onClose} maxWidth="xs">
      <AppDialogTitle>{title}</AppDialogTitle>
      <AppDialogContent>
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            autoFocus
            disabled={isPending}
          />
          {/* Code field is hidden, but still auto-generated and submitted */}
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            disabled={isPending}
          />
          <FormControlLabel
            control={<Checkbox checked={isActive} onChange={e => setIsActive(e.target.checked)} disabled={isPending} />}
            label="Active"
          />
          <TextField
            select
            label="Department"
            value={departmentId ?? ''}
            onChange={e => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
            fullWidth
            SelectProps={{ native: true }}
            disabled={deptsLoading || isPending}
          >
            <option value="">No department</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </TextField>
          {error && <Alert severity="error">{error.message}</Alert>}
        </Stack>
      </AppDialogContent>
      <AppDialogActions>
        <Button variant="outlined" sx={cancelBtnSx} onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" sx={saveBtnSx} disabled={isPending || !name.trim()}>
          {isPending ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </AppDialogActions>
    </AppDialog>
  );
}
