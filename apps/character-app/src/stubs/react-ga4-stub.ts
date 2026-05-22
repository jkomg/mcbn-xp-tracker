// No-op react-ga4 stub — analytics removed for MCbN integration
const noop = () => {}

const ReactGA = {
    initialize: noop,
    send: noop,
    event: noop,
    pageview: noop,
    set: noop,
    gtag: noop,
}

export default ReactGA
