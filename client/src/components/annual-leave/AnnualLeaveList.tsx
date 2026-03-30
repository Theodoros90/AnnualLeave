import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Add as AddIcon } from '@mui/icons-material'
import { getAnnualLeaves } from '../../lib/api'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveCard from './AnnualLeaveCard'
import AnnualLeaveForm from './AnnualLeaveForm'

function AnnualLeaveList({ user }: { user: UserInfo }) {
    const [createOpen, setCreateOpen] = useState(false)

    const { data: leaves, isLoading, isError } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
    })

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (isError) {
        return <Alert severity="error">Failed to load leave requests.</Alert>
    }

    return (
        <Stack spacing={2}>
            {!leaves || leaves.length === 0 ? (
                <Box
                    sx={{
                        py: 6,
                        textAlign: 'center',
                        border: '1px dashed',
                        borderColor: 'divider',
                        borderRadius: 2,
                    }}
                >
                    <Typography color="text.secondary">No leave requests found.</Typography>
                </Box>
            ) : (
                leaves.map((leave) => (
                    <AnnualLeaveCard key={leave.id} leave={leave} user={user} />
                ))
            )}

            <Box sx={{ pt: 1 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateOpen(true)}
                >
                    New Leave Request
                </Button>
            </Box>

            <AnnualLeaveForm open={createOpen} onClose={() => setCreateOpen(false)} />
        </Stack>
    )
}

export default AnnualLeaveList
