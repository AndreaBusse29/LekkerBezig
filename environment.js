// environment.js
class Environment {
    constructor() {
        this.env = this.detectEnvironment();
        this.config = this.getConfig();
    }

    detectEnvironment() {
        // Check various indicators
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1') {
            return 'development';
        }

        if (window.location.hostname.includes('staging')) {
            return 'staging';
        }

        return 'production';
    }

    getConfig() {
        const configs = {
            development: {
                emailjs: null, // Will be fetched from server
                debug: true
            },
            production: {
                emailjs: null, // Will be fetched from server
                debug: false
            }
        };

        return configs[this.env];
    }

    get(key) {
        return this.config[key];
    }

    isDevelopment() {
        return this.env === 'development';
    }

    isProduction() {
        return this.env === 'production';
    }
}

// Create singleton instance
const env = new Environment();
