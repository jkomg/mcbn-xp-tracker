// No-op react-ga4 stub — analytics removed for MCbN integration
// Accepts and discards any arguments: callers pass real analytics
// payloads, and a zero-arity stub makes every call site a type error.
const noop = (..._args: unknown[]) => {}

const ReactGA = {
    initialize: noop,
    send: noop,
    event: noop,
    pageview: noop,
    set: noop,
    gtag: noop,
}

export default ReactGA
