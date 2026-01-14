const DRIVER_STATES = {
    ACTIVE:   { label: "active", isDefault: true },
    DISABLED: { label: "disabled" },
    ON_HOLD:  { label: "on hold" }
}


const DRIVER_STATUSES = Object.keys(DRIVER_STATES)

const [DEFAULT_STATUS] =
    Object.entries(DRIVER_STATES).find(([, v]) => v.isDefault) ?? []


module.exports = {
    DRIVER_STATES,

    DRIVER_STATUSES,
    DEFAULT_STATUS
}