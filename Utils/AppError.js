class AppError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.status = statusCode || 500
    }
}

// Використання:
// throw new AppError("Booking offer not found", 404);

module.exports = {
    AppError
}