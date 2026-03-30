import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
  	extend: {
  		colors: {
  			surface: {
  				DEFAULT: 'hsl(var(--surface))',
  				raised: 'hsl(var(--surface-raised))',
  				overlay: 'hsl(var(--surface-overlay))',
  				sunken: 'hsl(var(--surface-sunken))'
  			},
  			border: 'hsl(var(--border))',
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				hover: 'hsl(var(--accent-hover))',
  				muted: 'hsl(var(--accent-muted))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			text: {
  				primary: 'hsl(var(--text-primary))',
  				secondary: 'hsl(var(--text-secondary))',
  				muted: 'hsl(var(--text-muted))'
  			},
  			'tertiary': {
  				DEFAULT: 'hsl(var(--tertiary))',
  				container: 'hsl(var(--tertiary-container))'
  			},
  			'on-tertiary-container': 'hsl(var(--on-tertiary-container))',
  			'secondary-container': 'hsl(var(--secondary-container))',
  			'on-secondary-container': 'hsl(var(--on-secondary-container))',
  			'surface-container': {
  				lowest: 'hsl(var(--surface-container-lowest))',
  				low: 'hsl(var(--surface-container-low))',
  				DEFAULT: 'hsl(var(--surface-container))',
  				high: 'hsl(var(--surface-container-high))',
  				highest: 'hsl(var(--surface-container-highest))'
  			},
  			'on-surface': 'hsl(var(--on-surface))',
  			'on-surface-variant': 'hsl(var(--on-surface-variant))',
  			'outline-variant': 'hsl(var(--outline-variant))',
  			danger: {
  				DEFAULT: 'hsl(var(--danger))',
  				hover: 'hsl(var(--danger-hover))'
  			},
  			success: 'hsl(var(--success))',
  			warning: 'hsl(var(--warning))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			],
  			serif: [
  				'Newsreader',
  				'Georgia',
  				'Cambria',
  				'serif'
  			],
  			editorial: [
  				'Newsreader',
  				'Georgia',
  				'Cambria',
  				'serif'
  			],
  			headline: [
  				'Newsreader',
  				'Georgia',
  				'Cambria',
  				'serif'
  			],
  			body: [
  				'Manrope',
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			],
  			label: [
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			]
  		},
  		spacing: {
  			'14': '3.5rem',
  			'22': '5.5rem'
  		},
  		borderRadius: {
  			xl: '1rem',
  			'2xl': '1.25rem',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		animation: {
  			'fade-in': 'fadeIn 0.2s ease-out',
  			'slide-up': 'slideUp 0.3s ease-out',
  			'scale-in': 'scaleIn 0.15s ease-out',
  			'page-transition': 'pageTransition 0.15s ease-out',
  			'slide-in-right': 'slideInRight 0.2s ease-out',
  			shimmer: 'shimmer 2s infinite linear',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'toast-in': 'toastSlideIn 0.3s ease-out'
  		},
  		keyframes: {
  			fadeIn: {
  				from: {
  					opacity: '0'
  				},
  				to: {
  					opacity: '1'
  				}
  			},
  			slideUp: {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			scaleIn: {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			shimmer: {
  				from: {
  					backgroundPosition: '-200% 0'
  				},
  				to: {
  					backgroundPosition: '200% 0'
  				}
  			},
  			pageTransition: {
  				from: {
  					opacity: '0',
  					transform: 'translateY(4px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			slideInRight: {
  				from: {
  					opacity: '0',
  					transform: 'translateX(16px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateX(0)'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			toastSlideIn: {
  				from: {
  					opacity: '0',
  					transform: 'translateX(16px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateX(0)'
  				}
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
