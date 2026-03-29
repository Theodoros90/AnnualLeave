import { createTheme } from '@mui/material/styles'

const theme = createTheme({
    palette: {
        primary: {
            main: '#0f766e',
        },
        secondary: {
            main: '#b45309',
        },
        background: {
            default: '#f5f5f0',
            paper: '#ffffff',
        },
    },
    shape: {
        borderRadius: 20,
    },
    typography: {
        fontFamily: "'Segoe UI Variable', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        h3: {
            fontWeight: 700,
            letterSpacing: '-0.03em',
        },
        h6: {
            fontWeight: 700,
        },
    },
    components: {
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                rounded: {
                    borderRadius: 20,
                },
            },
        },
    },
})

export default theme