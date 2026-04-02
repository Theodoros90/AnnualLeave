import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Add as AddIcon, FilterListRounded as FilterListRoundedIcon } from '@mui/icons-material'
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
    const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear())

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

    // Show only years that exist in leave records (as before).
    const availableYears = Array.from(
        new Set((leaves ?? []).map((leave) => new Date(leave.startDate).getFullYear()))
    )
        .sort()
        .reverse()

    // Filter by year first, then apply custom filter predicate
    const leavesByYear = selectedYear === 'all'
        ? (leaves ?? [])
        : (leaves ?? []).filter((leave) => new Date(leave.startDate).getFullYear() === selectedYear)
    const visibleLeaves = filterPredicate ? leavesByYear.filter(filterPredicate) : leavesByYear

    return (
        <Stack spacing={2}>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 1.5,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.12)',
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(180,83,9,0.06))',
                }}
            >
                <Stack direction="row" alignItems="center" spacing={1}>
                    <FilterListRoundedIcon fontSize="small" color="action" />
                    <Typography variant="body2" fontWeight={700}>
                        Filter by year
                    </Typography>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <Select
                            value={selectedYear}
                            onChange={(e) => {
                                const value = e.target.value
                                setSelectedYear(value === 'all' ? 'all' : Number(value))
                            }}
                            sx={{
                                borderRadius: 999,
                                backgroundColor: 'rgba(255,255,255,0.85)',
                                '& .MuiSelect-select': { fontWeight: 700 },
                            }}
                        >
                            <MenuItem value="all">ALL Years</MenuItem>
                            {availableYears.map((year) => (
                                <MenuItem key={year} value={year}>
                                    {year}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Chip
                        size="small"
                        variant="outlined"
                        color="primary"
                        label={`${visibleLeaves.length} request${visibleLeaves.length === 1 ? '' : 's'}`}
                    />
                </Stack>
            </Box>

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
