import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'memory-bank.log');
const LOG_DIR = path.dirname(LOG_FILE_PATH);

class Logger {
    private loggingEnabled: boolean = false;

    constructor() {
        // Check for --log argument to enable logging
        if (process.argv.includes('--log')) {
            this.loggingEnabled = true;
        }
    }

    private logToFile(level: string, message: string): void {
        if (!this.loggingEnabled) {
            return; // Do not log if logging is disabled
        }
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}]: ${message}\n`;
        try {
            // Ensure the log directory exists
            if (!fs.existsSync(LOG_DIR)) {
                fs.mkdirSync(LOG_DIR, { recursive: true });
            }
            fs.appendFileSync(LOG_FILE_PATH, logEntry);
        } catch (err) {
            console.error(`Failed to write to log file ${LOG_FILE_PATH}:`, err);
            console.error(logEntry); // Fallback to console if file write fails
        }
    }

    info(message: string): void {
        this.logToFile('info', message);
    }

    error(message: string): void {
        this.logToFile('error', message);
    }

    warn(message: string): void {
        this.logToFile('warn', message);
    }

    logEnvironment(): void {
        this.info('--- Environment Variables ---');
        for (const key in process.env) {
            // Redact sensitive information
            if (key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET') || key.includes('PASSWORD')) {
                this.info(`${key}: [REDACTED]`);
            } else {
                this.info(`${key}: ${process.env[key]}`);
            }
        }
        this.info('-----------------------------');
    }

    logProcessDetails(): void {
        this.info('--- Process Details ---');
        this.info(`Node.js Version: ${process.version}`);
        this.info(`Platform: ${process.platform}`);
        this.info(`Architecture: ${process.arch}`);
        this.info(`Current Working Directory (process.cwd()): ${process.cwd()}`);
        this.info(`Process ID: ${process.pid}`);
        this.info(`Uptime: ${process.uptime()} seconds`);
        this.info(`Arguments: ${process.argv.join(' ')}`);
        this.info('-----------------------');
    }
}

export const logger = new Logger();