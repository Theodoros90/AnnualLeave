import { createTheme } from '@mui/material/styles'

const theme = createTheme({
    palette: {
        primary: {
            main: '#0f766e',
            dark: '#115e59',
            light: '#2dd4bf',
        },
        secondary: {
            main: '#c2410c',
            dark: '#9a3412',
            light: '#fdba74',
        },
        success: {
            main: '#2f855a',
        },
        warning: {
            main: '#d97706',
        },
        error: {
            main: '#dc2626',
        },
        info: {
            main: '#0369a1',
        },
        text: {
            primary: '#0f172a',
            secondary: '#475569',
        },
        background: {
            default: '#f4f5f2',
            paper: '#ffffff',
        },
        divider: 'rgba(15, 23, 42, 0.12)',
    },
    shape: {
        borderRadius: 16,
    },
    typography: {
        fontFamily: "'Aptos', 'Segoe UI Variable', 'Segoe UI', Tahoma, 'Trebuchet MS', sans-serif",
        h1: {
            fontWeight: 800,
            letterSpacing: '-0.03em',
        },
        h2: {
            fontWeight: 800,
            letterSpacing: '-0.03em',
        },
        h3: {
            fontWeight: 800,
            letterSpacing: '-0.03em',
        },
        h4: {
            fontWeight: 800,
            letterSpacing: '-0.02em',
        },
        h5: {
            fontWeight: 750,
            letterSpacing: '-0.015em',
        },
        h6: {
            fontWeight: 750,
            letterSpacing: '-0.01em',
        },
        subtitle1: {
            fontWeight: 600,
        },
        body1: {
            lineHeight: 1.55,
        },
        body2: {
            lineHeight: 1.5,
        },
        button: {
            textTransform: 'none',
            fontWeight: 700,
            letterSpacing: '-0.01em',
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundImage:
                        'radial-gradient(circle at 15% 0%, rgba(15,118,110,0.08), transparent 35%), radial-gradient(circle at 85% 0%, rgba(194,65,12,0.08), transparent 35%)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderBottom: '1px solid rgba(15, 23, 42, 0.1)',
                    backdropFilter: 'blur(8px)',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                rounded: {
                    borderRadius: 16,
                },
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
            styleOverrides: {
                root: {
                    borderRadius: 999,
                    paddingInline: 18,
                    minHeight: 40,
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 999,
                    fontWeight: 600,
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                size: 'small',
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 14,
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    height: 3,
                    borderRadius: 999,
                },
            },
        },
    },
})

export default theme