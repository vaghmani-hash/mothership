// Entry of the background host process: started by the app (the app's own binary, run as Node),
// detached, so it outlives the app.

import { appHome } from '../main/paths'
import { startHost } from './server'

process.title = 'Mothership host'
startHost(appHome(), { onExit: () => process.exit(0) })
  .then((host) => {
    // Told to stop: end the sessions and take the socket and pid file away, then exit.
    const stop = (): void => void host.stop().finally(() => process.exit(0))
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
  })
  .catch((err: unknown) => {
    console.error('[host] could not start:', err)
    process.exit(1)
  })
