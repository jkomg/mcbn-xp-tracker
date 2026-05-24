// No-op posthog stub — analytics removed for MCbN integration
const noop = () => {}

const posthog = {
    identify: noop,
    capture: noop,
    reset: noop,
    opt_in_capturing: noop,
    opt_out_capturing: noop,
    get_explicit_consent_status: () => null as unknown,
    before_send: noop,
}

export default posthog
export { posthog }
