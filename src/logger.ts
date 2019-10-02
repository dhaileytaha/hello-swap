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
        level: "info",
    }) as CustomLogger;
}
