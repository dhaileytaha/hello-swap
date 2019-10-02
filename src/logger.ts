import minimist from "minimist";
import winston from "winston";

export interface CustomLogger extends winston.Logger {
    error: winston.LeveledLogMethod;
    maker: winston.LeveledLogMethod;
    taker: winston.LeveledLogMethod;
    info: winston.LeveledLogMethod;
    data: winston.LeveledLogMethod;
    verbose: winston.LeveledLogMethod;
}

const colorizer = winston.format.colorize({
    all: true,
    colors: {
        error: "red",
        maker: "cyan",
        taker: "yellow",
        info: "purple",
        data: "grey",
        verbose: "green",
    },
});

export function createLogger() {
    const level = minimist(process.argv.slice(2), {
        default: {
            loglevel: "info",
        },
    }).loglevel;

    if (
        level !== "error" &&
        level !== "info" &&
        level !== "data" &&
        level !== "verbose"
    ) {
        console.log(
            `[error] Invalid log level: ${level}. Choose one from "error", "info", "data" or "verbose"`
        );
        process.exit(1);
    }

    return winston.createLogger({
        levels: {
            error: 0,
            maker: 1,
            taker: 1,
            info: 1,
            data: 2,
            verbose: 3,
        },
        format: winston.format.combine(
            winston.format.simple(),
            winston.format.printf(msg =>
                colorizer.colorize(msg.level, `[${msg.level}] ${msg.message}`)
            )
        ),
        transports: [new winston.transports.Console()],
        level,
    }) as CustomLogger;
}
