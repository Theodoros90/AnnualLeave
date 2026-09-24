import Box from '@mui/material/Box'
import type React from 'react'

/**
 * The row action button the admin review pages share — Approve (green), Reject
 * and Cancel (red), View (ghost) — so Leave Management and All Timesheets offer
 * the same buttons in the same shape.
 */
export default function ActionBtn({ variant, onClick, disabled, children }: {
    variant: 'success' | 'danger' | 'ghost'
    onClick: (e: React.MouseEvent) => void
    disabled?: boolean
    children: React.ReactNode
}) {
    const styles =
        variant === 'success' ? { bg: 'success.main', color: '#fff', hover: 'success.dark', border: 'none' } :
        variant === 'danger'  ? { bg: 'error.main', color: '#fff', hover: 'error.dark', border: 'none' } :
                                 { bg: 'transparent', color: 'text.secondary', hover: 'action.hover', border: '1px solid', borderColor: 'divider' }
    return (
        <Box
            component="button"
            onClick={onClick}
            disabled={disabled}
            sx={{
                bgcolor: styles.bg, color: styles.color, border: styles.border,
                borderRadius: '6px', px: '12px', py: '5px',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                '&:hover:not(:disabled)': { bgcolor: styles.hover },
                '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
        >
            {children}
        </Box>
    )
}
