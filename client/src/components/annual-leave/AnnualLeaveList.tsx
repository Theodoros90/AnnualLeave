import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Add as AddIcon } from '@mui/icons-material'
import { getAnnualLeaves } from '../../lib/api'
import { useStore } from '../../lib/mobx'
import type { AnnualLeave, UserInfo } from '../../lib/types'
import AnnualLeaveCard from './AnnualLeaveCard'
import AnnualLeaveForm from './AnnualLeaveForm'

type AnnualLeaveListProps = {
    user: UserInfo
    filterPredicate?: (leave: AnnualLeave) => boolean
    showCreateButton?: boolean
    emptyMessage?: string
    isAdmin?: boolean
}

const AnnualLeaveList = observer(function AnnualLeaveList({
    user,
    filterPredicate,
    showCreateButton = true,
    emptyMessage = 'No leave requests found.',
    isAdmin = false,
}: AnnualLeaveListProps) {
    const { uiStore } = useStore()

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

    const visibleLeaves = filterPredicate ? (leaves ?? []).filter(filterPredicate) : (leaves ?? [])

    return (
        <Stack spacing={2}>
            {showCreateButton && (
                <Box sx={{ pb: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => uiStore.openCreateDrawer()}
                        sx={{
                            borderRadius: 999,
                            px: 2.2,
                            py: 1,
                            textTransform: 'none',
                            fontWeight: 700,
                        }}
                    >
                        New Leave Request
                    </Button>
                </Box>
            )}

            {visibleLeaves.length === 0 ? (
                <Box
                    sx={{
                        py: 6,
                        textAlign: 'center',
                        border: '1px dashed',
                        borderColor: 'divider',
                        borderRadius: 2,
                    }}
                >
                    <Typography color="text.secondary">{emptyMessage}</Typography>
                </Box>
            ) : (
                visibleLeaves.map((leave) => (
                    <AnnualLeaveCard key={leave.id} leave={leave} user={user} />
                ))
            )}

            <AnnualLeaveForm open={uiStore.isCreateDrawerOpen} onClose={() => uiStore.closeCreateDrawer()} isAdmin={isAdmin} />
        </Stack>
    )
})

export default AnnualLeaveList
